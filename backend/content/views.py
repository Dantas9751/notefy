import uuid

from django.core.files.base import ContentFile
from django.db.models import Count
from django.http import HttpResponse
from django.utils import timezone
from django_filters import rest_framework as filters
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.views import OwnedModelViewSet

from .export_pdf import pdf_filename, render_pdf
from .models import Document
from .schemas import (
    AGGREGATE_TYPES,
    CANVAS_EDGE_TYPES,
    CANVAS_NODE_TYPES,
    COLUMN_TYPES,
    DIAGRAM_EDGE_TYPES,
    DIAGRAM_NODE_TYPES,
    STROKE_TOOLS,
    empty_data_for,
)
from .serializers import (
    DocumentListSerializer,
    DocumentSerializer,
    DocumentUploadSerializer,
)


class DocumentFilter(filters.FilterSet):
    kind = filters.MultipleChoiceFilter(choices=Document.Kind.choices)
    folder = filters.UUIDFilter(field_name="folder_id")
    #: A categoria do item vem da pasta, então filtrar por categoria é
    #: "tudo que está nas pastas dela", em qualquer profundidade.
    category = filters.UUIDFilter(field_name="folder__category_id")
    #: Inclui os itens de toda a subárvore da pasta, não só os filhos
    #: diretos — usado pelo botão "incluir subpastas" na tela da pasta.
    folder_tree = filters.UUIDFilter(method="filter_folder_tree")
    created_after = filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")
    updated_after = filters.DateTimeFilter(field_name="updated_at", lookup_expr="gte")

    class Meta:
        model = Document
        fields = (
            "kind", "status", "folder", "category", "file_kind",
            "is_favorite", "is_pinned", "is_archived",
        )

    def filter_folder_tree(self, queryset, name, value):
        from organization.models import Folder

        folder = Folder.objects.filter(pk=value, owner=self.request.user).first()
        if not folder:
            return queryset.none()
        ids = list(
            Folder.objects.descendants_of(folder, include_self=True).values_list("pk", flat=True)
        )
        return queryset.filter(folder_id__in=ids)


class DocumentViewSet(OwnedModelViewSet):
    """CRUD único para nota, arquivo, planilha, diagrama e canvas."""

    queryset = Document.objects.all()
    filterset_class = DocumentFilter
    search_fields = ("title", "search_text")
    ordering_fields = ("title", "created_at", "updated_at", "status", "word_count", "position")
    ordering = ("-is_pinned", "-updated_at")
    # JSON para os editores, multipart para upload de arquivo.
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def get_serializer_class(self):
        return DocumentListSerializer if self.action == "list" else DocumentSerializer

    def get_queryset(self):
        qs = super().get_queryset().with_relations()
        if self.action == "list":
            # Anexos pertencem ao documento pai e apareceriam soltos na
            # pasta; a listagem mostra só o que é de topo.
            qs = qs.loose().annotate(attachment_count=Count("attachments", distinct=True))
        else:
            qs = qs.prefetch_related("attachments")
        return qs

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Document.objects.filter(pk=instance.pk).update(last_viewed_at=timezone.now())
        return Response(self.get_serializer(instance).data)
    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        if document.is_favorite:
            return Response(
                {"detail": f"'{document.title}' é um item favorito. Remova a estrela dos favoritos antes de excluí-lo."},
                status=status.HTTP_423_LOCKED
            )
        return super().destroy(request, *args, **kwargs)

    # ------------------------------------------------------------------
    # Rotas de apoio
    # ------------------------------------------------------------------
    @action(detail=False, methods=["get"])
    def recent(self, request):
        """Últimos itens mexidos — alimenta o dashboard."""
        qs = self.get_queryset().loose().filter(is_archived=False).order_by("-updated_at")[:12]
        return Response(
            DocumentListSerializer(qs, many=True, context={"request": request}).data
        )

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Contagem por tipo — usada nos cartões do dashboard e nos filtros."""
        counts = dict.fromkeys(Document.Kind.values, 0)
        rows = (
            super()
            .get_queryset()
            .loose()
            .filter(is_archived=False)
            .values("kind")
            .annotate(total=Count("id"))
        )
        for row in rows:
            counts[row["kind"]] = row["total"]
        return Response({"by_kind": counts, "total": sum(counts.values())})

    @action(detail=False, methods=["get"])
    def palette(self, request):
        """Vocabulário dos editores visuais.

        Servido pela API para que as formas e conectores válidos existam num
        lugar só: o backend valida contra esta lista e o frontend monta as
        paletas a partir dela, sem duplicar constantes que sairiam de sincronia.
        """
        return Response(
            {
                "spreadsheet": {
                    "column_types": list(COLUMN_TYPES),
                    "aggregates": list(AGGREGATE_TYPES),
                },
                "diagram": {
                    "node_types": list(DIAGRAM_NODE_TYPES),
                    "edge_types": list(DIAGRAM_EDGE_TYPES),
                },
                "canvas": {
                    "node_types": list(CANVAS_NODE_TYPES),
                    "edge_types": list(CANVAS_EDGE_TYPES),
                    "stroke_tools": list(STROKE_TOOLS),
                },
                "kinds": [
                    {"value": v, "label": l} for v, l in Document.Kind.choices
                ],
                "statuses": [
                    {"value": v, "label": l} for v, l in Document.Status.choices
                ],
                "file_kinds": [
                    {"value": v, "label": l} for v, l in Document.FileKind.choices
                ],
            }
        )

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        """Upload de vários arquivos de uma vez, direto para uma pasta."""
        serializer = DocumentUploadSerializer(
            data={
                "files": request.FILES.getlist("files"),
                "folder": request.data.get("folder") or None,
                "attached_to": request.data.get("attached_to") or None,
            },
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        parent = payload.get("attached_to")

        created = []
        for uploaded in payload["files"]:
            document = Document(
                kind=Document.Kind.FILE,
                title=uploaded.name,
                file=uploaded,
                # Anexo herda a pasta do documento que o hospeda.
                folder=payload.get("folder") or (parent.folder if parent else None),
                attached_to=parent,
                owner=request.user,
            )
            document.save()
            created.append(document)

        return Response(
            DocumentListSerializer(created, many=True, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        original = self.get_object()
        # PK é UUID com default gerado no __init__: zerar o campo faria o
        # INSERT tentar gravar NULL. É preciso atribuir um UUID novo.
        original.pk = uuid.uuid4()
        original._state.adding = True
        original.title = f"{original.title} (cópia)"
        original.is_pinned = False
        original.save()
        return Response(self.get_serializer(original).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="pdf")
    def pdf(self, request, pk=None):
        """Exporta a nota em PDF.

        GET  baixa o arquivo.
        POST guarda o PDF como um documento na mesma pasta da nota — que
             é o "salvar como PDF dentro do Notefy": o resultado vira um
             item comum, com pasta, categoria e busca como qualquer outro.
        """
        document = self.get_object()

        if document.kind != Document.Kind.NOTE:
            return Response(
                {"detail": "Só notas podem ser exportadas em PDF."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            pdf_bytes = render_pdf(document)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        filename = pdf_filename(document)

        if request.method == "GET":
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        saved = Document(
            kind=Document.Kind.FILE,
            title=filename,
            folder=document.folder,
            owner=request.user,
            # Não vira anexo da nota: o usuário pediu um PDF para usar por
            # fora, e um anexo ficaria escondido dentro do documento.
            file=ContentFile(pdf_bytes, name=filename),
        )
        saved.save()

        return Response(
            DocumentListSerializer(saved, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def reset(self, request, pk=None):
        """Esvazia o payload de um editor visual, mantendo o documento."""
        document = self.get_object()
        if document.kind not in Document.RESETTABLE_KINDS:
            return Response(
                {"detail": "Só planilhas, diagramas e canvas podem ser esvaziados."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        document.data = empty_data_for(document.kind)
        document.save()
        return Response(self.get_serializer(document).data)

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """Move o item para outra pasta — o destino do arrastar na sidebar."""
        from organization.models import Folder

        document = self.get_object()
        folder_id = request.data.get("folder")

        if not folder_id:
            return Response(
                {"folder": "Informe a pasta de destino."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        folder = Folder.objects.filter(pk=folder_id, owner=request.user).first()
        if not folder:
            return Response(
                {"folder": "Pasta não encontrada."}, status=status.HTTP_400_BAD_REQUEST
            )

        document.folder = folder
        document.save(update_fields=["folder"])

        # Anexos acompanham o documento: eles não têm pasta própria na
        # interface e ficariam apontando para a pasta antiga.
        document.attachments.update(folder=folder)

        return Response(self.get_serializer(document).data)

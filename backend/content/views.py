import uuid
import zipfile
import io

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db.models import Count, Q

from core.validators import e_uuid
from django.http import HttpResponse
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
    THEME_CHOICES,
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
            "is_favorite", "is_archived",
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
    ordering = ("-is_favorite", "-updated_at")
    # JSON para os editores, multipart para upload de arquivo.
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def get_serializer_class(self):
        return DocumentListSerializer if self.action == "list" else DocumentSerializer

    def get_queryset(self):
        qs = super().get_queryset().with_relations()
        if self.action == "list":
            # Anexos pertencem ao documento pai e apareceriam soltos na
            # pasta; a listagem mostra só o que é de topo.
            # Só os anexos vivos: a exclusão é suave, então sem o filtro
            # o clipe do cartão continuava anunciando um arquivo que já
            # estava na lixeira e não aparecia mais ao abrir o documento.
            qs = qs.loose().annotate(
                attachment_count=Count(
                    "attachments",
                    filter=Q(attachments__deleted_at__isnull=True),
                    distinct=True,
                )
            )
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
                # Vale para os dois editores visuais; fica fora deles para
                # não repetir a mesma lista duas vezes.
                "themes": list(THEME_CHOICES),
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
        # O título é único por pasta: duplicar o MESMO item duas vezes
        # geraria "(cópia)" duas vezes e a segunda estouraria a constraint
        # do model como 500. Desambigua como o resto do app faz.
        titulo = f"{original.title} (cópia)"
        irmaos = set(
            Document.objects.alive()
            .filter(owner=request.user, folder=original.folder, kind=original.kind)
            .values_list("title", flat=True)
        )
        n = 2
        while titulo in irmaos:
            titulo = f"{original.title} (cópia {n})"
            n += 1
        original.title = titulo
        # A cópia nasce sem estrela: favoritar é uma escolha sobre AQUELE
        # item, e herdá-la faria a duplicata disputar o topo da pasta com o
        # original sem ninguém ter pedido.
        original.is_favorite = False
        try:
            original.save()
        except DjangoValidationError as erro:
            # Mesmo com a desambiguação, o clean() do model pode recusar
            # (ex.: pasta cheia de cópias numeradas). Sem este catch, isso
            # vira 500 com página HTML.
            dicionario = getattr(erro, "message_dict", None)
            mensagens = (
                next(iter(dicionario.values()))[0]
                if dicionario
                else getattr(erro, "messages", ["Não foi possível duplicar."])[0]
            )
            return Response({"detail": mensagens}, status=status.HTTP_400_BAD_REQUEST)
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

    @action(detail=True, methods=["post"], parser_classes=[JSONParser])
    def extract(self, request, pk=None):
        """Extrai um .zip para a pasta indicada, criando arquivos.

        Body: { "folder": "<uuid>" }
        Se folder não vier, cria uma pasta com o mesmo nome do zip dentro
        da pasta atual do documento.
        """
        from organization.models import Folder

        doc = self.get_object()

        if not doc.file:
            return Response(
                {"detail": "Este documento não tem arquivo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        nome_lower = (doc.title or doc.original_name or "").lower()
        if not nome_lower.endswith(".zip"):
            return Response(
                {"detail": "Só arquivos .zip podem ser extraídos."},
                status=status.HTTP_400_BAD_REQUEST,
        )

        # Pasta de destino
        folder_id = request.data.get("folder")
        if folder_id:
            destino = Folder.objects.filter(pk=folder_id, owner=request.user).first()
            if not destino:
                return Response(
                    {"detail": "Pasta de destino não encontrada."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            # Cria uma pasta com o mesmo nome do zip dentro da pasta atual
            nome_pasta = doc.title.removesuffix(".zip").removesuffix(".ZIP") or "Extraído"
            # Desambiguar se já existe pasta com esse nome
            base = nome_pasta
            n = 2
            while Folder.objects.filter(
                owner=request.user, parent=doc.folder, name=nome_pasta
            ).exists():
                nome_pasta = f"{base} ({n})"
                n += 1
            destino = Folder.objects.create(
                owner=request.user,
                category=doc.folder.category if doc.folder else None,
                parent=doc.folder,
                name=nome_pasta,
            )

        # Ler o zip
        try:
            doc.file.seek(0)
            conteudo = doc.file.read()
            zf = zipfile.ZipFile(io.BytesIO(conteudo))
        except zipfile.BadZipFile:
            return Response(
                {"detail": "O arquivo não é um .zip válido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        criados = []
        with zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                # Ignorar arquivos do macOS/Windows que começam com ._ ou __MACOSX
                basename = info.filename.split("/")[-1]
                if basename.startswith("._") or basename.startswith("__"):
                    continue
                if not basename:
                    continue
                try:
                    conteudo_arquivo = zf.read(info.filename)
                    # Detectar content-type básico pela extensão
                    ext = basename.rsplit(".", 1)[-1].lower() if "." in basename else ""
                    content_type_map = {
                        "pdf": "application/pdf",
                        "png": "image/png",
                        "jpg": "image/jpeg",
                        "jpeg": "image/jpeg",
                        "gif": "image/gif",
                        "svg": "image/svg+xml",
                        "txt": "text/plain",
                        "md": "text/markdown",
                        "csv": "text/csv",
                        "json": "application/json",
                        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    }
                    # Desambiguar título duplicado (dois arquivos "readme.md"
                    # em pastas diferentes do zip).
                    titulo = basename
                    n = 2
                    while Document.objects.alive().filter(
                        owner=request.user, folder=destino,
                        kind=Document.Kind.FILE, title__iexact=titulo,
                    ).exists():
                        nome_base = basename.rsplit(".", 1)[0] if "." in basename else basename
                        ext = basename.rsplit(".", 1)[1] if "." in basename else ""
                        titulo = f"{nome_base} ({n}).{ext}" if ext else f"{nome_base} ({n})"
                        n += 1
                    documento = Document(
                        kind=Document.Kind.FILE,
                        title=titulo,
                        folder=destino,
                        owner=request.user,
                        file=ContentFile(conteudo_arquivo, name=basename),
                    )
                    documento.save()
                    criados.append(documento)
                except Exception:
                    # Arquivo corrompido ou inválido: pula e continua
                    continue

        return Response(
            {
                "folder": str(destino.id),
                "folder_name": destino.name,
                "extracted": len(criados),
            },
            status=status.HTTP_201_CREATED,
        )

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

        # `e_uuid` antes do `filter`: um id malformado não devolve vazio,
        # derruba a consulta e a resposta vira 500 no lugar do aviso.
        folder = (
            Folder.objects.filter(pk=folder_id, owner=request.user).first()
            if e_uuid(folder_id)
            else None
        )
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


class FavoritesView(APIView):
    """Tudo que o usuário marcou com a estrela, num lugar só.

    Documentos e pastas. Task não tem `is_favorite`, então não entra; criar
    o campo lá seria uma migração que esta feature não pede, e quando ele
    existir basta somar mais um bloco a `itens`.

    A forma do resultado copia a da busca global (`type`, `id`, `title`,
    `subtitle`, `url`) para a tela poder reaproveitar o mesmo cartão.

    Esta é a ÚNICA fonte da lista de favoritos. A barra lateral montava a
    dela com duas chamadas próprias (`/documents/?is_favorite=true` e
    `/folders/?is_favorite=true`), cada uma com sua ordenação: pastas por
    nome, documentos por data, e as pastas sempre na frente. Com a lista
    cortada nos primeiros itens, "quais aparecem" passou a ser uma
    decisão de produto, e duas respostas diferentes para a mesma pergunta
    viraram um bug esperando acontecer. Aqui a ordem é uma só.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        # Imports locais: `organization` e `search` já importam `content`, e
        # trazê-los para o topo fecharia o ciclo. Mesmo recurso que
        # `organization.views._document_count` usa.
        from organization.models import Folder
        from search.views import _DOCUMENT_UI

        itens = []

        documentos = (
            Document.objects.alive()
            .filter(owner=request.user, is_favorite=True)
            .select_related("folder", "folder__category")[:50]
        )
        for doc in documentos:
            meta = _DOCUMENT_UI.get(doc.kind, ("file", "/notes"))
            itens.append(
                {
                    "type": doc.kind,
                    "id": str(doc.id),
                    "title": doc.title,
                    "subtitle": doc.folder.name if doc.folder else "",
                    "url": f"{meta[1]}/{doc.id}",
                    "updated_at": doc.updated_at.isoformat(),
                    # `folder` é o id, não o nome: é o que o menu de
                    # contexto usa para o "Ir para pasta". `color` é a cor
                    # escolhida pelo usuário, que pinta o ícone na lista.
                    "folder": str(doc.folder_id) if doc.folder_id else "",
                    "color": doc.color,
                }
            )

        pastas = (
            Folder.objects.alive()
            .filter(owner=request.user, is_favorite=True)
            .select_related("category")[:20]
        )
        for pasta in pastas:
            itens.append(
                {
                    "type": "folder",
                    "id": str(pasta.id),
                    "title": pasta.name,
                    "subtitle": pasta.category.name if pasta.category else "",
                    "url": f"/folders/{pasta.id}",
                    "updated_at": pasta.updated_at.isoformat(),
                    "folder": "",
                    "color": pasta.color,
                }
            )

        itens.sort(key=lambda i: i["updated_at"], reverse=True)
        return Response({"count": len(itens), "results": itens})

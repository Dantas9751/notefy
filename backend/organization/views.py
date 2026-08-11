from django.db.models import Count
from django_filters import rest_framework as filters
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.views import OwnedModelViewSet

from .models import Category, Folder
from .serializers import (
    CategorySerializer,
    FolderSerializer,
    FolderTreeSerializer,
    validate_unique_folder_name,
)


class CategoryViewSet(OwnedModelViewSet):
    """Categoria — o topo da hierarquia categoria → pasta → item."""

    serializer_class = CategorySerializer
    queryset = Category.objects.all()
    filterset_fields = ("is_pinned",)
    search_fields = ("name", "description")
    ordering_fields = ("name", "position", "created_at")

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .annotate(
                folder_count=Count("folders", distinct=True),
                # Documentos não pendem da categoria: chegam por
                # folders → documents, então a contagem atravessa a pasta.
                document_count=Count("folders__documents", distinct=True),
                task_count=Count("tasks", distinct=True),
            )
        )

    def destroy(self, request, *args, **kwargs):
        # A relação cascateia no banco; a recusa mora aqui. Checar antes de
        # apagar é mais claro (e mais seguro) do que descobrir pelo estrago.
        category = self.get_object()
        if category.folders.exists():
            return Response(
                {
                    "detail": (
                        "Esta categoria ainda tem pastas. Mova ou exclua as pastas "
                        "antes de removê-la."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get"])
    def contents(self, request, pk=None):
        """Pastas raiz da categoria — o segundo nível da navegação."""
        category = self.get_object()
        folders = (
            Folder.objects.filter(owner=request.user, category=category, parent__isnull=True)
            .filter(is_archived=False)
            .select_related("category")
            .annotate(
                document_count=Count("documents", distinct=True),
                child_count=Count("children", distinct=True),
            )
            .order_by("position", "name")
        )

        ctx = {"request": request}
        return Response(
            {
                "category": CategorySerializer(category, context=ctx).data,
                "folders": FolderSerializer(folders, many=True, context=ctx).data,
            }
        )


class FolderFilter(filters.FilterSet):
    parent = filters.UUIDFilter(field_name="parent_id")
    root = filters.BooleanFilter(field_name="parent", lookup_expr="isnull")
    category = filters.UUIDFilter(field_name="category_id")

    class Meta:
        model = Folder
        fields = ("parent", "root", "category", "is_favorite", "is_archived")


class FolderViewSet(OwnedModelViewSet):
    serializer_class = FolderSerializer
    queryset = Folder.objects.all()
    filterset_class = FolderFilter
    search_fields = ("name", "description")
    ordering_fields = ("name", "position", "created_at", "updated_at")

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("category")
            .annotate(
                document_count=Count("documents", distinct=True),
                child_count=Count("children", distinct=True),
            )
        )

    def destroy(self, request, *args, **kwargs):
        folder = self.get_object()
        # Subpastas contam como conteúdo: apagar a raiz levaria o galho
        # inteiro, que é justamente o que queremos que seja deliberado.
        if folder.documents.exists() or folder.children.exists():
            return Response(
                {
                    "detail": (
                        "Esta pasta ainda tem conteúdo. Mova ou exclua os itens e "
                        "subpastas antes de removê-la."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def tree(self, request):
        """Árvore completa agrupada por categoria — o que a sidebar desenha.

        Uma query para as categorias e uma para as pastas. Montar a árvore
        em memória custa O(n) e evita tanto o N+1 de descer recursivamente
        quanto uma CTE recursiva para um volume que cabe na memória.
        """
        include_archived = request.query_params.get("include_archived") == "true"

        folders_qs = self.get_queryset()
        if not include_archived:
            folders_qs = folders_qs.filter(is_archived=False)

        folders = list(folders_qs.order_by("depth", "position", "name"))
        by_id = {folder.id: folder for folder in folders}
        for folder in folders:
            folder._children = []

        roots_by_category = {}
        for folder in folders:
            parent = by_id.get(folder.parent_id)
            # Sem o pai no dicionário (ex.: pai arquivado e filtrado fora),
            # o nó sobe para a raiz em vez de sumir da sidebar.
            if parent is None:
                roots_by_category.setdefault(folder.category_id, []).append(folder)
            else:
                parent._children.append(folder)

        categories = (
            Category.objects.filter(owner=request.user)
            .annotate(
                folder_count=Count("folders", distinct=True),
                document_count=Count("folders__documents", distinct=True),
                task_count=Count("tasks", distinct=True),
            )
            .order_by("-is_pinned", "position", "name")
        )

        ctx = {"request": request}
        return Response(
            [
                {
                    **CategorySerializer(category, context=ctx).data,
                    "folders": FolderTreeSerializer(
                        roots_by_category.get(category.id, []), many=True, context=ctx
                    ).data,
                }
                for category in categories
            ]
        )

    @action(detail=True, methods=["get"])
    def contents(self, request, pk=None):
        """Tudo que mora na pasta: subpastas, documentos e tarefas.

        `documents` traz nota, arquivo, planilha, diagrama e canvas na mesma
        lista — é o que faz a pasta funcionar como um Drive: o usuário vê o
        conteúdo junto, e o `kind` de cada item decide o ícone e para onde
        o clique leva.
        """
        from content.serializers import DocumentListSerializer
        from planner.serializers import TaskSerializer

        folder = self.get_object()
        subfolders = self.get_queryset().filter(parent=folder, is_archived=False)
        documents = (
            folder.documents.filter(is_archived=False)
            .loose()
            .with_relations()
            .order_by("-is_pinned", "-updated_at")
        )
        tasks = folder.tasks.with_relations().order_by("position", "-priority")

        ctx = {"request": request}
        serialized = DocumentListSerializer(documents, many=True, context=ctx).data

        by_kind = {}
        for item in serialized:
            by_kind[item["kind"]] = by_kind.get(item["kind"], 0) + 1

        return Response(
            {
                "folder": FolderSerializer(folder, context=ctx).data,
                "subfolders": FolderSerializer(subfolders, many=True, context=ctx).data,
                "documents": serialized,
                "counts_by_kind": by_kind,
                "tasks": TaskSerializer(tasks, many=True, context=ctx).data,
            }
        )

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """Move a pasta — solta numa categoria (vira raiz) ou noutra pasta.

        É o destino do arrastar na sidebar. As duas formas cabem numa rota
        só porque, do ponto de vista do usuário, é o mesmo gesto.
        """
        folder = self.get_object()
        parent_id = request.data.get("parent")
        category_id = request.data.get("category")

        if parent_id:
            parent = (
                self.get_queryset().filter(pk=parent_id).select_related("category").first()
            )
            if not parent:
                return Response(
                    {"parent": "Pasta de destino não encontrada."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            folder.parent = parent
            folder.category = parent.category  # herda; o save() reforça
        elif category_id:
            category = Category.objects.filter(pk=category_id, owner=request.user).first()
            if not category:
                return Response(
                    {"category": "Categoria não encontrada."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            folder.parent = None
            folder.category = category
        else:
            return Response(
                {"detail": "Informe `parent` (outra pasta) ou `category` (virar raiz)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Soltar numa pasta/categoria que já tem uma pasta de mesmo nome
        # violaria o índice único; avisamos antes de tentar gravar.
        validate_unique_folder_name(
            owner=request.user,
            name=folder.name,
            parent=folder.parent,
            category=folder.category,
            instance=folder,
        )

        self._save_instance(folder)
        return Response(self.get_serializer(folder).data)

    @staticmethod
    def _save_instance(folder):
        """Traduz o ValidationError do model (ciclo, profundidade) em 400."""
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError

        try:
            folder.save()
        except DjangoValidationError as exc:
            raise DRFValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            ) from exc

    @action(detail=True, methods=["get"])
    def descendants(self, request, pk=None):
        folder = self.get_object()
        qs = self.get_queryset().filter(pk__in=folder.descendants.values("pk"))
        return Response(
            FolderSerializer(qs, many=True, context={"request": request}).data
        )

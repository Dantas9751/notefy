from django.db.models import Count, Q
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

#: Contagens que a categoria mostra. `Count` sobre uma relação enxerga tudo,
#: inclusive o que está na lixeira — o filtro por `deleted_at` é o que impede
#: a sidebar de anunciar "8 itens" numa categoria onde só 5 continuam vivos.
#: Definidas uma vez porque `get_queryset` e `tree` precisam das mesmas.
CATEGORY_COUNTS = {
    "folder_count": Count(
        "folders", filter=Q(folders__deleted_at__isnull=True), distinct=True
    ),
    # Documentos não pendem da categoria: chegam por folders → documents,
    # então a contagem atravessa a pasta — e a pasta também precisa estar viva.
    "document_count": Count(
        "folders__documents",
        filter=Q(folders__deleted_at__isnull=True, folders__documents__deleted_at__isnull=True),
        distinct=True,
    ),
    "task_count": Count("tasks", filter=Q(tasks__deleted_at__isnull=True), distinct=True),
}

#: O mesmo para a pasta — o cartão dela anuncia "N item(ns) · M subpasta(s)".
FOLDER_COUNTS = {
    "document_count": Count(
        "documents", filter=Q(documents__deleted_at__isnull=True), distinct=True
    ),
    "child_count": Count(
        "children", filter=Q(children__deleted_at__isnull=True), distinct=True
    ),
}

# --------------------------------------------------------------------------
# Exclusão em cascata
#
# Apagar uma pasta apaga o que está dentro dela — no banco isso já acontece
# sozinho (`on_delete=CASCADE`). O que a API acrescenta é a *pergunta*: se
# ainda houver conteúdo, o primeiro DELETE não apaga nada, devolve 409 com
# `requires_confirmation` e a contagem do que sumiria. O cliente mostra o
# aviso e repete o pedido com `?force=true`.
#
# Duas chamadas em vez de um parâmetro logo na primeira: assim o caminho
# destrutivo nunca é o padrão, nem para um cliente distraído.
# --------------------------------------------------------------------------


def _forced(request):
    return request.query_params.get("force") == "true"


def _document_count(folders):
    """Quantos documentos vivem nestas pastas."""
    # Import local: `content` importa `organization.models`, e um import de
    # módulo aqui fecharia o ciclo.
    from content.models import Document

    return Document.objects.alive().filter(folder__in=folders).count()


def _favoritos_em(folders):
    """Nomes dos favoritos vivos dentro destas pastas — e delas próprias."""
    from content.models import Document

    nomes = [folder.name for folder in folders if folder.is_favorite]
    nomes += list(
        Document.objects.alive()
        .filter(folder__in=folders, is_favorite=True)
        .values_list("title", flat=True)
    )
    return nomes


def blocked_by_favorites(nomes):
    """423 — e `?force=true` não derruba.

    Favorito é uma marca deliberada: a pessoa foi lá e clicou na estrela.
    Excluir a pasta em volta apagaria essa escolha como efeito colateral de
    outra ação, e o aviso genérico de "ainda contém conteúdo" não dá para
    perceber que era ali que estava o material marcado.

    423 e não 409 de propósito: o cliente repete qualquer 409 com
    `?force=true`, e esta recusa não é negociável — primeiro tira a estrela.
    """
    mostrados = ", ".join(nomes[:5])
    resto = f" e mais {len(nomes) - 5}" if len(nomes) > 5 else ""
    return Response(
        {
            "detail": (
                f"Contém favoritos ({mostrados}{resto}). "
                "Remova a estrela deles antes de excluir."
            ),
            "blocked_by_favorites": True,
            "favorites": nomes[:20],
        },
        status=status.HTTP_423_LOCKED,
    )


def needs_confirmation(detail, counts):
    """409 pedindo o segundo DELETE, agora com `?force=true`."""
    return Response(
        {
            "detail": f"{detail} Confirme para excluir tudo.",
            "requires_confirmation": True,
            "counts": counts,
        },
        status=status.HTTP_409_CONFLICT,
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
            .annotate(**CATEGORY_COUNTS)
        )

    def destroy(self, request, *args, **kwargs):
        """Exclui a categoria — com as pastas dentro dela, se confirmado."""
        category = self.get_object()
        # Só o que ainda está vivo conta para o aviso: alertar sobre pastas
        # que já estão na lixeira faria a confirmação pedir cuidado com
        # conteúdo que o usuário já descartou.
        folders = Folder.objects.alive().filter(owner=request.user, category=category)

        # Antes da contagem: a checagem de favoritos não é um aviso que se
        # confirma, é uma parada. Deixá-la depois abriria a brecha de o
        # `?force=true` passar por cima.
        # Só pastas e documentos têm estrela; categoria não tem o campo.
        favoritos = _favoritos_em(folders)
        if favoritos:
            return blocked_by_favorites(favoritos)

        counts = {
            "folders": folders.count(),
            "documents": _document_count(folders),
        }
        if any(counts.values()) and not _forced(request):
            return needs_confirmation(
                f"A categoria “{category.name}” ainda contém conteúdo.", counts
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get"])
    def contents(self, request, pk=None):
        """Pastas raiz da categoria — o segundo nível da navegação."""
        category = self.get_object()
        folders = (
            Folder.objects.alive()
            .filter(owner=request.user, category=category, parent__isnull=True)
            .filter(is_archived=False)
            .select_related("category")
            .annotate(**FOLDER_COUNTS)
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
            .annotate(**FOLDER_COUNTS)
        )

    def destroy(self, request, *args, **kwargs):
        """Exclui a pasta — com a subárvore inteira, se confirmado.

        A contagem cobre TODA a subárvore, não só os filhos diretos: é isso
        que some de fato, e é isso que o aviso precisa dizer.
        """
        folder = self.get_object()
        # `.alive()`: subpastas já na lixeira não devem inflar o aviso de
        # "esta pasta ainda contém conteúdo".
        subtree = Folder.objects.alive().descendants_of(folder, include_self=True)

        # Idem: parada, não aviso. `include_self=True` faz a própria pasta
        # favoritada bloquear a exclusão dela mesma.
        favoritos = _favoritos_em(subtree)
        if favoritos:
            return blocked_by_favorites(favoritos)

        counts = {
            "folders": max(subtree.count() - 1, 0),  # a própria pasta não se conta
            "documents": _document_count(subtree),
        }
        if any(counts.values()) and not _forced(request):
            return needs_confirmation(
                f"A pasta “{folder.name}” ainda contém conteúdo.", counts
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
            Category.objects.alive()
            .filter(owner=request.user)
            .annotate(**CATEGORY_COUNTS)
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
        # `.alive()` explícito: o filtro central de `OwnedModelViewSet` age
        # sobre `get_queryset()`, e estes vêm do gerenciador reverso, que não
        # passa por lá. Sem isto a pasta continua listando o que já está na
        # lixeira — e o item aparece até ser clicado, quando a API responde
        # 404 e a tela quebra sem explicação.
        documents = (
            folder.documents.alive()
            .filter(is_archived=False)
            .loose()
            .with_relations()
            .order_by("-is_pinned", "-updated_at")
        )
        tasks = folder.tasks.alive().with_relations().order_by("position", "-priority")

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

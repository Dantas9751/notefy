from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Category, Folder

#: Formato de um item de breadcrumb, reaproveitado por pastas e notas.
BREADCRUMB_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {"id": {"type": "string"}, "name": {"type": "string"}},
    },
}


class CategorySerializer(serializers.ModelSerializer):
    document_count = serializers.IntegerField(read_only=True)
    folder_count = serializers.IntegerField(read_only=True)
    task_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = (
            "id", "name", "color", "icon", "description", "is_pinned", "position",
            "document_count", "folder_count", "task_count", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value):
        value = value.strip()
        qs = Category.objects.filter(
            owner=self.context["request"].user, name__iexact=value
        )
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Você já tem uma categoria com este nome.")
        return value


class CategoryMiniSerializer(serializers.ModelSerializer):
    """Versão enxuta embutida em notas, pastas e tarefas."""

    class Meta:
        model = Category
        fields = ("id", "name", "color", "icon")


def validate_unique_folder_name(*, owner, name, parent, category, instance=None):
    """Espelha em 400 o índice único que o banco impõe.

    Sem isto, um nome repetido só estouraria como IntegrityError no INSERT
    e chegaria ao usuário como erro 500 sem explicação.
    """
    qs = Folder.objects.filter(owner=owner, name__iexact=(name or "").strip())
    if parent is not None:
        qs = qs.filter(parent=parent)
        onde = "nesta pasta"
    else:
        qs = qs.filter(parent__isnull=True, category=category)
        onde = "nesta categoria"

    if instance is not None:
        qs = qs.exclude(pk=instance.pk)

    if qs.exists():
        raise serializers.ValidationError(
            {"name": f"Já existe uma pasta chamada “{name}” {onde}."}
        )


class OwnedPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """PK field que só aceita objetos do usuário logado.

    Sem isso, um cliente poderia mover a própria nota para dentro da pasta
    de outra pessoa mandando um UUID alheio — o filtro do queryset protege
    a leitura, mas não a escrita de relacionamentos.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return qs.filter(owner=request.user)
        return qs.none()


class FolderSerializer(serializers.ModelSerializer):
    parent = OwnedPrimaryKeyRelatedField(
        queryset=Folder.objects.all(), required=False, allow_null=True
    )
    #: Obrigatória para pasta raiz; numa subpasta é ignorada e herdada do
    #: pai (ver `Folder.save`), por isso não é `required` no serializer.
    category = OwnedPrimaryKeyRelatedField(
        queryset=Category.objects.all(), required=False
    )
    category_detail = CategoryMiniSerializer(source="category", read_only=True)
    document_count = serializers.IntegerField(read_only=True)
    child_count = serializers.IntegerField(read_only=True)
    breadcrumb = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = (
            "id", "name", "parent", "category", "category_detail", "description",
            "color", "icon", "is_favorite", "is_archived", "position", "depth",
            "document_count", "child_count", "breadcrumb", "created_at", "updated_at",
        )
        read_only_fields = ("id", "depth", "created_at", "updated_at")

    @extend_schema_field(BREADCRUMB_SCHEMA)
    def get_breadcrumb(self, obj):
        """Categoria → ancestrais. O topo da trilha é sempre a categoria."""
        crumbs = []
        if obj.category_id:
            crumbs.append(
                {"id": str(obj.category_id), "name": obj.category.name, "type": "category"}
            )
        crumbs += [{"id": str(a.id), "name": a.name, "type": "folder"} for a in obj.ancestors]
        return crumbs

    def validate_name(self, value):
        return value.strip()

    def validate(self, attrs):
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        category = attrs.get("category", getattr(self.instance, "category", None))
        name = attrs.get("name", getattr(self.instance, "name", ""))

        # Pasta raiz sem categoria não teria onde aparecer na navegação,
        # que começa nas categorias.
        if parent is None and category is None:
            raise serializers.ValidationError(
                {"category": "Uma pasta raiz precisa pertencer a uma categoria."}
            )

        # Subpasta herda a categoria do pai — a comparação de nome tem que
        # usar a categoria efetiva, não a que veio no payload.
        if parent is not None:
            category = parent.category

        validate_unique_folder_name(
            owner=self.context["request"].user,
            name=name,
            parent=parent,
            category=category,
            instance=self.instance,
        )
        return attrs


class FolderTreeSerializer(serializers.ModelSerializer):
    """Nó da árvore da sidebar, com filhos aninhados.

    Os filhos vêm de `_children`, preenchido em memória pela view a partir
    de UMA query — não de `obj.children.all()`, que faria uma consulta por
    nó (N+1) e degradaria com a profundidade da árvore.
    """

    children = serializers.SerializerMethodField()
    category_detail = CategoryMiniSerializer(source="category", read_only=True)

    class Meta:
        model = Folder
        fields = (
            "id", "name", "parent", "color", "icon", "depth", "position",
            "is_favorite", "is_archived", "category_detail", "document_count", "children",
        )

    document_count = serializers.IntegerField(read_only=True)

    # A árvore é recursiva e sem profundidade fixa, então o schema declara
    # apenas "lista de objetos" em vez de tentar aninhar indefinidamente.
    @extend_schema_field({"type": "array", "items": {"type": "object"}})
    def get_children(self, obj):
        return FolderTreeSerializer(
            getattr(obj, "_children", []), many=True, context=self.context
        ).data

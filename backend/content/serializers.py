from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from organization.models import Folder
from organization.serializers import (
    BREADCRUMB_SCHEMA,
    CategoryMiniSerializer,
    OwnedPrimaryKeyRelatedField,
)

from .models import Document
from .schemas import empty_data_for, validate_data


class DocumentListSerializer(serializers.ModelSerializer):
    """Payload de listagem — sem `content` nem `data`.

    Uma nota de estudo pode ter dezenas de KB e uma planilha, milhares de
    células; mandar tudo numa listagem de 30 itens tornaria a rolagem da
    pasta lenta. Os payloads pesados só vêm no detalhe.
    """

    #: Categoria vem da pasta — o item não tem categoria própria.
    category = CategoryMiniSerializer(source="folder.category", read_only=True)
    folder_name = serializers.CharField(source="folder.name", read_only=True)
    file_url = serializers.SerializerMethodField()
    attachment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Document
        fields = (
            "id", "kind", "title", "excerpt", "status", "color", "icon",
            "folder", "folder_name", "category",
            "is_favorite", "is_archived", "position",
            "word_count", "attachment_count",
            "file_url", "file_kind", "mime_type", "size", "original_name",
            "created_at", "updated_at",
        )

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request else obj.file.url


class DocumentSerializer(serializers.ModelSerializer):
    """Documento completo. Serve os cinco tipos.

    Os campos de todos os tipos vêm sempre presentes (nulos/vazios quando
    não se aplicam) para que o frontend não precise de um serializer
    diferente por tipo — ele lê `kind` e renderiza o editor certo.
    """

    #: Obrigatória: a hierarquia é categoria → pasta → item, e não existe
    #: lugar para um item fora de uma pasta.
    folder = OwnedPrimaryKeyRelatedField(queryset=Folder.objects.all())
    category = CategoryMiniSerializer(source="folder.category", read_only=True)
    attached_to = OwnedPrimaryKeyRelatedField(
        queryset=Document.objects.all(), required=False, allow_null=True
    )
    attachments = DocumentListSerializer(many=True, read_only=True)
    file_url = serializers.SerializerMethodField()
    breadcrumb = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Document
        fields = (
            "id", "kind", "kind_label", "title", "status", "color", "icon",
            "folder", "breadcrumb", "category",
            "is_favorite", "is_archived", "position",
            "content", "content_format", "data",
            "file", "file_url", "file_kind", "mime_type", "size", "original_name",
            "attached_to", "attachments",
            "excerpt", "word_count", "last_viewed_at", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "excerpt", "word_count", "last_viewed_at", "created_at", "updated_at",
            "file_kind", "mime_type", "size", "original_name",
        )
        extra_kwargs = {"file": {"write_only": True, "required": False}}

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request else obj.file.url

    @extend_schema_field(BREADCRUMB_SCHEMA)
    def get_breadcrumb(self, obj):
        """Categoria → pasta raiz → ... → pasta do item.

        A categoria abre o caminho porque é o topo da hierarquia; sem ela o
        usuário perderia a referência de onde está.
        """
        if not obj.folder_id:
            return []
        folder = obj.folder
        crumbs = []
        if folder.category_id:
            crumbs.append(
                {"id": str(folder.category_id), "name": folder.category.name, "type": "category"}
            )
        crumbs += [
            {"id": str(a.id), "name": a.name, "type": "folder"} for a in folder.ancestors
        ]
        crumbs.append({"id": str(folder.id), "name": folder.name, "type": "folder"})
        return crumbs

    # ------------------------------------------------------------------
    # Validação
    # ------------------------------------------------------------------
    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("O título não pode ficar vazio.")
        return value

    def validate_file(self, value):
        if value and value.size > settings.MAX_UPLOAD_SIZE:
            limit_mb = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
            raise serializers.ValidationError(f"Arquivo maior que o limite de {limit_mb} MB.")
        return value

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", Document.Kind.NOTE))

        # Um arquivo sem arquivo não é nada: só faz sentido exigir isso na
        # criação, porque num PATCH o arquivo já está gravado.
        if kind == Document.Kind.FILE and self.instance is None and not attrs.get("file"):
            raise serializers.ValidationError(
                {"file": "Documentos do tipo arquivo exigem um upload."}
            )

        if kind != Document.Kind.FILE and attrs.get("file"):
            raise serializers.ValidationError(
                {"file": f"Documentos do tipo '{kind}' não aceitam upload de arquivo."}
            )

        data = attrs.get("data")
        if data is not None and kind in Document.EDITABLE_KINDS:
            try:
                validate_data(kind, data)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    exc.message_dict if hasattr(exc, "message_dict") else exc.messages
                ) from exc

        return attrs

    def create(self, validated_data):
        kind = validated_data.get("kind", Document.Kind.NOTE)
        # Uma planilha nasce com colunas e linhas, um canvas com viewport:
        # sem isso o editor abriria numa tela quebrada e teria que tratar
        # o caso "payload ausente" em toda parte.
        if kind in Document.EDITABLE_KINDS and not validated_data.get("data"):
            validated_data["data"] = empty_data_for(kind)
        return super().create(validated_data)


class DocumentUploadSerializer(serializers.Serializer):
    """Upload em lote — a rota que a tela de pasta usa para o drag-and-drop."""

    files = serializers.ListField(child=serializers.FileField(), allow_empty=False)
    #: Opcional só porque um anexo herda a pasta do documento que o hospeda;
    #: fora esse caso, `validate` exige a pasta.
    folder = OwnedPrimaryKeyRelatedField(
        queryset=Folder.objects.all(), required=False, allow_null=True
    )
    attached_to = OwnedPrimaryKeyRelatedField(
        queryset=Document.objects.all(), required=False, allow_null=True
    )

    def validate(self, attrs):
        if not attrs.get("folder") and not attrs.get("attached_to"):
            raise serializers.ValidationError(
                {"folder": "Escolha a pasta de destino do upload."}
            )
        return attrs

    def validate_files(self, value):
        limit_mb = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
        for uploaded in value:
            if uploaded.size > settings.MAX_UPLOAD_SIZE:
                raise serializers.ValidationError(
                    f"'{uploaded.name}' passa do limite de {limit_mb} MB."
                )
        return value

    def validate_attached_to(self, value):
        # Rejeitamos aqui, antes de qualquer byte ir para o disco. O model
        # repete a regra no save() para quem escreve pelo shell ou admin,
        # mas ali o erro sairia como 500 e deixaria arquivo órfão.
        if value and value.attached_to_id:
            raise serializers.ValidationError(
                "Não é possível anexar um arquivo a outro anexo."
            )
        return value

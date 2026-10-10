import copy

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.idioma import texto
from core.validators import normalizar_nome
from organization.models import Category, Folder
from organization.serializers import (
    BREADCRUMB_SCHEMA,
    CategoryMiniSerializer,
    OwnedPrimaryKeyRelatedField,
    trilha_ate,
)

from .conversao import destinos
from .models import Document, Template
from .schemas import empty_data_for, validate_data


class CamposDeArquivo(serializers.Serializer):
    """O que um arquivo importado mostra, igual na listagem e no detalhe."""

    file_url = serializers.SerializerMethodField()
    #: Formatos para os quais dá para converter. Vazio fora de arquivo
    #: importado: nota, planilha e os outros itens do app não convertem.
    conversoes = serializers.SerializerMethodField()

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request else obj.file.url

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_conversoes(self, obj):
        if obj.kind != Document.Kind.FILE:
            return []
        return destinos(obj.original_name or obj.title)


class DocumentListSerializer(CamposDeArquivo, serializers.ModelSerializer):
    """Payload de listagem — sem `content` nem `data`.

    Uma nota de estudo pode ter dezenas de KB e uma planilha, milhares de
    células; mandar tudo numa listagem de 30 itens tornaria a rolagem da
    pasta lenta. Os payloads pesados só vêm no detalhe.
    """

    #: A categoria HERDADA da pasta — onde o item mora.
    category = CategoryMiniSerializer(source="folder.category", read_only=True)
    #: As etiquetas do próprio item. Só leitura aqui: a listagem mostra,
    #: quem edita é o modal de propriedades.
    categories_detail = CategoryMiniSerializer(
        source="categories", many=True, read_only=True
    )
    folder_name = serializers.CharField(source="folder.name", read_only=True)
    attachment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Document
        fields = (
            "id", "kind", "title", "excerpt", "status", "color", "icon",
            "folder", "folder_name", "category", "categories_detail",
            "is_favorite", "is_archived", "is_read_only", "position",
            "word_count", "attachment_count",
            "file_url", "file_kind", "mime_type", "size", "original_name", "conversoes",
            "created_at", "updated_at",
        )


class DocumentSerializer(CamposDeArquivo, serializers.ModelSerializer):
    """Documento completo. Serve os cinco tipos.

    Os campos de todos os tipos vêm sempre presentes (nulos/vazios quando
    não se aplicam) para que o frontend não precise de um serializer
    diferente por tipo — ele lê `kind` e renderiza o editor certo.
    """

    #: Obrigatória: a hierarquia é categoria → pasta → item, e não existe
    #: lugar para um item fora de uma pasta.
    folder = OwnedPrimaryKeyRelatedField(queryset=Folder.objects.all())
    #: A categoria HERDADA da pasta — onde o item mora.
    category = CategoryMiniSerializer(source="folder.category", read_only=True)
    #: As etiquetas do próprio item — o que ele é. `OwnedPrimaryKeyRelatedField`
    #: e não `PrimaryKeyRelatedField`: sem ele o cliente poderia etiquetar a
    #: própria nota com a categoria de outra pessoa mandando o UUID alheio.
    categories = OwnedPrimaryKeyRelatedField(
        queryset=Category.objects.all(), many=True, required=False
    )
    categories_detail = CategoryMiniSerializer(
        source="categories", many=True, read_only=True
    )
    attached_to = OwnedPrimaryKeyRelatedField(
        queryset=Document.objects.all(), required=False, allow_null=True
    )
    attachments = DocumentListSerializer(many=True, read_only=True)
    breadcrumb = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Document
        fields = (
            "id", "kind", "kind_label", "title", "status", "color", "icon",
            "folder", "breadcrumb", "category", "categories", "categories_detail",
            "is_favorite", "is_archived", "is_read_only", "position",
            "content", "content_format", "data",
            "file", "file_url", "file_kind", "mime_type", "size", "original_name", "conversoes",
            "attached_to", "attachments",
            "excerpt", "word_count", "last_viewed_at", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "excerpt", "word_count", "last_viewed_at", "created_at", "updated_at",
            "file_kind", "mime_type", "size", "original_name",
        )
        extra_kwargs = {"file": {"write_only": True, "required": False}}

    @extend_schema_field(BREADCRUMB_SCHEMA)
    def get_breadcrumb(self, obj):
        """Categoria → pasta raiz → ... → pasta do item.

        A categoria abre o caminho porque é o topo da hierarquia; sem ela o
        usuário perderia a referência de onde está.
        """
        if not obj.folder_id:
            return []
        folder = obj.folder
        return [*trilha_ate(folder), {"id": str(folder.id), "name": folder.name, "type": "folder"}]

    # ------------------------------------------------------------------
    # Validação
    # ------------------------------------------------------------------
    def validate_title(self, value):
        value = normalizar_nome(value)
        if not value:
            raise serializers.ValidationError("O título não pode ficar vazio.")
        return value

    def validate_file(self, value):
        if value and value.size > settings.MAX_UPLOAD_SIZE:
            limit_mb = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
            raise serializers.ValidationError(f"Arquivo maior que o limite de {limit_mb} MB.")
        return value

    def validate(self, attrs):
        # O tipo nasce com o item e não muda. Um PATCH com outro `kind`
        # passava: a nota virava "planilha" carregando dados de nota (o
        # editor abria quebrado) ou "arquivo" sem arquivo nenhum. O editor
        # manda o `kind` em todo salvamento, então só a MUDANÇA é recusada.
        if self.instance is not None and "kind" in attrs and attrs["kind"] != self.instance.kind:
            raise serializers.ValidationError(
                {"kind": "O tipo de um item não muda depois de criado."}
            )

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


class TemplateListSerializer(serializers.ModelSerializer):
    """Modelo na listagem: sem o `data`, que pode ser uma nota inteira.

    A galeria mostra nome, tipo e o começo do texto; o conteúdo só viaja
    quando alguém abre o modelo para ver ou usar.
    """

    excerpt = serializers.CharField(read_only=True)

    class Meta:
        model = Template
        fields = ("id", "name", "description", "kind", "excerpt", "created_at", "updated_at")
        read_only_fields = fields


class TemplateSerializer(serializers.ModelSerializer):
    """Modelo completo.

    Nasce de dois jeitos: com `kind` e `data` prontos, ou com `document`,
    o item que a pessoa mandou "salvar como modelo". No segundo, tipo e
    conteúdo são COPIADOS do documento no servidor: o cliente não precisa
    baixar o item para mandá-lo de volta, e não tem como dizer que um
    documento de outra conta é dele.
    """

    excerpt = serializers.CharField(read_only=True)
    document = serializers.PrimaryKeyRelatedField(
        queryset=Document.objects.none(), write_only=True, required=False
    )

    class Meta:
        model = Template
        fields = (
            "id", "name", "description", "kind", "data", "excerpt",
            "document", "created_at", "updated_at",
        )
        read_only_fields = ("id", "excerpt", "created_at", "updated_at")
        extra_kwargs = {
            "kind": {"required": False},
            "data": {"required": False},
            "name": {"required": False},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["document"].queryset = Document.objects.alive().filter(
                owner=request.user, kind__in=Document.EDITABLE_KINDS
            )

    def validate_name(self, value):
        return normalizar_nome(value)

    def validate(self, attrs):
        documento = attrs.pop("document", None)
        if self.instance is not None:
            # Editar um modelo é trocar nome e descrição. O conteúdo de um
            # molde muda salvando de novo a partir de um item.
            attrs.pop("kind", None)
            attrs.pop("data", None)
            return attrs

        if documento is not None:
            attrs["kind"] = documento.kind
            attrs["data"] = copy.deepcopy(documento.data or {})
            attrs.setdefault("name", normalizar_nome(documento.title)[:120])
        if attrs.get("kind") not in Document.EDITABLE_KINDS:
            raise serializers.ValidationError(
                {"kind": texto("Só nota, planilha, diagrama, canvas e design viram modelo.",
                               "Only notes, spreadsheets, diagrams, canvases and designs can become templates.")}
            )
        if not attrs.get("name"):
            raise serializers.ValidationError({"name": texto("Dê um nome ao modelo.", "Give the template a name.")})
        dados = attrs.get("data")
        if dados is None:
            attrs["data"] = empty_data_for(attrs["kind"])
        elif not isinstance(dados, dict):
            raise serializers.ValidationError({"data": texto("Conteúdo inválido.", "Invalid content.")})
        try:
            validate_data(attrs["kind"], attrs["data"])
        except DjangoValidationError as erro:
            raise serializers.ValidationError(getattr(erro, "message_dict", {"data": erro.messages}))
        return attrs

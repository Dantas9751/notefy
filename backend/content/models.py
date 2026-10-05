"""Documentos — a unidade única de conteúdo do Notefy.

Nota, arquivo, planilha, diagrama e canvas são o MESMO modelo, separados
apenas pelo campo `kind`. A alternativa — uma tabela por tipo — obrigaria
cada pasta a consultar cinco tabelas, cada filtro a ser escrito cinco
vezes e a busca a ter cinco ramos. Aqui, "o que tem nesta pasta?" é uma
query só, e um tipo novo custa uma entrada no enum.

O preço é um punhado de colunas que só valem para certos tipos
(`file` para arquivos, `content` para notas, `data` para os editores
visuais). É um preço barato: coluna nula quase não ocupa espaço, e
a coesão que se ganha na API e na interface é o objetivo do produto.
"""

import hashlib
import mimetypes
import re
import uuid

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.db.models.functions import Lower

from core.idioma import texto
from core.models import BaseModel, OwnedModel, SoftDeleteQuerySet, TimeStampedModel, UUIDModel
from core.validators import hex_color_validator, icon_name_validator, normalizar_nome
from organization.models import Folder

from .schemas import empty_data_for, extract_text, secao_tem_conteudo, validate_data

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
#: Separadores comuns em nome de arquivo: _ - . e afins.
_SEPARATOR_RE = re.compile(r"[._\-+()\[\]]+")

# No Windows o `mimetypes` lê o registro da máquina: lá `.webp`, `.docx` e
# `.md` podem nem existir (viravam "Outro", e a foto caía em Documentos) e
# `.zip` vira "x-zip-compressed". A categoria do arquivo não pode mudar de
# PC para PC, então os tipos que `Document.detect_file_kind` usa ficam fixos.
# Vale para o processo todo, inclusive para servir `/media/`.
for _extensao, _tipo in {
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".7z": "application/x-7z-compressed",
    ".rar": "application/x-rar-compressed",
    ".gz": "application/gzip",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".csv": "text/csv",
}.items():
    mimetypes.add_type(_tipo, _extensao)


#: Mesmo valor do `max_length` de `Document.title`. Repetido aqui porque
#: a função abaixo roda antes da classe existir.
TITULO_MAX = 250


def titulo_de_arquivo(nome):
    """O nome de um arquivo enviado, cabendo no título.

    O Django corta o nome do upload em 255 caracteres e o título aceita
    250: um nome longo chegava inteiro ao `full_clean()` e o upload caía.
    Corta a BASE e preserva a extensão, que é o que diz que "relatorio
    ...pdf" é um PDF.
    """
    nome = normalizar_nome(nome or "")
    if len(nome) <= TITULO_MAX:
        return nome
    base, ponto, extensao = nome.rpartition(".")
    if not ponto or len(extensao) > 12:
        return nome[:TITULO_MAX]
    return f"{base[: TITULO_MAX - len(extensao) - 1]}.{extensao}"


def document_upload_path(instance, filename):
    """`files/<usuário>/<ano>/<mês>/<uuid>.<ext>`.

    Particionar por usuário e data evita diretórios com dezenas de milhares
    de arquivos, e o nome em UUID elimina colisões e path traversal vindo
    do nome original enviado pelo cliente.
    """
    ext = filename.rsplit(".", 1)[-1].lower()[:12] if "." in filename else "bin"
    # Num INSERT o `created_at` (auto_now_add) ainda não foi preenchido
    # quando o storage pede o caminho; usamos a hora atual, que é o mesmo
    # instante que o campo receberá.
    created = instance.created_at or timezone.now()
    return f"files/{instance.owner_id}/{created.year}/{created.month:02d}/{uuid.uuid4().hex}.{ext}"


class DocumentQuerySet(SoftDeleteQuerySet):
    def active(self):
        return self.filter(is_archived=False)

    def with_relations(self):
        # `categories` é M2M e os dois serializers a expõem: sem o
        # prefetch, listar 30 itens dispara 30 consultas extras. Fica
        # aqui porque é o ponto único por onde toda listagem passa.
        return self.select_related("folder", "folder__category", "owner").prefetch_related(
            "categories"
        )

    def loose(self):
        """Documentos de topo — exclui arquivos anexados a outro documento."""
        return self.filter(attached_to__isnull=True)



class Document(BaseModel):
    """Qualquer conteúdo do usuário, seja qual for o formato."""

    class Kind(models.TextChoices):
        NOTE = "note", "Nota"
        FILE = "file", "Arquivo"
        SPREADSHEET = "spreadsheet", "Planilha"
        DIAGRAM = "diagram", "Diagrama"
        CANVAS = "canvas", "Canvas"

    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        IN_PROGRESS = "in_progress", "Em progresso"
        DONE = "done", "Finalizado"

    class Format(models.TextChoices):
        HTML = "html", "Texto rico"
        MARKDOWN = "markdown", "Markdown"
        PLAIN = "plain", "Texto puro"

    class FileKind(models.TextChoices):
        IMAGE = "image", "Imagem"
        AUDIO = "audio", "Áudio"
        VIDEO = "video", "Vídeo"
        PDF = "pdf", "PDF"
        DOCUMENT = "document", "Documento"
        ARCHIVE = "archive", "Compactado"
        OTHER = "other", "Outro"

    #: Tipos que o usuário cria e edita dentro do app.
    EDITABLE_KINDS = (Kind.NOTE, Kind.SPREADSHEET, Kind.DIAGRAM, Kind.CANVAS)

    #: Tipos cujo payload pode ser esvaziado pela rota /reset/.
    RESETTABLE_KINDS = (Kind.SPREADSHEET, Kind.DIAGRAM, Kind.CANVAS)

    _FILE_KIND_BY_PREFIX = (
        ("image/", FileKind.IMAGE),
        ("audio/", FileKind.AUDIO),
        ("video/", FileKind.VIDEO),
    )
    _FILE_KIND_BY_MIME = {
        "application/pdf": FileKind.PDF,
        "application/zip": FileKind.ARCHIVE,
        "application/x-7z-compressed": FileKind.ARCHIVE,
        "application/x-rar-compressed": FileKind.ARCHIVE,
        "application/gzip": FileKind.ARCHIVE,
        "application/msword": FileKind.DOCUMENT,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": FileKind.DOCUMENT,
        "application/vnd.ms-excel": FileKind.DOCUMENT,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": FileKind.DOCUMENT,
        "application/vnd.ms-powerpoint": FileKind.DOCUMENT,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": FileKind.DOCUMENT,
        "text/plain": FileKind.DOCUMENT,
        "text/markdown": FileKind.DOCUMENT,
        "text/csv": FileKind.DOCUMENT,
    }

    # ------------------------------------------------------------------
    # Comum a todos os tipos
    # ------------------------------------------------------------------
    kind = models.CharField(
        "tipo", max_length=16, choices=Kind.choices, default=Kind.NOTE, db_index=True
    )
    title = models.CharField("título", max_length=TITULO_MAX)

    folder = models.ForeignKey(
        Folder,
        on_delete=models.CASCADE,
        related_name="documents",
        verbose_name="pasta",
    )

    status = models.CharField(
        "status", max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    color = models.CharField(
        "cor", max_length=7, blank=True, validators=[hex_color_validator]
    )
    icon = models.CharField(
        "ícone", max_length=64, blank=True, validators=[icon_name_validator]
    )
    is_favorite = models.BooleanField("favorito", default=False)
    is_archived = models.BooleanField("arquivado", default=False)
    #: Como o atributo do Windows: protege o CONTEÚDO (`data`, `content`,
    #: arquivo). Nome, pasta, etiquetas e estrela continuam mudando. Quem
    #: confere é a view (`SomenteLeitura`), não o save(): o backup e as
    #: migrações precisam gravar o item como ele é.
    is_read_only = models.BooleanField("somente leitura", default=False)
    position = models.FloatField("posição", default=0)

    attached_to = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments",
        verbose_name="anexado a",
    )

    # ------------------------------------------------------------------
    # kind = note
    # ------------------------------------------------------------------
    content = models.TextField("conteúdo", blank=True)
    content_format = models.CharField(
        "formato", max_length=10, choices=Format.choices, default=Format.HTML
    )

    # ------------------------------------------------------------------
    # kind = spreadsheet | diagram | canvas  (formato em content/schemas.py)
    # ------------------------------------------------------------------
    data = models.JSONField("dados", default=dict, blank=True)

    # ------------------------------------------------------------------
    # kind = file
    # ------------------------------------------------------------------
    file = models.FileField(
        "arquivo", upload_to=document_upload_path, max_length=400, null=True, blank=True
    )
    original_name = models.CharField("nome original", max_length=255, blank=True)
    mime_type = models.CharField(max_length=150, blank=True)
    size = models.PositiveBigIntegerField("tamanho em bytes", default=0)
    checksum = models.CharField(max_length=64, blank=True, db_index=True)
    file_kind = models.CharField(
        "categoria do arquivo",
        max_length=16,
        choices=FileKind.choices,
        blank=True,
        db_index=True,
    )

    #: Etiquetas do item, somadas à categoria que ele herda da pasta.
    #:
    #: Pasta é hierarquia: um item mora em UM lugar. Etiqueta é
    #: transversal: a mesma nota é "Cálculo III" (onde ela mora), "prova"
    #: e "revisar" (o que ela é). Sem isto, a única classificação possível
    #: era a da pasta, e marcar um item como "revisar" exigia movê-lo.
    #:
    #: Mesmo campo que `planner.Task` já usa — o vocabulário de categoria
    #: é um só no app inteiro.
    categories = models.ManyToManyField(
        "organization.Category", blank=True, related_name="documents"
    )

    # ------------------------------------------------------------------
    # Derivados — mantidos pelo save(), nunca escritos pelo cliente
    # ------------------------------------------------------------------
    excerpt = models.CharField("resumo", max_length=320, blank=True, editable=False)
    word_count = models.PositiveIntegerField(default=0, editable=False)
    search_text = models.TextField(blank=True, editable=False)

    last_viewed_at = models.DateTimeField(null=True, blank=True, editable=False)

    objects = DocumentQuerySet.as_manager()

    class Meta:
        verbose_name = "documento"
        verbose_name_plural = "documentos"
        # Favoritar já fixa: a estrela é o único conceito de destaque do
        # item, então ela também manda na ordem dentro da pasta.
        ordering = ("-is_favorite", "-updated_at")
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(attached_to=models.F("id")),
                name="document_cannot_attach_to_itself",
            ),
            # Anexo fica de fora: ele não aparece na listagem da pasta, e o
            # nome único existe justamente para a listagem não mostrar dois
            # itens iguais. Com anexo dentro da regra, todo print colado
            # chega como "image.png" e o SEGUNDO Ctrl+V da pasta estourava.
            models.UniqueConstraint(
                "owner", "folder", "kind", Lower("title"),
                name="unique_document_title_per_kind_and_folder",
                condition=models.Q(deleted_at__isnull=True, attached_to__isnull=True),
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "kind"]),
            models.Index(fields=["owner", "folder"]),
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "-updated_at"]),
            models.Index(fields=["folder", "-updated_at"]),
        ]

    def __str__(self):
        return self.title or self.original_name or str(self.pk)

    # ------------------------------------------------------------------
    # Validação
    # ------------------------------------------------------------------
    def _validate_attachment(self):
        """Regras de anexo."""
        if not self.attached_to_id:
            return

        parent = self.attached_to
        if parent.owner_id != self.owner_id:
            raise ValidationError({"attached_to": "O documento pertence a outro usuário."})
        if self.kind != self.Kind.FILE:
            raise ValidationError(
                {"attached_to": "Só arquivos podem ser anexados a outro documento."}
            )
        if parent.attached_to_id:
            raise ValidationError(
                {"attached_to": "Não é possível anexar um arquivo a outro anexo."}
            )

    @property
    def category(self):
        return self.folder.category if self.folder_id else None

    def clean(self):
        super().clean()

        if self.folder_id and self.folder.owner_id != self.owner_id:
            raise ValidationError({"folder": "A pasta pertence a outro usuário."})

        self._validate_attachment()

        # Mesmo tipo, mesmo nome, mesma pasta: não pode. Anexo não entra na
        # conta (ver a `UniqueConstraint` em Meta).
        if self.title and self.kind and self.folder_id and not self.attached_to_id:
            qs = Document.objects.alive().filter(
                folder_id=self.folder_id,
                kind=self.kind,
                title__iexact=self.title,
                attached_to__isnull=True,
            )
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exists():
                raise ValidationError({
                    "title": f"Já existe um(a) {self.get_kind_display().lower()} com este nome nesta pasta."
                })

        if self.kind in self.EDITABLE_KINDS and self.data:
            validate_data(self.kind, self.data)

    # ------------------------------------------------------------------
    # Derivação
    # ------------------------------------------------------------------
    def _plain_text(self):
        if self.kind == self.Kind.NOTE:
            if isinstance(self.data, dict) and self.data.get("sections"):
                return extract_text(self.kind, self.data)
            return _WS_RE.sub(" ", _TAG_RE.sub(" ", self.content or "")).strip()
        if self.kind == self.Kind.FILE:
            name = self.original_name or ""
            words = _SEPARATOR_RE.sub(" ", name).strip()
            parts = [name, words] if words and words != name else [name]
            if self.content:
                parts.append(self.content)
            return " ".join(p for p in parts if p)
        return extract_text(self.kind, self.data)

    @classmethod
    def detect_file_kind(cls, mime_type):
        for prefix, kind in cls._FILE_KIND_BY_PREFIX:
            if mime_type.startswith(prefix):
                return kind
        return cls._FILE_KIND_BY_MIME.get(mime_type, cls.FileKind.OTHER)

    def _absorb_uploaded_file(self):
        self.original_name = getattr(self.file, "name", "")[:255]
        self.size = getattr(self.file, "size", 0) or 0
        self.mime_type = (
            mimetypes.guess_type(self.original_name)[0] or "application/octet-stream"
        )
        self.file_kind = self.detect_file_kind(self.mime_type)
        self.checksum = self._compute_checksum()
        if not self.title:
            self.title = titulo_de_arquivo(self.original_name)

    def _compute_checksum(self):
        digest = hashlib.sha256()
        try:
            self.file.open("rb")
            for chunk in self.file.chunks(chunk_size=1024 * 1024):
                digest.update(chunk)
        finally:
            self.file.seek(0)
        return digest.hexdigest()

    def save(self, *args, **kwargs):
        self.full_clean()  
        self._validate_attachment()

        if self.attached_to_id:
            self.folder_id = self.attached_to.folder_id

        if self.file and not getattr(self.file, "_committed", True):
            self._absorb_uploaded_file()

        if self.kind in self.EDITABLE_KINDS and not self.data:
            self.data = empty_data_for(self.kind)

        if self.kind == self.Kind.NOTE and self.content:
            sections = self.data.get("sections") or []
            if not any(secao_tem_conteudo(s) for s in sections):
                self.data = {
                    **self.data,
                    "sections": [{"id": "s1", "type": "text", "html": self.content}],
                }

        text = self._plain_text()
        self.search_text = text[:20000]
        self.excerpt = text[:317] + "..." if len(text) > 320 else text
        self.word_count = len(text.split()) if text else 0

        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {
                "excerpt", "word_count", "search_text",
            }

        super().save(*args, **kwargs)

class Template(UUIDModel, TimeStampedModel, OwnedModel):
    """Modelo salvo pela pessoa: o ponto de partida de um item novo.

    Fora de `Document` de propósito. Documento mora numa pasta e aparece na
    busca, na lixeira, nos recentes e no quadro; modelo não é conteúdo, é
    molde. Como documento marcado, cada listagem do app teria de lembrar de
    escondê-lo, e a primeira que esquecesse mostraria moldes no meio das
    notas.

    Os modelos que vêm com o app não estão aqui: moram no frontend
    (`lib/modelos.js`), porque são texto de interface, traduzido junto com
    o resto, e não dado de ninguém.

    Sem lixeira: excluir um modelo não toca em nada criado a partir dele.
    """

    name = models.CharField("nome", max_length=120)
    description = models.CharField("descrição", max_length=300, blank=True, default="")
    kind = models.CharField("tipo", max_length=16, choices=Document.Kind.choices)
    data = models.JSONField("dados", default=dict, blank=True)

    class Meta:
        verbose_name = "modelo"
        verbose_name_plural = "modelos"
        ordering = ("-updated_at",)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Mesma porta do `Document.save()`: o conteúdo passa pelo
        # `validate_data` venha de onde vier — API, backup ou shell.
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.kind not in Document.EDITABLE_KINDS:
            raise ValidationError(
                {"kind": texto("Só nota, planilha, diagrama e canvas viram modelo.",
                               "Only notes, spreadsheets, diagrams and canvases can become templates.")}
            )
        validate_data(self.kind, self.data or {})

    @property
    def excerpt(self):
        """Começo do texto, para o cartão mostrar do que o modelo trata."""
        texto_puro = extract_text(self.kind, self.data or {})
        return texto_puro[:157] + "..." if len(texto_puro) > 160 else texto_puro

"""Documentos — a unidade única de conteúdo do Notefy.

Nota, arquivo, planilha, diagrama e canvas são o MESMO modelo, separados
apenas pelo campo `kind`. A alternativa — uma tabela por tipo — obrigaria
cada pasta a consultar cinco tabelas, cada filtro a ser escrito cinco
vezes e a busca a ter cinco ramos. Aqui, "o que tem nesta pasta?" é uma
query só, e um tipo novo custa uma entrada no enum.

O preço é um punhado de colunas que só valem para certos tipos
(`file` para arquivos, `content` para notas, `data` para os editores
visuais). É um preço barato: no Postgres coluna nula não ocupa espaço, e
a coesão que se ganha na API e na interface é o objetivo do produto.
"""

import hashlib
import mimetypes
import re
import uuid

from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.models import BaseModel
from core.validators import hex_color_validator, icon_name_validator
from organization.models import Folder

from .schemas import empty_data_for, extract_text, validate_data

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
#: Separadores comuns em nome de arquivo: _ - . e afins.
_SEPARATOR_RE = re.compile(r"[._\-+()\[\]]+")


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


#: Nome antigo de `document_upload_path`, de quando arquivos viviam num
#: modelo `Attachment` separado. As migrations históricas importam este
#: símbolo e quebrariam sem ele; manter o alias é mais seguro do que
#: reescrever migrations já aplicadas em bancos existentes.
attachment_upload_path = document_upload_path


class DocumentQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_archived=False)

    def of_kind(self, *kinds):
        return self.filter(kind__in=kinds)

    def with_relations(self):
        return self.select_related("folder", "folder__category", "owner")

    def loose(self):
        """Documentos de topo — exclui arquivos anexados a outro documento."""
        return self.filter(attached_to__isnull=True)

    def in_category(self, category_id):
        """Tudo que está nas pastas de uma categoria, em qualquer nível."""
        return self.filter(folder__category_id=category_id)


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
    title = models.CharField("título", max_length=250)

    folder = models.ForeignKey(
        Folder,
        # CASCADE no banco, recusa na API — mesmo motivo de
        # `Folder.category`: PROTECT impediria apagar a conta do usuário.
        # A hierarquia é obrigatória, então não existe "raiz" para onde o
        # item cair; a view exige esvaziar a pasta antes de removê-la.
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
    is_pinned = models.BooleanField("fixado", default=False)
    is_archived = models.BooleanField("arquivado", default=False)
    position = models.FloatField("posição", default=0)

    #: Arquivo anexado a outro documento (ex.: um PDF dentro de uma nota).
    #: Fora isso, todo documento é de topo e aparece direto na pasta.
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

    # ------------------------------------------------------------------
    # Derivados — mantidos pelo save(), nunca escritos pelo cliente
    # ------------------------------------------------------------------
    excerpt = models.CharField("resumo", max_length=320, blank=True, editable=False)
    word_count = models.PositiveIntegerField(default=0, editable=False)
    #: Texto extraído de dentro do payload (células, rótulos de nós). É o
    #: que torna planilha e diagrama encontráveis pelo próprio conteúdo.
    search_text = models.TextField(blank=True, editable=False)
    search_vector = SearchVectorField(null=True, editable=False)
    last_viewed_at = models.DateTimeField(null=True, blank=True, editable=False)

    objects = DocumentQuerySet.as_manager()

    class Meta:
        verbose_name = "documento"
        verbose_name_plural = "documentos"
        ordering = ("-is_pinned", "-updated_at")
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(attached_to=models.F("id")),
                name="document_cannot_attach_to_itself",
            ),
        ]
        indexes = [
            GinIndex(fields=["search_vector"], name="document_search_gin"),
            models.Index(fields=["owner", "kind"]),
            models.Index(fields=["owner", "folder"]),
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "-updated_at"]),
            # Filtrar por categoria vira um JOIN em folder.category; o
            # índice do lado da pasta é o que mantém isso barato.
            models.Index(fields=["folder", "-updated_at"]),
        ]

    def __str__(self):
        return self.title or self.original_name or str(self.pk)

    # ------------------------------------------------------------------
    # Validação
    # ------------------------------------------------------------------
    def _validate_attachment(self):
        """Regras de anexo.

        Chamada pelo `save()`, e não só pelo `clean()`, porque o DRF não
        invoca `full_clean()` — a rota de upload em lote cria documentos
        direto, e sem isto passaria por cima destas regras.
        """
        if not self.attached_to_id:
            return

        parent = self.attached_to
        if parent.owner_id != self.owner_id:
            raise ValidationError({"attached_to": "O documento pertence a outro usuário."})
        if self.kind != self.Kind.FILE:
            raise ValidationError(
                {"attached_to": "Só arquivos podem ser anexados a outro documento."}
            )
        # Um nível apenas: anexo de anexo criaria uma cadeia que a
        # interface não sabe exibir e que abriria espaço para ciclos.
        if parent.attached_to_id:
            raise ValidationError(
                {"attached_to": "Não é possível anexar um arquivo a outro anexo."}
            )

    @property
    def category(self):
        """A categoria vem da pasta — o item não tem categoria própria.

        Como `Folder.category` é denormalizada em toda a subárvore, isso é
        um acesso direto, sem subir a árvore.
        """
        return self.folder.category if self.folder_id else None

    def clean(self):
        super().clean()

        if self.folder_id and self.folder.owner_id != self.owner_id:
            raise ValidationError({"folder": "A pasta pertence a outro usuário."})

        self._validate_attachment()

        if self.kind in self.EDITABLE_KINDS and self.data:
            validate_data(self.kind, self.data)

    # ------------------------------------------------------------------
    # Derivação
    # ------------------------------------------------------------------
    def _plain_text(self):
        if self.kind == self.Kind.NOTE:
            # Nota em seções guarda o texto no payload; `content` só
            # sobrevive para as notas anteriores à divisão em blocos.
            if isinstance(self.data, dict) and self.data.get("sections"):
                return extract_text(self.kind, self.data)
            return _WS_RE.sub(" ", _TAG_RE.sub(" ", self.content or "")).strip()
        if self.kind == self.Kind.FILE:
            # O Postgres trata "relatorio_final.pdf" como UM token de nome
            # de arquivo, então buscar "relatorio" não acharia nada. Guardar
            # também a versão quebrada em palavras é o que faz a busca por
            # parte do nome funcionar, como se espera de um Drive.
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
            self.title = self.original_name

    def _compute_checksum(self):
        """SHA-256 lido em blocos — arquivos grandes não vão para a memória."""
        digest = hashlib.sha256()
        try:
            self.file.open("rb")
            for chunk in self.file.chunks(chunk_size=1024 * 1024):
                digest.update(chunk)
        finally:
            self.file.seek(0)
        return digest.hexdigest()

    def save(self, *args, **kwargs):
        self._validate_attachment()

        # Anexo mora na mesma pasta do documento que o hospeda: ele não é
        # escolhido por lugar nenhum na interface, então herdar é a única
        # forma de satisfazer a pasta obrigatória sem inventar um destino.
        if self.attached_to_id:
            self.folder_id = self.attached_to.folder_id

        # `_committed` é False enquanto o arquivo ainda não foi gravado no
        # storage — é o sinal de que há upload novo. Testar só o checksum
        # vazio deixaria os metadados desatualizados quando o usuário
        # substituísse o arquivo de um documento existente.
        if self.file and not getattr(self.file, "_committed", True):
            self._absorb_uploaded_file()

        if self.kind in self.EDITABLE_KINDS and not self.data:
            self.data = empty_data_for(self.kind)

        # Nota criada só com `content` (API antiga, admin, shell) precisa
        # virar uma seção de texto — senão o payload padrão traria seções
        # vazias e o corpo escrito sumiria da busca e do PDF.
        if self.kind == self.Kind.NOTE and self.content:
            sections = self.data.get("sections") or []
            if not any((s.get("html") or s.get("code")) for s in sections):
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

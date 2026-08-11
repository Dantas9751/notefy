"""Unifica Note e Attachment no modelo Document.

A ordem das operações importa: `Document` precisa existir e os dados
precisam ser copiados ANTES de os campos de `Note` e a tabela
`Attachment` serem removidos — o autogerado do Django colocava os
RemoveField primeiro, o que apagaria o dono das notas antes de haver
para onde copiá-lo.

As PKs são preservadas na cópia. Assim qualquer referência externa a um
anexo (uma URL já compartilhada, por exemplo) continua resolvendo, e o
mapeamento antigo→novo vira identidade.
"""

import uuid

import django.contrib.postgres.search
import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import content.models


def copy_legacy_content(apps, schema_editor):
    Note = apps.get_model("content", "Note")
    Attachment = apps.get_model("content", "Attachment")
    Document = apps.get_model("content", "Document")

    for note in Note.objects.all().iterator():
        document = Document.objects.create(
            id=note.id,
            kind="note",
            title=note.title,
            content=note.content,
            content_format=note.content_format,
            status=note.status,
            color=note.color,
            folder_id=note.folder_id,
            owner_id=note.owner_id,
            is_favorite=note.is_favorite,
            is_pinned=note.is_pinned,
            is_archived=note.is_archived,
            excerpt=note.excerpt,
            word_count=note.word_count,
            search_text=note.excerpt,
            last_viewed_at=note.last_viewed_at,
            created_at=note.created_at,
            updated_at=note.updated_at,
        )
        document.categories.set(note.categories.all())

    for attachment in Attachment.objects.all().iterator():
        document = Document.objects.create(
            id=attachment.id,
            kind="file",
            title=attachment.title or attachment.original_name,
            content=attachment.description,
            content_format="plain",
            status="done",
            folder_id=attachment.folder_id,
            owner_id=attachment.owner_id,
            # A nota que hospedava o anexo virou um Document de mesma PK,
            # criado no laço acima — por isso o id serve direto.
            attached_to_id=attachment.note_id,
            file=attachment.file,
            original_name=attachment.original_name,
            mime_type=attachment.mime_type,
            size=attachment.size,
            checksum=attachment.checksum,
            file_kind=attachment.kind,
            excerpt=attachment.original_name,
            search_text=attachment.original_name,
            created_at=attachment.created_at,
            updated_at=attachment.updated_at,
        )
        document.categories.set(attachment.categories.all())


def noop_reverse(apps, schema_editor):
    """Reverter apaga os documentos migrados; as tabelas antigas voltam vazias."""
    apps.get_model("content", "Document").objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0003_initial"),
        ("organization", "0002_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Document",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="criado em")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="atualizado em")),
                ("kind", models.CharField(choices=[("note", "Nota"), ("file", "Arquivo"), ("spreadsheet", "Planilha"), ("diagram", "Diagrama"), ("canvas", "Canvas")], db_index=True, default="note", max_length=16, verbose_name="tipo")),
                ("title", models.CharField(max_length=250, verbose_name="título")),
                ("status", models.CharField(choices=[("draft", "Rascunho"), ("in_progress", "Em progresso"), ("done", "Finalizado")], db_index=True, default="draft", max_length=16, verbose_name="status")),
                ("color", models.CharField(blank=True, max_length=7, validators=[django.core.validators.RegexValidator(message="Informe uma cor hexadecimal válida (ex.: #4F46E5).", regex="^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")], verbose_name="cor")),
                ("icon", models.CharField(blank=True, max_length=64, validators=[django.core.validators.RegexValidator(message="Ícone deve ser um identificador kebab-case (ex.: 'book-open').", regex="^[a-z0-9-]{1,64}$")], verbose_name="ícone")),
                ("is_favorite", models.BooleanField(default=False, verbose_name="favorito")),
                ("is_pinned", models.BooleanField(default=False, verbose_name="fixado")),
                ("is_archived", models.BooleanField(default=False, verbose_name="arquivado")),
                ("position", models.FloatField(default=0, verbose_name="posição")),
                ("content", models.TextField(blank=True, verbose_name="conteúdo")),
                ("content_format", models.CharField(choices=[("html", "Texto rico"), ("markdown", "Markdown"), ("plain", "Texto puro")], default="html", max_length=10, verbose_name="formato")),
                ("data", models.JSONField(blank=True, default=dict, verbose_name="dados")),
                ("file", models.FileField(blank=True, max_length=400, null=True, upload_to=content.models.document_upload_path, verbose_name="arquivo")),
                ("original_name", models.CharField(blank=True, max_length=255, verbose_name="nome original")),
                ("mime_type", models.CharField(blank=True, max_length=150)),
                ("size", models.PositiveBigIntegerField(default=0, verbose_name="tamanho em bytes")),
                ("checksum", models.CharField(blank=True, db_index=True, max_length=64)),
                ("file_kind", models.CharField(blank=True, choices=[("image", "Imagem"), ("audio", "Áudio"), ("video", "Vídeo"), ("pdf", "PDF"), ("document", "Documento"), ("archive", "Compactado"), ("other", "Outro")], db_index=True, max_length=16, verbose_name="categoria do arquivo")),
                ("excerpt", models.CharField(blank=True, editable=False, max_length=320, verbose_name="resumo")),
                ("word_count", models.PositiveIntegerField(default=0, editable=False)),
                ("search_text", models.TextField(blank=True, editable=False)),
                ("search_vector", django.contrib.postgres.search.SearchVectorField(editable=False, null=True)),
                ("last_viewed_at", models.DateTimeField(blank=True, editable=False, null=True)),
                ("attached_to", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="attachments", to="content.document", verbose_name="anexado a")),
                ("categories", models.ManyToManyField(blank=True, related_name="documents", to="organization.category", verbose_name="categorias")),
                ("folder", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="documents", to="organization.folder", verbose_name="pasta")),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="%(class)ss", to=settings.AUTH_USER_MODEL, verbose_name="dono")),
            ],
            options={
                "verbose_name": "documento",
                "verbose_name_plural": "documentos",
                "ordering": ("-is_pinned", "-updated_at"),
            },
        ),
        migrations.RunPython(copy_legacy_content, noop_reverse),
        migrations.RemoveField(model_name="note", name="categories"),
        migrations.RemoveField(model_name="note", name="folder"),
        migrations.RemoveField(model_name="note", name="owner"),
        migrations.DeleteModel(name="Attachment"),
    ]

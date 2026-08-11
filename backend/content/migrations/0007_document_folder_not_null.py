"""Torna a pasta obrigatória e remove as categorias próprias do item.

Só esquema; o backfill que garante que não há item solto está na 0006,
numa transação separada.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0006_document_requires_folder"),
    ]

    operations = [
        migrations.AlterField(
            model_name="document",
            name="folder",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="documents",
                to="organization.folder",
                verbose_name="pasta",
            ),
        ),
        # A categoria do item passa a ser lida da pasta onde ele mora.
        migrations.RemoveField(
            model_name="document",
            name="categories",
        ),
        migrations.AddIndex(
            model_name="document",
            index=models.Index(
                fields=["folder", "-updated_at"], name="content_doc_folder__cb1b96_idx"
            ),
        ),
    ]

"""Remove o modelo Note antigo, cria os índices do Document e reindexa a busca."""

import django.contrib.postgres.indexes
from django.conf import settings
from django.db import migrations, models


def reindex_search(apps, schema_editor):
    """Preenche o tsvector dos documentos vindos da migração.

    O signal que mantém o índice só dispara em save(); os registros
    copiados pela 0004 nasceriam com `search_vector` nulo e ficariam
    invisíveis para a busca full-text até serem editados.
    """
    schema_editor.execute(
        """
        UPDATE content_document
        SET search_vector =
            setweight(to_tsvector(%s::regconfig, coalesce(title, '')), 'A') ||
            setweight(to_tsvector(%s::regconfig, coalesce(search_text, '')), 'B')
        """,
        [settings.SEARCH_CONFIG, settings.SEARCH_CONFIG],
    )


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0004_document_unification'),
        ('planner', '0003_document_unification'),
    ]

    operations = [
        migrations.DeleteModel(
            name='Note',
        ),
        migrations.AddIndex(
            model_name='document',
            index=django.contrib.postgres.indexes.GinIndex(fields=['search_vector'], name='document_search_gin'),
        ),
        migrations.AddIndex(
            model_name='document',
            index=models.Index(fields=['owner', 'kind'], name='content_doc_owner_i_2f2c58_idx'),
        ),
        migrations.AddIndex(
            model_name='document',
            index=models.Index(fields=['owner', 'folder'], name='content_doc_owner_i_59a58d_idx'),
        ),
        migrations.AddIndex(
            model_name='document',
            index=models.Index(fields=['owner', 'status'], name='content_doc_owner_i_272538_idx'),
        ),
        migrations.AddIndex(
            model_name='document',
            index=models.Index(fields=['owner', '-updated_at'], name='content_doc_owner_i_da71a7_idx'),
        ),
        migrations.AddConstraint(
            model_name='document',
            constraint=models.CheckConstraint(condition=models.Q(('attached_to', models.F('id')), _negated=True), name='document_cannot_attach_to_itself'),
        ),
        # Depois dos índices: assim o GIN já existe quando o tsvector é
        # gravado, e o Postgres o preenche numa passada só.
        migrations.RunPython(reindex_search, migrations.RunPython.noop),
    ]

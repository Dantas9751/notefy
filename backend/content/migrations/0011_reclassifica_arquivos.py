"""Arquivos gravados como "Outro" só porque o Windows não conhecia o tipo.

Um `.webp` enviado num PC sem o tipo no registro virava "Outro" e caía em
Documentos no Início. A tabela agora é fixa (`content/models.py`); aqui os
que já estavam no banco ganham a categoria certa.
"""

import mimetypes

from django.db import migrations


def reclassificar(apps, schema_editor):
    # A regra de hoje, e não uma cópia dela: o import traz a tabela fixa.
    from content.models import Document as Atual

    Document = apps.get_model("content", "Document")
    for doc in Document.objects.filter(kind="file", file_kind="other").only("id", "original_name"):
        tipo = mimetypes.guess_type(doc.original_name)[0]
        categoria = Atual.detect_file_kind(tipo) if tipo else "other"
        if categoria != "other":
            Document.objects.filter(pk=doc.pk).update(mime_type=tipo, file_kind=categoria)


class Migration(migrations.Migration):
    dependencies = [("content", "0010_modelos")]

    operations = [migrations.RunPython(reclassificar, migrations.RunPython.noop)]

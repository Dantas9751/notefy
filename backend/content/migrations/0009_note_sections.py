"""Converte o corpo das notas em seções.

Uma nota passa a ser uma lista de blocos — texto rico ou código — em vez
de um único HTML. O código precisa de campo próprio para guardar a
linguagem e preservar a indentação; dentro de um contentEditable os
espaços são normalizados e o realce de sintaxe brigaria com a edição.

Cada nota existente vira uma seção de texto com o HTML que já tinha.
"""

from django.db import migrations


def split_into_sections(apps, schema_editor):
    Document = apps.get_model("content", "Document")

    notes = Document.objects.filter(kind="note")
    converted = 0
    for note in notes.iterator():
        data = note.data if isinstance(note.data, dict) else {}
        if data.get("sections"):
            continue
        data["sections"] = [{"id": "s1", "type": "text", "html": note.content or ""}]
        note.data = data
        note.save(update_fields=["data"])
        converted += 1

    if converted:
        print(f"    {converted} nota(s) convertida(s) em seções")


def merge_back(apps, schema_editor):
    """Volta as seções para um HTML único; blocos de código viram <pre>."""
    Document = apps.get_model("content", "Document")

    for note in Document.objects.filter(kind="note").iterator():
        sections = (note.data or {}).get("sections")
        if not sections:
            continue
        parts = []
        for section in sections:
            if section.get("type") == "code":
                parts.append(f"<pre><code>{section.get('code', '')}</code></pre>")
            else:
                parts.append(section.get("html", ""))
        note.content = "".join(parts)
        note.data = {}
        note.save(update_fields=["content", "data"])


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0008_cascade_in_db_guard_in_api"),
    ]

    operations = [
        migrations.RunPython(split_into_sections, merge_back),
    ]

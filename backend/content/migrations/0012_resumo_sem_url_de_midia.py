"""Resumo de diagrama e canvas sem o endereço das imagens.

O `extract_text` agora deixa de fora o `url` que aponta para `/media/`;
aqui os resumos que já estavam gravados são refeitos com a regra nova.
`update` por linha, para não mexer no `updated_at` (a ordem dos Recentes).
"""

from django.db import migrations


def refazer(apps, schema_editor):
    from content.schemas import extract_text

    Document = apps.get_model("content", "Document")
    for doc in Document.objects.filter(kind__in=("diagram", "canvas")).only("id", "kind", "data"):
        texto = extract_text(doc.kind, doc.data)
        Document.objects.filter(pk=doc.pk).update(
            search_text=texto[:20000],
            excerpt=texto[:317] + "..." if len(texto) > 320 else texto,
            word_count=len(texto.split()) if texto else 0,
        )


class Migration(migrations.Migration):
    dependencies = [("content", "0011_reclassifica_arquivos")]

    operations = [migrations.RunPython(refazer, migrations.RunPython.noop)]

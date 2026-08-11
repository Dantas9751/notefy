"""Recolhe os itens soltos para dentro de uma pasta.

Só dados — o `ALTER TABLE` que torna a coluna obrigatória fica na 0007.
Postgres recusa alterar uma tabela que a mesma transação acabou de
modificar ("eventos de gatilho pendentes"), então criar pastas aqui e
alterar o esquema logo em seguida falharia.

O destino de cada item é escolhido pela categoria que ele já tinha, para
que a organização do usuário sobreviva à mudança: uma nota marcada como
"Biologia" acaba numa pasta de Biologia, não num balaio genérico.
"""

from django.db import migrations


DEFAULT_CATEGORY = "Geral"
INBOX_FOLDER = "Entrada"


def backfill_folder(apps, schema_editor):
    Category = apps.get_model("organization", "Category")
    Folder = apps.get_model("organization", "Folder")
    Document = apps.get_model("content", "Document")

    owner_ids = list(
        Document.objects.filter(folder__isnull=True)
        .values_list("owner_id", flat=True)
        .distinct()
    )

    for owner_id in owner_ids:
        # Anexos seguem o documento que os hospeda, não uma pasta própria.
        attachments = Document.objects.filter(
            owner_id=owner_id, folder__isnull=True, attached_to__isnull=False
        ).select_related("attached_to")
        for attachment in attachments:
            if attachment.attached_to and attachment.attached_to.folder_id:
                attachment.folder_id = attachment.attached_to.folder_id
                attachment.save(update_fields=["folder"])

        remaining = list(Document.objects.filter(owner_id=owner_id, folder__isnull=True))
        if not remaining:
            continue

        inbox_by_category = {}
        for document in remaining:
            category = document.categories.order_by("position", "name").first()
            if category is None:
                category = (
                    Category.objects.filter(
                        owner_id=owner_id, name__iexact=DEFAULT_CATEGORY
                    ).first()
                    or Category.objects.filter(owner_id=owner_id)
                    .order_by("position", "name")
                    .first()
                )
            if category is None:
                category = Category.objects.create(
                    owner_id=owner_id,
                    name=DEFAULT_CATEGORY,
                    color="#64748B",
                    description="Criada automaticamente ao tornar a pasta obrigatória.",
                )

            folder = inbox_by_category.get(category.pk)
            if folder is None:
                folder = Folder.objects.filter(
                    owner_id=owner_id,
                    category=category,
                    parent__isnull=True,
                    name=INBOX_FOLDER,
                ).first()
                if folder is None:
                    folder = Folder.objects.create(
                        owner_id=owner_id,
                        category=category,
                        name=INBOX_FOLDER,
                        description="Itens que existiam antes de a pasta ser obrigatória.",
                    )
                    # O model histórico não roda o save() real, que é quem
                    # calcula estes derivados.
                    folder.path = f"{folder.pk}/"
                    folder.depth = 0
                    folder.save(update_fields=["path", "depth"])
                inbox_by_category[category.pk] = folder

            document.folder_id = folder.pk
            document.save(update_fields=["folder"])


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0005_document_unification"),
        # O backfill cria pastas, e pasta já exige categoria.
        ("organization", "0003_folder_requires_category"),
    ]

    operations = [
        migrations.RunPython(backfill_folder, migrations.RunPython.noop),
    ]

"""Pasta passa a exigir categoria — a hierarquia vira categoria → pasta → item.

O backfill roda ANTES do AlterField: tornar a coluna NOT NULL com linhas
nulas presentes falharia no banco. Pastas sem categoria recebem uma
categoria "Geral" criada por usuário, e as subpastas herdam a da raiz.
"""

from django.db import migrations, models
from django.db.models.functions import Lower
import django.db.models.deletion


DEFAULT_CATEGORY = "Geral"


def backfill_category(apps, schema_editor):
    Category = apps.get_model("organization", "Category")
    Folder = apps.get_model("organization", "Folder")

    orphan_owners = (
        Folder.objects.filter(category__isnull=True)
        .values_list("owner_id", flat=True)
        .distinct()
    )

    for owner_id in orphan_owners:
        category = (
            Category.objects.filter(owner_id=owner_id, name__iexact=DEFAULT_CATEGORY).first()
            or Category.objects.filter(owner_id=owner_id).order_by("position", "name").first()
        )
        if category is None:
            category = Category.objects.create(
                owner_id=owner_id,
                name=DEFAULT_CATEGORY,
                color="#64748B",
                description="Criada automaticamente ao tornar a categoria obrigatória.",
            )
        Folder.objects.filter(owner_id=owner_id, category__isnull=True).update(
            category=category
        )

    # Subpasta herda a categoria da raiz. Descemos nível a nível: na
    # profundidade N todos os pais já têm a categoria definitiva.
    max_depth = Folder.objects.aggregate(models.Max("depth"))["depth__max"] or 0
    for depth in range(1, max_depth + 1):
        for folder in Folder.objects.filter(depth=depth).select_related("parent"):
            if folder.parent and folder.category_id != folder.parent.category_id:
                folder.category_id = folder.parent.category_id
                folder.save(update_fields=["category"])


class Migration(migrations.Migration):

    dependencies = [
        ("organization", "0002_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_category, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="folder",
            name="category",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="folders",
                to="organization.category",
                verbose_name="categoria",
            ),
        ),
        # Pastas raiz passam a ser únicas dentro da categoria: "Provas"
        # pode existir em Biologia e em Cálculo ao mesmo tempo.
        migrations.RemoveConstraint(
            model_name="folder",
            name="unique_root_folder_name",
        ),
        migrations.AddConstraint(
            model_name="folder",
            constraint=models.UniqueConstraint(
                "owner",
                "category",
                Lower("name"),
                condition=models.Q(("parent__isnull", True)),
                name="unique_root_folder_name_per_category",
            ),
        ),
    ]

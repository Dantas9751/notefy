"""Reduz os status de tarefa a três: a fazer, em progresso e concluída.

"Bloqueada" e "Cancelada" descreviam um motivo, não um lugar no fluxo. O
backfill roda antes do AlterField porque uma linha com valor fora das
novas escolhas passaria a ser inválida:

    bloqueada  -> a fazer     (segue pendente, só estava travada)
    cancelada  -> concluída   (está encerrada, sai do que ainda é aberto)
"""

from django.db import migrations, models


REMAP = {"blocked": "todo", "cancelled": "done"}


def collapse_statuses(apps, schema_editor):
    Task = apps.get_model("planner", "Task")
    for old, new in REMAP.items():
        moved = Task.objects.filter(status=old).update(status=new)
        if moved:
            print(f"    {moved} tarefa(s) de {old!r} viraram {new!r}")


def noop_reverse(apps, schema_editor):
    """Não há como saber quais eram bloqueadas antes; a volta é sem perda
    de dados, apenas sem restaurar a distinção."""


class Migration(migrations.Migration):

    dependencies = [
        ("planner", "0003_document_unification"),
    ]

    operations = [
        migrations.RunPython(collapse_statuses, noop_reverse),
        migrations.AlterField(
            model_name="task",
            name="status",
            field=models.CharField(
                choices=[
                    ("todo", "A fazer"),
                    ("in_progress", "Em progresso"),
                    ("done", "Concluída"),
                ],
                db_index=True,
                default="todo",
                max_length=16,
                verbose_name="status",
            ),
        ),
    ]

"""Quadros Kanban múltiplos, com um padrão por usuário.

O campo `board` da tarefa nasce aceitando nulo e continua assim no banco,
mas nenhuma tarefa fica sem quadro: esta migração cria um quadro padrão
para cada usuário que já tem tarefas e adota as órfãs. O `save()` do model
cobre daí em diante.
"""

import django.core.validators
import django.db.models.deletion
import django.db.models.functions.text
import uuid
from django.conf import settings
from django.db import migrations, models


def criar_quadro_padrao(apps, schema_editor):
    """Um quadro "Meu quadro" por usuário com tarefas, e as tarefas nele."""
    User = apps.get_model(settings.AUTH_USER_MODEL)
    Board = apps.get_model("planner", "Board")
    Task = apps.get_model("planner", "Task")

    donos = User.objects.filter(tasks__isnull=False).distinct()
    for dono in donos:
        board, _ = Board.objects.get_or_create(
            owner=dono,
            name="Meu quadro",
            defaults={"is_default": True, "position": 0},
        )
        if not board.is_default:
            board.is_default = True
            board.save(update_fields=["is_default"])
        Task.objects.filter(owner=dono, board__isnull=True).update(board=board)


def desfazer(apps, schema_editor):
    """Solta as tarefas antes de os quadros sumirem.

    Sem isto, remover a tabela levaria as tarefas junto (o FK é CASCADE) —
    reverter a migração apagaria dados do usuário, que é o oposto do que
    reverter deve fazer.
    """
    Task = apps.get_model("planner", "Task")
    Board = apps.get_model("planner", "Board")
    Task.objects.update(board=None)
    Board.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('planner', '0002_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Board',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='atualizado em')),
                ('name', models.CharField(max_length=120, verbose_name='nome')),
                ('color', models.CharField(blank=True, max_length=7, validators=[django.core.validators.RegexValidator(message='Informe uma cor hexadecimal válida (ex.: #4F46E5).', regex='^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')], verbose_name='cor')),
                ('is_default', models.BooleanField(default=False, verbose_name='padrão')),
                ('position', models.PositiveIntegerField(default=0, verbose_name='posição')),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='%(class)ss', to=settings.AUTH_USER_MODEL, verbose_name='dono')),
            ],
            options={
                'verbose_name': 'quadro',
                'verbose_name_plural': 'quadros',
                'ordering': ('position', 'name'),
            },
        ),
        migrations.AddField(
            model_name='task',
            name='board',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='planner.board', verbose_name='quadro'),
        ),
        migrations.AddConstraint(
            model_name='board',
            constraint=models.UniqueConstraint(models.F('owner'), django.db.models.functions.text.Lower('name'), name='unique_board_name_per_owner'),
        ),
        migrations.AddConstraint(
            model_name='board',
            constraint=models.UniqueConstraint(condition=models.Q(('is_default', True)), fields=('owner',), name='unique_default_board_per_owner'),
        ),
        migrations.RunPython(criar_quadro_padrao, desfazer),
    ]

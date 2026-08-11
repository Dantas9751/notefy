"""Tarefas — alimentam tanto o calendário quanto o quadro Kanban."""

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.models import BaseModel
from core.validators import hex_color_validator
from organization.models import Category, Folder


class TaskQuerySet(models.QuerySet):
    def open(self):
        return self.exclude(status=Task.Status.DONE)

    def scheduled(self):
        """Tarefas que têm lugar no calendário."""
        return self.filter(starts_at__isnull=False)

    def in_range(self, start, end):
        """Tarefas que se sobrepõem à janela [start, end).

        Sobreposição, e não contenção: um evento que começa antes da janela
        e termina dentro dela precisa aparecer no mês exibido. `ends_at`
        nulo é tratado como evento pontual em `starts_at`.
        """
        return self.filter(
            models.Q(starts_at__lt=end)
            & (models.Q(ends_at__gte=start) | models.Q(ends_at__isnull=True, starts_at__gte=start))
        )

    def with_relations(self):
        return self.select_related("document", "folder").prefetch_related(
            "categories", "checklist"
        )


class Task(BaseModel):
    """Tarefa com janela temporal opcional, prioridade e status."""

    class Status(models.TextChoices):
        """Três colunas, e só.

        O status é a coluna onde a tarefa está — arrastar é a única forma
        de mudá-lo, e criar já nasce no status da coluna escolhida.
        "Bloqueada" e "Cancelada" saíram: descreviam um motivo, não um
        lugar no fluxo, e obrigavam o usuário a decidir num menu o que o
        quadro já responde pela posição.
        """

        TODO = "todo", "A fazer"
        IN_PROGRESS = "in_progress", "Em progresso"
        DONE = "done", "Concluída"

    class Priority(models.IntegerChoices):
        """Inteiro, não texto: o Kanban ordena por prioridade e um
        TextChoices ordenaria alfabeticamente ('alta' antes de 'urgente')."""

        LOW = 0, "Baixa"
        MEDIUM = 1, "Média"
        HIGH = 2, "Alta"
        URGENT = 3, "Urgente"

    title = models.CharField("título", max_length=250)
    description = models.TextField("descrição", blank=True)

    status = models.CharField(
        "status", max_length=16, choices=Status.choices, default=Status.TODO, db_index=True
    )
    priority = models.IntegerField(
        "prioridade", choices=Priority.choices, default=Priority.MEDIUM, db_index=True
    )

    starts_at = models.DateTimeField("início", null=True, blank=True, db_index=True)
    ends_at = models.DateTimeField("fim", null=True, blank=True)
    all_day = models.BooleanField("dia inteiro", default=False)
    reminder_at = models.DateTimeField("lembrete", null=True, blank=True)
    completed_at = models.DateTimeField("concluída em", null=True, blank=True, editable=False)

    #: RRULE do RFC 5545 (ex.: "FREQ=WEEKLY;BYDAY=MO,WE"). Armazenamos a
    #: regra crua; a expansão em ocorrências é feita na camada de leitura.
    recurrence_rule = models.CharField("recorrência", max_length=250, blank=True)

    document = models.ForeignKey(
        "content.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
        verbose_name="documento vinculado",
    )
    folder = models.ForeignKey(
        Folder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
        verbose_name="pasta",
    )
    categories = models.ManyToManyField(Category, blank=True, related_name="tasks")

    color = models.CharField(
        "cor", max_length=7, blank=True, validators=[hex_color_validator]
    )
    #: Float para permitir reordenar por drag-and-drop no Kanban inserindo
    #: entre dois cartões (média dos vizinhos) sem reescrever a coluna toda.
    position = models.FloatField("posição no quadro", default=0)

    objects = TaskQuerySet.as_manager()

    class Meta:
        verbose_name = "tarefa"
        verbose_name_plural = "tarefas"
        ordering = ("position", "-priority", "starts_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__isnull=True)
                | models.Q(starts_at__isnull=True)
                | models.Q(ends_at__gte=models.F("starts_at")),
                name="task_end_after_start",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "status", "position"]),
            models.Index(fields=["owner", "starts_at"]),
        ]

    def __str__(self):
        return self.title

    @property
    def is_overdue(self):
        if self.status == self.Status.DONE:
            return False
        deadline = self.ends_at or self.starts_at
        return bool(deadline and deadline < timezone.now())

    def clean(self):
        super().clean()
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValidationError({"ends_at": "O fim não pode ser anterior ao início."})
        if self.ends_at and not self.starts_at:
            raise ValidationError({"starts_at": "Defina um início para poder definir um fim."})
        for field in ("document", "folder"):
            related = getattr(self, field, None)
            if related and related.owner_id != self.owner_id:
                raise ValidationError({field: "O item vinculado pertence a outro usuário."})

    def save(self, *args, **kwargs):
        # `completed_at` é derivado do status — nunca enviado pelo cliente,
        # o que impede que o histórico de conclusão seja forjado.
        if self.status == self.Status.DONE and self.completed_at is None:
            self.completed_at = timezone.now()
        elif self.status != self.Status.DONE:
            self.completed_at = None
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {"completed_at"}
        super().save(*args, **kwargs)


class ChecklistItem(models.Model):
    """Subitem de uma tarefa.

    Modelado como entidade própria em vez de auto-relacionamento em Task:
    checklist não precisa de datas nem de recursão, e uma tabela plana
    elimina de saída o risco de ciclos que Folder exige tratar.
    """

    id = models.BigAutoField(primary_key=True)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="checklist")
    text = models.CharField("texto", max_length=250)
    is_done = models.BooleanField("concluído", default=False)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "item de checklist"
        verbose_name_plural = "itens de checklist"
        ordering = ("position", "id")

    def __str__(self):
        return self.text

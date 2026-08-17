"""Tarefas — alimentam tanto o calendário quanto o quadro Kanban."""

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.models import BaseModel, SoftDeleteQuerySet
from core.validators import hex_color_validator
from organization.models import Category, Folder


class Board(BaseModel):
    """Um quadro Kanban.

    As colunas continuam sendo o `status` da tarefa — o quadro não as
    define. O que ele separa é o CONJUNTO de tarefas: "Faculdade" e "Casa"
    têm cada um seu "A fazer", em vez de um único quadro misturando tudo.

    Sempre existe um quadro padrão por usuário, e é ele que recebe qualquer
    tarefa criada sem quadro explícito — inclusive as que vêm do
    calendário. Sem essa garantia, uma tarefa poderia existir sem lugar
    nenhum no Kanban e sumir da interface.
    """

    name = models.CharField("nome", max_length=120)
    color = models.CharField(
        "cor", max_length=7, blank=True, validators=[hex_color_validator]
    )
    #: O quadro que recebe tarefa sem destino. Único por usuário — a
    #: unicidade é parcial (só entre os `True`) porque os outros quadros
    #: são todos `False` e colidiriam entre si.
    is_default = models.BooleanField("padrão", default=False)
    position = models.PositiveIntegerField("posição", default=0)

    class Meta:
        verbose_name = "quadro"
        verbose_name_plural = "quadros"
        ordering = ("position", "name")
        constraints = [
            # As duas restritas ao que está VIVO: com o soft delete, um
            # quadro excluído continua na tabela e, sem a condição, seguia
            # reservando o nome — e o slot de padrão. Excluir "Pessoal" e
            # criar outro "Pessoal" estourava IntegrityError.
            models.UniqueConstraint(
                "owner",
                models.functions.Lower("name"),
                name="unique_board_name_per_owner",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.UniqueConstraint(
                fields=["owner"],
                condition=models.Q(is_default=True, deleted_at__isnull=True),
                name="unique_default_board_per_owner",
            ),
        ]

    def __str__(self):
        return self.name

    @classmethod
    def default_for(cls, owner):
        """O quadro padrão do usuário, criando-o se ainda não existir.

        Criar sob demanda em vez de exigir que exista: contas antigas, ou
        criadas por caminhos que não passam pelo cadastro, continuam
        funcionando sem precisar de manutenção manual.
        """
        board = cls.objects.filter(owner=owner, is_default=True).first()
        if board is not None:
            return board
        board, _ = cls.objects.get_or_create(
            owner=owner, name="Meu quadro", defaults={"is_default": True}
        )
        if not board.is_default:
            board.is_default = True
            board.save(update_fields=["is_default"])
        return board


class TaskQuerySet(SoftDeleteQuerySet):
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
        return self.select_related("document", "folder", "board").prefetch_related(
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
    #: O quadro onde a tarefa aparece. Nulo só existe como estado
    #: transitório: o save() abaixo resolve para o quadro padrão, porque
    #: uma tarefa sem quadro não apareceria em Kanban nenhum.
    board = models.ForeignKey(
        Board,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="tasks",
        verbose_name="quadro",
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
        for field in ("document", "folder", "board"):
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

        # Toda tarefa nasce num quadro. Quem cria pelo calendário, pela
        # pasta ou pela API sem informar `board` cai no padrão — assim não
        # existe tarefa órfã, invisível em todos os Kanbans.
        if self.board_id is None and self.owner_id:
            self.board = Board.default_for(self.owner)

        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {"completed_at", "board"}
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

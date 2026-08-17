from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.decorators import action
from rest_framework.response import Response

from core.views import OwnedModelViewSet

from .models import Board, ChecklistItem, Task
from .serializers import (
    BoardSerializer,
    ChecklistItemSerializer,
    ChecklistItemWriteSerializer,
    TaskCalendarSerializer,
    TaskSerializer,
)


class TaskFilter(filters.FilterSet):
    category = filters.UUIDFilter(field_name="categories__id")
    board = filters.UUIDFilter(field_name="board_id")
    folder = filters.UUIDFilter(field_name="folder_id")
    document = filters.UUIDFilter(field_name="document_id")
    starts_after = filters.DateTimeFilter(field_name="starts_at", lookup_expr="gte")
    starts_before = filters.DateTimeFilter(field_name="starts_at", lookup_expr="lte")
    priority_min = filters.NumberFilter(field_name="priority", lookup_expr="gte")
    unscheduled = filters.BooleanFilter(field_name="starts_at", lookup_expr="isnull")
    overdue = filters.BooleanFilter(method="filter_overdue")
    #: `?open=true` esconde as concluídas. O roadmap usa para não ficar
    #: cheio de barras de coisas que já acabaram — o que já foi feito não
    #: é mais planejamento.
    open = filters.BooleanFilter(method="filter_open")

    class Meta:
        model = Task
        fields = ("status", "priority", "category", "board", "folder", "document", "all_day")

    def filter_open(self, queryset, name, value):
        return queryset.open() if value else queryset

    def filter_overdue(self, queryset, name, value):
        if not value:
            return queryset
        now = timezone.now()
        return queryset.open().filter(
            Q(ends_at__lt=now) | Q(ends_at__isnull=True, starts_at__lt=now)
        )


class BoardViewSet(OwnedModelViewSet):
    """CRUD dos quadros Kanban."""

    serializer_class = BoardSerializer
    queryset = Board.objects.all()
    ordering = ("position", "name")
    search_fields = ("name",)

    def get_queryset(self):
        return super().get_queryset().annotate(task_count=Count("tasks"))

    def list(self, request, *args, **kwargs):
        # Garante o quadro padrao antes de listar: uma conta que nunca criou
        # tarefa nenhuma ainda nao tem quadro, e o seletor do frontend
        # apareceria vazio — sem opcao de escolher nada.
        Board.default_for(request.user)
        return super().list(request, *args, **kwargs)

    def perform_destroy(self, instance):
        """O quadro padrao nao pode ser excluido, e nada se perde ao excluir
        os outros: as tarefas do quadro removido voltam para o padrao."""
        if instance.is_default:
            raise ValidationError(
                {"detail": "O quadro padrão não pode ser excluído."}
            )
        padrao = Board.default_for(instance.owner)
        instance.tasks.update(board=padrao)
        instance.delete()

    @action(detail=True, methods=["post"])
    def make_default(self, request, pk=None):
        """Elege este quadro como o padrao, rebaixando o anterior."""
        board = self.get_object()
        Board.objects.filter(owner=request.user, is_default=True).update(is_default=False)
        board.is_default = True
        board.save(update_fields=["is_default"])
        return Response(self.get_serializer(board).data)


class TaskViewSet(OwnedModelViewSet):
    serializer_class = TaskSerializer
    queryset = Task.objects.all()
    filterset_class = TaskFilter
    search_fields = ("title", "description")
    ordering_fields = ("title", "starts_at", "priority", "position", "created_at")

    def get_queryset(self):
        return super().get_queryset().with_relations()

    @action(detail=False, methods=["get"])
    def calendar(self, request):
        """Eventos de um intervalo. Sem `start`/`end`, usa os 30 dias em volta de hoje."""
        now = timezone.now()
        start = parse_datetime(request.query_params.get("start", "")) or now - timedelta(days=30)
        end = parse_datetime(request.query_params.get("end", "")) or now + timedelta(days=30)

        qs = self.filter_queryset(self.get_queryset()).scheduled().in_range(start, end)
        return Response(
            TaskCalendarSerializer(qs, many=True, context={"request": request}).data
        )

    @action(detail=False, methods=["get"])
    def board(self, request):
        """Tarefas agrupadas por status, prontas para o Kanban.

        O agrupamento sai daqui e não do frontend porque as colunas são
        definidas pelo enum do backend — o cliente não precisa conhecer
        (nem duplicar) a lista de status possíveis.
        """
        qs = self.filter_queryset(self.get_queryset()).order_by("position", "-priority")
        serialized = TaskSerializer(qs, many=True, context={"request": request}).data

        by_status = {value: [] for value, _ in Task.Status.choices}
        for task in serialized:
            # `setdefault` e não `[...]`: um status fora do enum derrubava o
            # quadro inteiro com KeyError → 500, e a tela ficava sem cartão
            # nenhum para arrastar. Isso não é hipotético — o enum já teve
            # cinco valores e hoje tem três, então qualquer linha gravada
            # antes da redução (ou por um script) tem esse efeito. A tarefa
            # órfã vai para "A fazer", que é onde o usuário consegue vê-la e
            # arrastá-la de volta para o fluxo.
            by_status.setdefault(task["status"], by_status[Task.Status.TODO]).append(task)

        return Response(
            {
                "columns": [
                    {"status": value, "label": label, "tasks": by_status[value]}
                    for value, label in Task.Status.choices
                ]
            }
        )

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """Drag-and-drop do Kanban: muda status e/ou posição."""
        task = self.get_object()
        new_status = request.data.get("status")
        position = request.data.get("position")

        if new_status is not None:
            if new_status not in Task.Status.values:
                return Response(
                    {"status": f"Status inválido. Use um de: {', '.join(Task.Status.values)}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            task.status = new_status

        if position is not None:
            try:
                task.position = float(position)
            except (TypeError, ValueError):
                return Response(
                    {"position": "Precisa ser um número."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        task.save()
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=["post"])
    def schedule(self, request, pk=None):
        """Define ou limpa a data da tarefa.

        É a ponte entre o quadro e o calendário: sem data a tarefa só
        existe no Kanban; com data ela aparece na agenda. Ter uma rota
        própria permite agendar do cartão do quadro e arrastar entre dias
        no calendário sem abrir o formulário inteiro.
        """
        task = self.get_object()

        if "starts_at" not in request.data:
            return Response(
                {"starts_at": "Envie `starts_at` (ISO 8601) ou null para desagendar."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_start = request.data.get("starts_at")
        raw_end = request.data.get("ends_at")

        if raw_start in (None, ""):
            # Desagendar: o fim não pode sobreviver ao início, senão a
            # tarefa ficaria com uma janela sem começo.
            task.starts_at = None
            task.ends_at = None
        else:
            start = parse_datetime(raw_start)
            if start is None:
                return Response(
                    {"starts_at": "Data inválida. Use ISO 8601."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            end = parse_datetime(raw_end) if raw_end else None
            if end is None and task.ends_at and task.starts_at:
                # Arrastar no calendário move a tarefa inteira: preserva a
                # duração original em vez de descartar o fim.
                end = start + (task.ends_at - task.starts_at)

            if end and end < start:
                return Response(
                    {"ends_at": "O fim não pode ser anterior ao início."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            task.starts_at = start
            task.ends_at = end

        if "all_day" in request.data:
            task.all_day = bool(request.data["all_day"])

        task.save()
        return Response(self.get_serializer(task).data)

    @action(detail=False, methods=["get"])
    def unscheduled(self, request):
        """Tarefas sem data — a faixa "a agendar" do calendário."""
        qs = (
            self.filter_queryset(self.get_queryset())
            .open()
            .filter(starts_at__isnull=True)
            .order_by("-priority", "position")
        )
        return Response(
            TaskSerializer(qs, many=True, context={"request": request}).data
        )

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        """Alterna entre concluída e a fazer."""
        task = self.get_object()
        task.status = (
            Task.Status.TODO if task.status == Task.Status.DONE else Task.Status.DONE
        )
        task.save()
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=["post"], url_path="checklist")
    def add_checklist_item(self, request, pk=None):
        task = self.get_object()
        serializer = ChecklistItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(task=task)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ChecklistItemViewSet(viewsets.ModelViewSet):
    """Itens de checklist.

    Não herda de OwnedModelViewSet: ChecklistItem não tem coluna `owner` —
    a posse é herdada da tarefa. O isolamento vem do filtro `task__owner`
    aqui e da validação de `task` no serializer.
    """

    serializer_class = ChecklistItemWriteSerializer
    queryset = ChecklistItem.objects.all()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not self.request:
            return ChecklistItem.objects.none()
        return ChecklistItem.objects.filter(task__owner=self.request.user)

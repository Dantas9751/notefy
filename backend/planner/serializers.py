from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from content.models import Document
from organization.models import Category, Folder
from organization.serializers import CategoryMiniSerializer, OwnedPrimaryKeyRelatedField

from .models import Board, ChecklistItem, Task


class ChecklistItemSerializer(serializers.ModelSerializer):
    """Leitura aninhada dentro de Task — `task` fica implícito."""

    class Meta:
        model = ChecklistItem
        fields = ("id", "text", "is_done", "position")


class ChecklistItemWriteSerializer(serializers.ModelSerializer):
    """Uso avulso em /checklist-items/, onde a tarefa precisa ser informada
    e validada como pertencente ao usuário logado."""

    task = OwnedPrimaryKeyRelatedField(queryset=Task.objects.all())

    class Meta:
        model = ChecklistItem
        fields = ("id", "task", "text", "is_done", "position")


class BoardSerializer(serializers.ModelSerializer):
    """Quadro Kanban. `task_count` evita um request por quadro só para
    mostrar quantas tarefas cada um tem no seletor."""

    task_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Board
        fields = ("id", "name", "color", "is_default", "position", "task_count")
        read_only_fields = ("id", "is_default", "task_count")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Dê um nome ao quadro.")
        outros = Board.objects.filter(
            owner=self.context["request"].user, name__iexact=value
        )
        if self.instance is not None:
            outros = outros.exclude(pk=self.instance.pk)
        if outros.exists():
            raise serializers.ValidationError("Já existe um quadro com este nome.")
        return value


class TaskSerializer(serializers.ModelSerializer):
    board = OwnedPrimaryKeyRelatedField(
        queryset=Board.objects.all(), required=False, allow_null=True
    )
    document = OwnedPrimaryKeyRelatedField(
        queryset=Document.objects.all(), required=False, allow_null=True
    )
    folder = OwnedPrimaryKeyRelatedField(
        queryset=Folder.objects.all(), required=False, allow_null=True
    )
    categories = OwnedPrimaryKeyRelatedField(
        queryset=Category.objects.all(), many=True, required=False
    )
    categories_detail = CategoryMiniSerializer(
        source="categories", many=True, read_only=True
    )
    checklist = ChecklistItemSerializer(many=True, read_only=True)
    document_title = serializers.CharField(source="document.title", read_only=True, default=None)
    document_kind = serializers.CharField(source="document.kind", read_only=True, default=None)
    folder_name = serializers.CharField(source="folder.name", read_only=True, default=None)
    board_name = serializers.CharField(source="board.name", read_only=True, default=None)
    is_overdue = serializers.BooleanField(read_only=True)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model = Task
        fields = (
            "id", "title", "description", "status", "priority", "priority_label",
            "starts_at", "ends_at", "all_day", "reminder_at", "completed_at",
            "recurrence_rule", "document", "document_title", "document_kind",
            "folder", "folder_name", "board", "board_name",
            "categories", "categories_detail", "checklist", "color", "position",
            "is_overdue", "created_at", "updated_at",
        )
        read_only_fields = ("id", "completed_at", "created_at", "updated_at")

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and ends_at < starts_at:
            raise serializers.ValidationError(
                {"ends_at": "O fim não pode ser anterior ao início."}
            )
        if ends_at and not starts_at:
            raise serializers.ValidationError(
                {"starts_at": "Defina um início para poder definir um fim."}
            )
        return attrs


class TaskCalendarSerializer(serializers.ModelSerializer):
    """Formato de evento pronto para o calendário do frontend.

    Nomes de campo em `start`/`end`/`allDay` seguem a convenção de eventos
    de calendário, então o componente consome a resposta sem remapear.
    """

    start = serializers.DateTimeField(source="starts_at")
    end = serializers.DateTimeField(source="ends_at")
    allDay = serializers.BooleanField(source="all_day")
    color = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Task
        fields = (
            "id", "title", "start", "end", "allDay", "status", "priority",
            "color", "is_overdue", "folder", "document", "board",
        )

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_color(self, obj):
        """Cor própria da tarefa; senão a da primeira categoria; senão nada
        (o frontend aplica o tom neutro do tema)."""
        if obj.color:
            return obj.color
        first = next(iter(obj.categories.all()), None)
        return first.color if first else None

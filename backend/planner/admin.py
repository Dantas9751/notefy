from django.contrib import admin

from .models import ChecklistItem, Task


class ChecklistItemInline(admin.TabularInline):
    model = ChecklistItem
    extra = 0


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "status", "priority", "starts_at", "ends_at")
    list_filter = ("status", "priority", "all_day")
    search_fields = ("title", "description", "owner__username")
    raw_id_fields = ("document", "folder")
    filter_horizontal = ("categories",)
    readonly_fields = ("completed_at",)
    inlines = [ChecklistItemInline]

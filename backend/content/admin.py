from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "owner", "folder", "status", "updated_at")
    list_filter = ("kind", "status", "file_kind", "is_archived", "is_favorite")
    search_fields = ("title", "search_text", "owner__username")
    raw_id_fields = ("folder", "attached_to")
    readonly_fields = (
        "excerpt", "word_count", "search_text",
        "mime_type", "size", "checksum", "file_kind", "original_name",
    )

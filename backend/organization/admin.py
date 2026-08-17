from django.contrib import admin

from .models import Category, Folder


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "color", "is_pinned", "position")
    list_filter = ("is_pinned",)
    search_fields = ("name", "owner__username")


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "parent", "category", "depth", "is_archived")
    list_filter = ("is_archived", "is_favorite")
    search_fields = ("name", "owner__username")
    readonly_fields = ("path", "depth")
    raw_id_fields = ("parent", "category")

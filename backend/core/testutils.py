"""Auxiliares de teste.

Com a hierarquia obrigatória (categoria → pasta → item), todo teste que
toca conteúdo precisa antes de uma categoria e de uma pasta. Concentrar
isso aqui evita repetir três linhas de preparo em cada método.
"""

from django.core.files.uploadedfile import SimpleUploadedFile

from content.models import Document
from organization.models import Category, Folder
from users.models import User


def make_user(email="user@ex.com", password="senha-forte-123", **extra):
    return User.objects.create_user(email=email, password=password, **extra)


def make_category(owner, name="Geral", **extra):
    return Category.objects.create(owner=owner, name=name, **extra)


def make_folder(owner, category=None, name="Pasta", parent=None, **extra):
    """Cria a pasta e, se preciso, a categoria que ela exige."""
    if parent is None and category is None:
        category = Category.objects.filter(owner=owner).first() or make_category(owner)
    return Folder.objects.create(
        owner=owner, category=category, name=name, parent=parent, **extra
    )


def make_document(owner, folder=None, *, kind="note", title="Item", **extra):
    if folder is None:
        folder = Folder.objects.filter(owner=owner).first() or make_folder(owner)
    return Document.objects.create(
        owner=owner, folder=folder, kind=kind, title=title, **extra
    )


def make_upload(name="prova.pdf", content=b"%PDF-1.4 conteudo"):
    return SimpleUploadedFile(name, content, content_type="application/pdf")

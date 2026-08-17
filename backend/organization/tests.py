"""Testes da hierarquia de pastas — a parte com maior risco de corromper dados."""

from django.core.exceptions import ValidationError
from django.test import TestCase

from users.models import User

from .models import MAX_FOLDER_DEPTH, Category, Folder


class FolderHierarchyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="a", password="senha-forte-123")
        cls.other = User.objects.create_user(username="b", password="senha-forte-123")
        cls.category = Category.objects.create(owner=cls.user, name="Biologia")
        cls.other_category = Category.objects.create(owner=cls.other, name="Deles")

    def make(self, name, parent=None, owner=None, category=None):
        owner = owner or self.user
        # Subpasta herda a categoria do pai; raiz precisa de uma explícita.
        if parent is None and category is None:
            category = self.category if owner is self.user else self.other_category
        return Folder.objects.create(
            name=name, parent=parent, owner=owner, category=category
        )

    # ------------------------------------------------------------------
    # path / depth
    # ------------------------------------------------------------------
    def test_root_folder_path_and_depth(self):
        root = self.make("Raiz")
        self.assertEqual(root.path, f"{root.pk}/")
        self.assertEqual(root.depth, 0)

    def test_nested_path_accumulates_ancestors(self):
        root = self.make("Raiz")
        child = self.make("Filha", parent=root)
        grandchild = self.make("Neta", parent=child)

        self.assertEqual(child.path, f"{root.pk}/{child.pk}/")
        self.assertEqual(grandchild.path, f"{root.pk}/{child.pk}/{grandchild.pk}/")
        self.assertEqual(grandchild.depth, 2)

    def test_descendants_and_ancestors(self):
        root = self.make("Raiz")
        child = self.make("Filha", parent=root)
        grandchild = self.make("Neta", parent=child)

        self.assertCountEqual(root.descendants, [child, grandchild])
        self.assertEqual(list(grandchild.ancestors), [root, child])

    # ------------------------------------------------------------------
    # Categoria
    # ------------------------------------------------------------------
    def test_subfolder_inherits_category_from_parent(self):
        outra = Category.objects.create(owner=self.user, name="Cálculo")
        root = self.make("Raiz")
        # Mesmo pedindo outra categoria, o pai manda.
        child = self.make("Filha", parent=root, category=outra)

        child.refresh_from_db()
        self.assertEqual(child.category_id, self.category.pk)

    def test_changing_root_category_propagates_to_subtree(self):
        outra = Category.objects.create(owner=self.user, name="Física")
        root = self.make("Raiz")
        child = self.make("Filha", parent=root)
        grandchild = self.make("Neta", parent=child)

        root.category = outra
        root.save()

        for folder in (child, grandchild):
            folder.refresh_from_db()
            self.assertEqual(folder.category_id, outra.pk)

    def test_moving_subtree_to_another_root_changes_its_category(self):
        outra = Category.objects.create(owner=self.user, name="Química")
        origem = self.make("Origem")
        destino = self.make("Destino", category=outra)
        child = self.make("Filha", parent=origem)
        grandchild = self.make("Neta", parent=child)

        child.parent = destino
        child.save()

        for folder in (child, grandchild):
            folder.refresh_from_db()
            self.assertEqual(folder.category_id, outra.pk)

    def test_cannot_use_another_users_category(self):
        folder = Folder(name="Invasora", owner=self.user, category=self.other_category)
        with self.assertRaises(ValidationError):
            folder.save()

    # ------------------------------------------------------------------
    # Trava anti-ciclo
    # ------------------------------------------------------------------
    def test_cannot_be_its_own_parent(self):
        folder = self.make("Sozinha")
        folder.parent = folder
        with self.assertRaises(ValidationError):
            folder.save()

    def test_cannot_move_into_own_descendant(self):
        root = self.make("Raiz")
        child = self.make("Filha", parent=root)
        grandchild = self.make("Neta", parent=child)

        root.parent = grandchild
        with self.assertRaises(ValidationError) as ctx:
            root.save()
        self.assertIn("ciclo", str(ctx.exception).lower())

    def test_cannot_move_into_direct_child(self):
        root = self.make("Raiz")
        child = self.make("Filha", parent=root)

        root.parent = child
        with self.assertRaises(ValidationError):
            root.save()

    def test_cannot_parent_to_another_users_folder(self):
        mine = self.make("Minha")
        theirs = self.make("Deles", owner=self.other)

        mine.parent = theirs
        with self.assertRaises(ValidationError):
            mine.save()

    def test_depth_limit_is_enforced(self):
        parent = self.make("n0")
        for i in range(1, MAX_FOLDER_DEPTH):
            parent = self.make(f"n{i}", parent=parent)

        with self.assertRaises(ValidationError):
            self.make("estouro", parent=parent)

    # ------------------------------------------------------------------
    # Reparentização
    # ------------------------------------------------------------------
    def test_moving_folder_rewrites_descendant_paths(self):
        alpha = self.make("Alpha")
        beta = self.make("Beta")
        child = self.make("Filha", parent=alpha)
        grandchild = self.make("Neta", parent=child)

        child.parent = beta
        child.save()

        child.refresh_from_db()
        grandchild.refresh_from_db()

        self.assertEqual(child.path, f"{beta.pk}/{child.pk}/")
        self.assertEqual(grandchild.path, f"{beta.pk}/{child.pk}/{grandchild.pk}/")
        self.assertEqual(child.depth, 1)
        self.assertEqual(grandchild.depth, 2)

    def test_promoting_to_root_resets_depth(self):
        root = self.make("Raiz")
        child = self.make("Filha", parent=root)
        grandchild = self.make("Neta", parent=child)

        child.parent = None
        child.save()

        child.refresh_from_db()
        grandchild.refresh_from_db()

        self.assertEqual(child.depth, 0)
        self.assertEqual(grandchild.depth, 1)
        self.assertEqual(grandchild.path, f"{child.pk}/{grandchild.pk}/")

    def test_deleting_parent_cascades_to_subfolders(self):
        """A cascata agora é suave: some da navegação, fica na lixeira."""
        root = self.make("Raiz")
        self.make("Filha", parent=root)
        root.delete()
        self.assertEqual(Folder.objects.alive().count(), 0)
        self.assertEqual(Folder.objects.trashed().count(), 2)

    def test_hard_delete_removes_the_subtree_for_good(self):
        root = self.make("Raiz")
        filha = self.make("Filha", parent=root)
        root.delete()
        Folder.objects.trashed().hard_delete()
        self.assertFalse(Folder.objects.filter(pk__in=[root.pk, filha.pk]).exists())

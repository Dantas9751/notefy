"""Testes de API: autenticação, hierarquia obrigatória e rotas especiais."""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from content.models import Document
from organization.models import Category, Folder
from planner.models import Task
from users.models import User

from .testutils import make_category, make_document, make_folder, make_upload


class AuthFlowTests(APITestCase):
    def test_register_returns_tokens_and_creates_preferences(self):
        response = self.client.post(
            reverse("auth-register"),
            {
                "email": "novo@ex.com",
                "full_name": "Novo Usuário",
                "password": "senha-forte-123",
                "password_confirm": "senha-forte-123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertTrue(hasattr(User.objects.get(email="novo@ex.com"), "preferences"))

    def test_register_rejects_mismatched_passwords(self):
        response = self.client.post(
            reverse("auth-register"),
            {"email": "x@ex.com", "password": "senha-forte-123",
             "password_confirm": "outra-senha-456"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_returns_user_payload(self):
        User.objects.create_user(email="user@ex.com", password="senha-forte-123")
        response = self.client.post(
            reverse("auth-login"),
            {"email": "user@ex.com", "password": "senha-forte-123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["email"], "user@ex.com")

    def test_endpoints_require_authentication(self):
        """Todo endpoint de dados precisa recusar requisição anônima.

        Cobre a lista inteira porque `permission_classes` num viewset
        SUBSTITUI o default global do DRF — basta um viewset declarar as
        suas e esquecer IsAuthenticated para reabrir o buraco.
        """
        protected = [
            "/api/documents/", "/api/documents/stats/", "/api/documents/palette/",
            "/api/folders/", "/api/folders/tree/", "/api/categories/",
            "/api/tasks/", "/api/tasks/board/", "/api/tasks/calendar/",
            "/api/tasks/unscheduled/", "/api/checklist-items/",
            "/api/search/", "/api/search/facets/", "/api/me/", "/api/me/preferences/",
        ]
        for url in protected:
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code, status.HTTP_401_UNAUTHORIZED
                )


class HierarchyTests(APITestCase):
    """Categoria → pasta → item, sem exceção."""

    def setUp(self):
        self.user = User.objects.create_user(email="h@ex.com", password="senha-forte-123")
        self.client.force_authenticate(self.user)
        self.category = make_category(self.user, "Biologia")

    def test_root_folder_requires_category(self):
        response = self.client.post("/api/folders/", {"name": "Solta"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category", response.data)

    def test_document_requires_folder(self):
        response = self.client.post(
            "/api/documents/", {"kind": "note", "title": "Sem casa"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("folder", response.data)

    def test_upload_requires_a_destination(self):
        response = self.client.post(
            "/api/documents/upload/", {"files": [make_upload()]}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("folder", response.data)

    def test_subfolder_inherits_category_from_parent(self):
        root = make_folder(self.user, self.category, "Provas")
        other = make_category(self.user, "Cálculo")

        # Mesmo mandando outra categoria, a subpasta herda a do pai — é o
        # que impede uma subpasta de Biologia virar Cálculo sem sair do lugar.
        response = self.client.post(
            "/api/folders/",
            {"name": "P1", "parent": str(root.pk), "category": str(other.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Folder.objects.get(pk=response.data["id"]).category_id, self.category.pk
        )

    def test_moving_root_folder_carries_subtree_to_new_category(self):
        root = make_folder(self.user, self.category, "Provas")
        child = make_folder(self.user, name="P1", parent=root)
        grandchild = make_folder(self.user, name="Q1", parent=child)
        destino = make_category(self.user, "Física")

        response = self.client.post(
            f"/api/folders/{root.pk}/move/", {"category": str(destino.pk)}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        for folder in (root, child, grandchild):
            folder.refresh_from_db()
            self.assertEqual(folder.category_id, destino.pk)

    def test_document_category_comes_from_its_folder(self):
        folder = make_folder(self.user, self.category, "Genética")
        doc = make_document(self.user, folder, title="Mitose")

        response = self.client.get(f"/api/documents/{doc.pk}/")
        self.assertEqual(response.data["category"]["name"], "Biologia")

    def test_moving_document_changes_its_category(self):
        origem = make_folder(self.user, self.category, "Origem")
        outra = make_category(self.user, "Química")
        destino = make_folder(self.user, outra, "Destino")
        doc = make_document(self.user, origem, title="Nota")

        self.client.post(f"/api/documents/{doc.pk}/move/", {"folder": str(destino.pk)},
                         format="json")

        response = self.client.get(f"/api/documents/{doc.pk}/")
        self.assertEqual(response.data["category"]["name"], "Química")

    def test_category_with_folders_cannot_be_deleted(self):
        """Apagar a categoria levaria junto todo o conteúdo; a API recusa."""
        make_folder(self.user, self.category, "Cheia")
        response = self.client.delete(f"/api/categories/{self.category.pk}/")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Category.objects.filter(pk=self.category.pk).exists())

    def test_folder_with_documents_cannot_be_deleted(self):
        folder = make_folder(self.user, self.category, "Cheia")
        make_document(self.user, folder)
        response = self.client.delete(f"/api/folders/{folder.pk}/")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Folder.objects.filter(pk=folder.pk).exists())

    def test_folder_with_subfolders_cannot_be_deleted(self):
        root = make_folder(self.user, self.category, "Raiz")
        make_folder(self.user, name="Filha", parent=root)
        self.assertEqual(
            self.client.delete(f"/api/folders/{root.pk}/").status_code,
            status.HTTP_409_CONFLICT,
        )

    def test_empty_folder_can_be_deleted(self):
        folder = make_folder(self.user, self.category, "Vazia")
        self.assertEqual(
            self.client.delete(f"/api/folders/{folder.pk}/").status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_deleting_the_account_removes_the_whole_hierarchy(self):
        """A recusa é da API, não do banco.

        No banco a relação cascateia de propósito: com PROTECT, apagar uma
        conta seria impossível — o coletor do Django não atravessa chaves
        protegidas e morreria em ProtectedError.
        """
        folder = make_folder(self.user, self.category, "Cheia")
        make_document(self.user, folder, title="Conteúdo")

        self.user.delete()

        self.assertEqual(Category.objects.count(), 0)
        self.assertEqual(Folder.objects.count(), 0)
        self.assertEqual(Document.objects.count(), 0)

    def test_root_folder_names_are_unique_only_within_the_category(self):
        outra = make_category(self.user, "Cálculo")
        make_folder(self.user, self.category, "Provas")
        # Mesmo nome, categoria diferente: permitido.
        response = self.client.post(
            "/api/folders/", {"name": "Provas", "category": str(outra.pk)}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_tree_groups_folders_under_their_category(self):
        root = make_folder(self.user, self.category, "Provas")
        make_folder(self.user, name="P1", parent=root)

        response = self.client.get("/api/folders/tree/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        biologia = next(c for c in response.data if c["name"] == "Biologia")
        self.assertEqual(biologia["folders"][0]["name"], "Provas")
        self.assertEqual(biologia["folders"][0]["children"][0]["name"], "P1")

    def test_category_contents_lists_only_root_folders(self):
        root = make_folder(self.user, self.category, "Provas")
        make_folder(self.user, name="P1", parent=root)

        response = self.client.get(f"/api/categories/{self.category.pk}/contents/")
        self.assertEqual([f["name"] for f in response.data["folders"]], ["Provas"])


class OwnershipIsolationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user(email="alice@ex.com", password="senha-forte-123")
        cls.bob = User.objects.create_user(email="bob@ex.com", password="senha-forte-123")
        cls.bob_folder = make_folder(cls.bob, name="Pasta do Bob")
        cls.bob_doc = make_document(cls.bob, cls.bob_folder, title="Nota do Bob")
        cls.alice_folder = make_folder(cls.alice, name="Pasta da Alice")

    def setUp(self):
        self.client.force_authenticate(self.alice)

    def test_list_only_returns_own_records(self):
        make_document(self.alice, self.alice_folder, title="Nota da Alice")
        response = self.client.get("/api/documents/")
        self.assertEqual([d["title"] for d in response.data["results"]], ["Nota da Alice"])

    def test_cannot_read_another_users_record(self):
        self.assertEqual(
            self.client.get(f"/api/documents/{self.bob_doc.pk}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_cannot_put_document_in_another_users_folder(self):
        """Sem OwnedPrimaryKeyRelatedField isto passaria e vazaria dados."""
        response = self.client.post(
            "/api/documents/",
            {"title": "Invasora", "folder": str(self.bob_folder.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("folder", response.data)

    def test_owner_is_taken_from_session_not_payload(self):
        response = self.client.post(
            "/api/documents/",
            {"title": "Minha", "folder": str(self.alice_folder.pk), "owner": str(self.bob.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Document.objects.get(pk=response.data["id"]).owner, self.alice)

    def test_folder_cycle_is_rejected_with_400_not_500(self):
        root = make_folder(self.alice, name="Raiz")
        child = make_folder(self.alice, name="Filha", parent=root)

        response = self.client.post(
            f"/api/folders/{root.pk}/move/", {"parent": str(child.pk)}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("parent", response.data)


class DocumentKindTests(APITestCase):
    """Os cinco tipos convivem na mesma pasta."""

    def setUp(self):
        self.user = User.objects.create_user(email="k@ex.com", password="senha-forte-123")
        self.client.force_authenticate(self.user)
        self.category = make_category(self.user, "Estudos")
        self.folder = make_folder(self.user, self.category, "Semestre 1")

    def test_creates_every_editable_kind_with_starter_payload(self):
        for kind in ("note", "spreadsheet", "diagram", "canvas"):
            with self.subTest(kind=kind):
                response = self.client.post(
                    "/api/documents/",
                    {"kind": kind, "title": f"Item {kind}", "folder": str(self.folder.pk)},
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                data = response.data["data"]
                if kind == "spreadsheet":
                    self.assertTrue(data["columns"])
                elif kind in ("diagram", "canvas"):
                    self.assertIn("viewport", data)

    def test_file_kind_requires_upload(self):
        response = self.client.post(
            "/api/documents/",
            {"kind": "file", "title": "Sem arquivo", "folder": str(self.folder.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)

    def test_upload_creates_file_documents_in_a_folder(self):
        response = self.client.post(
            "/api/documents/upload/",
            {"files": [make_upload("a.pdf"), make_upload("b.pdf")],
             "folder": str(self.folder.pk)},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Document.objects.filter(kind="file", folder=self.folder).count(), 2)

    def test_file_metadata_is_derived_from_upload(self):
        response = self.client.post(
            "/api/documents/upload/",
            {"files": [make_upload("aula.pdf")], "folder": str(self.folder.pk)},
            format="multipart",
        )
        doc = Document.objects.get(pk=response.data[0]["id"])
        self.assertEqual(doc.file_kind, Document.FileKind.PDF)
        self.assertEqual(doc.mime_type, "application/pdf")
        self.assertTrue(doc.checksum)

    def test_folder_holds_every_kind_together(self):
        """O ponto do Drive+Notion: tipos diferentes na mesma pasta."""
        for kind in ("note", "spreadsheet", "diagram", "canvas"):
            make_document(self.user, self.folder, kind=kind, title=f"{kind} na pasta")
        self.client.post(
            "/api/documents/upload/",
            {"files": [make_upload()], "folder": str(self.folder.pk)},
            format="multipart",
        )

        response = self.client.get(f"/api/folders/{self.folder.pk}/contents/")
        self.assertEqual(len(response.data["documents"]), 5)
        self.assertEqual(
            response.data["counts_by_kind"],
            {"note": 1, "spreadsheet": 1, "diagram": 1, "canvas": 1, "file": 1},
        )

    def test_category_filter_reaches_every_kind_through_the_folder(self):
        for kind in ("note", "spreadsheet", "diagram", "canvas"):
            make_document(self.user, self.folder, kind=kind, title=kind)

        response = self.client.get("/api/documents/", {"category": str(self.category.pk)})
        self.assertEqual(response.data["count"], 4)

    def test_kind_filter_narrows_listing(self):
        make_document(self.user, self.folder, kind="note", title="N")
        make_document(self.user, self.folder, kind="spreadsheet", title="P")

        response = self.client.get("/api/documents/", {"kind": "spreadsheet"})
        self.assertEqual([d["title"] for d in response.data["results"]], ["P"])

    def test_stats_counts_by_kind(self):
        make_document(self.user, self.folder, kind="note", title="N1")
        make_document(self.user, self.folder, kind="note", title="N2")
        make_document(self.user, self.folder, kind="canvas", title="C")

        response = self.client.get("/api/documents/stats/")
        self.assertEqual(response.data["by_kind"]["note"], 2)
        self.assertEqual(response.data["total"], 3)

    def test_attachment_inherits_the_folder_of_its_host(self):
        note = make_document(self.user, self.folder, title="Aula")
        response = self.client.post(
            "/api/documents/upload/",
            {"files": [make_upload()], "attached_to": str(note.pk)},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Document.objects.get(pk=response.data[0]["id"]).folder_id, self.folder.pk
        )

    def test_attachments_do_not_appear_loose_in_listings(self):
        note = make_document(self.user, self.folder, title="Aula")
        self.client.post(
            "/api/documents/upload/",
            {"files": [make_upload()], "attached_to": str(note.pk)},
            format="multipart",
        )

        listing = self.client.get("/api/documents/")
        self.assertEqual([d["title"] for d in listing.data["results"]], ["Aula"])
        self.assertEqual(len(self.client.get(f"/api/documents/{note.pk}/").data["attachments"]), 1)

    def test_moving_a_document_carries_its_attachments(self):
        note = make_document(self.user, self.folder, title="Aula")
        self.client.post(
            "/api/documents/upload/",
            {"files": [make_upload()], "attached_to": str(note.pk)},
            format="multipart",
        )
        destino = make_folder(self.user, self.category, "Arquivo morto")

        self.client.post(f"/api/documents/{note.pk}/move/", {"folder": str(destino.pk)},
                         format="json")

        self.assertEqual(
            Document.objects.filter(attached_to=note).first().folder_id, destino.pk
        )

    def test_cannot_attach_to_an_attachment(self):
        note = make_document(self.user, self.folder, title="Aula")
        upload = self.client.post(
            "/api/documents/upload/",
            {"files": [make_upload()], "attached_to": str(note.pk)},
            format="multipart",
        )
        response = self.client.post(
            "/api/documents/upload/",
            {"files": [make_upload()], "attached_to": upload.data[0]["id"]},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class DocumentPayloadValidationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="v@ex.com", password="senha-forte-123")
        self.client.force_authenticate(self.user)
        self.folder = make_folder(self.user, name="Payloads")

    def post(self, kind, data):
        return self.client.post(
            "/api/documents/",
            {"kind": kind, "title": "T", "folder": str(self.folder.pk), "data": data},
            format="json",
        )

    def test_spreadsheet_rejects_unknown_column_type(self):
        response = self.post(
            "spreadsheet",
            {"columns": [{"id": "c1", "name": "X", "type": "quantico"}], "rows": []},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_spreadsheet_rejects_duplicate_column_ids(self):
        response = self.post(
            "spreadsheet",
            {"columns": [{"id": "c1", "name": "A", "type": "text"},
                         {"id": "c1", "name": "B", "type": "text"}], "rows": []},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_diagram_rejects_edge_pointing_to_missing_node(self):
        """Aresta órfã quebraria a renderização: não há de onde desenhar."""
        response = self.post(
            "diagram",
            {"nodes": [{"id": "n1", "type": "class", "x": 0, "y": 0}],
             "edges": [{"id": "e1", "type": "association", "from": "n1", "to": "fantasma"}]},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_diagram_rejects_canvas_only_node_type(self):
        response = self.post(
            "diagram", {"nodes": [{"id": "n1", "type": "card", "x": 0, "y": 0}], "edges": []}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_canvas_accepts_its_own_vocabulary(self):
        response = self.post(
            "canvas",
            {"nodes": [{"id": "n1", "type": "card", "x": 0, "y": 0, "text": "Ideia"},
                       {"id": "n2", "type": "link", "x": 200, "y": 0, "url": "https://ex.com"}],
             "edges": [{"id": "e1", "type": "arrow", "from": "n1", "to": "n2"}]},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_uml_vocabulary_is_accepted(self):
        response = self.post(
            "diagram",
            {"nodes": [{"id": "n1", "type": "class", "x": 0, "y": 0, "text": "Usuario",
                        "fields": ["email"], "methods": ["login()"]},
                       {"id": "n2", "type": "class", "x": 300, "y": 0, "text": "Conta"}],
             "edges": [{"id": "e1", "type": "inheritance", "from": "n2", "to": "n1"}]},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_reset_clears_editor_payload(self):
        doc = make_document(
            self.user, self.folder, kind="canvas", title="C",
            data={"nodes": [{"id": "n1", "type": "card", "x": 0, "y": 0}], "edges": []},
        )
        response = self.client.post(f"/api/documents/{doc.pk}/reset/")
        self.assertEqual(response.data["data"]["nodes"], [])

    def test_reset_refuses_notes(self):
        doc = make_document(self.user, self.folder, kind="note", title="N")
        self.assertEqual(
            self.client.post(f"/api/documents/{doc.pk}/reset/").status_code,
            status.HTTP_400_BAD_REQUEST,
        )


class PdfExportTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="pdf@ex.com", password="senha-forte-123")
        self.client.force_authenticate(self.user)
        self.folder = make_folder(self.user, name="Estudos")
        self.note = make_document(
            self.user, self.folder, kind="note", title="Algoritmos",
            data={"sections": [
                {"id": "s1", "type": "text", "html": "<h2>Busca</h2><p>Divide ao meio.</p>"},
                {"id": "s2", "type": "code", "language": "python",
                 "title": "busca.py", "code": "def f(x):\n    return x * 2\n"},
            ]},
        )

    def test_get_downloads_a_pdf(self):
        response = self.client.get(f"/api/documents/{self.note.pk}/pdf/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertTrue(response.content.startswith(b"%PDF-"))

    def test_post_saves_the_pdf_in_the_same_folder(self):
        """É o "salvar como PDF dentro do Notefy": vira um item comum."""
        response = self.client.post(f"/api/documents/{self.note.pk}/pdf/")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        saved = Document.objects.get(pk=response.data["id"])
        self.assertEqual(saved.kind, Document.Kind.FILE)
        self.assertEqual(saved.file_kind, Document.FileKind.PDF)
        self.assertEqual(saved.folder_id, self.folder.pk)
        # Não é anexo da nota: fica visível na pasta como qualquer arquivo.
        self.assertIsNone(saved.attached_to_id)
        self.assertGreater(saved.size, 0)

    def test_only_notes_can_be_exported(self):
        sheet = make_document(self.user, self.folder, kind="spreadsheet", title="P")
        self.assertEqual(
            self.client.get(f"/api/documents/{sheet.pk}/pdf/").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_cannot_export_another_users_note(self):
        other = User.objects.create_user(email="outro@ex.com", password="senha-forte-123")
        alheia = make_document(other, make_folder(other, name="Dele"), kind="note", title="X")
        self.assertEqual(
            self.client.get(f"/api/documents/{alheia.pk}/pdf/").status_code,
            status.HTTP_404_NOT_FOUND,
        )


class NoteSectionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="sec@ex.com", password="senha-forte-123")
        self.client.force_authenticate(self.user)
        self.folder = make_folder(self.user, name="Notas")

    def test_creates_a_note_with_text_and_code_sections(self):
        response = self.client.post(
            "/api/documents/",
            {
                "kind": "note", "title": "Estruturas", "folder": str(self.folder.pk),
                "data": {"sections": [
                    {"id": "s1", "type": "text", "html": "<p>Pilha</p>"},
                    {"id": "s2", "type": "code", "language": "python", "code": "stack.pop()"},
                ]},
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["data"]["sections"]), 2)

    def test_code_inside_a_note_is_searchable(self):
        with self.captureOnCommitCallbacks(execute=True):
            make_document(
                self.user, self.folder, kind="note", title="Sem pistas no título",
                data={"sections": [
                    {"id": "s1", "type": "code", "language": "python",
                     "code": "def calcular_entropia(dados):"},
                ]},
            )
        response = self.client.get("/api/search/", {"q": "calcular_entropia"})
        self.assertEqual(
            [r["title"] for r in response.data["results"]], ["Sem pistas no título"]
        )

    def test_legacy_content_becomes_a_text_section(self):
        """Nota criada só com `content` não pode perder o corpo."""
        doc = make_document(
            self.user, self.folder, kind="note", title="Antiga",
            content="<p>uma duas três</p>",
        )
        self.assertEqual(doc.data["sections"][0]["html"], "<p>uma duas três</p>")
        self.assertEqual(doc.word_count, 3)

    def test_invalid_section_is_rejected_with_400(self):
        response = self.client.post(
            "/api/documents/",
            {
                "kind": "note", "title": "Ruim", "folder": str(self.folder.pk),
                "data": {"sections": [{"id": "s1", "type": "code", "language": "klingon"}]},
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PlannerTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="task@ex.com", password="senha-forte-123")
        self.client.force_authenticate(self.user)
        self.folder = make_folder(self.user, name="Planner")

    def test_board_groups_by_status(self):
        Task.objects.create(title="A", status=Task.Status.TODO, owner=self.user)
        Task.objects.create(title="B", status=Task.Status.DONE, owner=self.user)

        columns = {c["status"]: c for c in self.client.get("/api/tasks/board/").data["columns"]}
        self.assertEqual(len(columns["todo"]["tasks"]), 1)
        self.assertEqual(len(columns["done"]["tasks"]), 1)

    def test_move_rejects_invalid_status(self):
        task = Task.objects.create(title="Mover", owner=self.user)
        response = self.client.post(
            f"/api/tasks/{task.pk}/move/", {"status": "inexistente"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_completed_at_is_derived_from_status(self):
        task = Task.objects.create(title="Concluir", owner=self.user)
        self.assertIsNone(task.completed_at)
        task.status = Task.Status.DONE
        task.save()
        self.assertIsNotNone(task.completed_at)
        task.status = Task.Status.TODO
        task.save()
        self.assertIsNone(task.completed_at)

    def test_task_can_link_to_any_document_kind(self):
        sheet = make_document(self.user, self.folder, kind="spreadsheet", title="Notas")
        response = self.client.post(
            "/api/tasks/", {"title": "Preencher", "document": str(sheet.pk)}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["document_kind"], "spreadsheet")

    # -- ponte quadro ↔ calendário ------------------------------------
    def test_unscheduled_lists_tasks_without_a_date(self):
        Task.objects.create(title="Sem data", owner=self.user)
        Task.objects.create(title="Com data", starts_at="2026-08-15T10:00:00Z", owner=self.user)

        response = self.client.get("/api/tasks/unscheduled/")
        self.assertEqual([t["title"] for t in response.data], ["Sem data"])

    def test_schedule_puts_a_board_task_on_the_calendar(self):
        task = Task.objects.create(title="Agendar", owner=self.user)

        response = self.client.post(
            f"/api/tasks/{task.pk}/schedule/",
            {"starts_at": "2026-08-15T10:00:00Z"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        calendar = self.client.get(
            "/api/tasks/calendar/",
            {"start": "2026-08-01T00:00:00Z", "end": "2026-09-01T00:00:00Z"},
        )
        self.assertEqual([e["title"] for e in calendar.data], ["Agendar"])

    def test_schedule_with_null_takes_the_task_off_the_calendar(self):
        task = Task.objects.create(
            title="Desagendar",
            starts_at="2026-08-15T10:00:00Z",
            ends_at="2026-08-15T12:00:00Z",
            owner=self.user,
        )
        self.client.post(f"/api/tasks/{task.pk}/schedule/", {"starts_at": None}, format="json")

        task.refresh_from_db()
        self.assertIsNone(task.starts_at)
        # O fim não pode sobreviver ao início, senão sobraria uma janela
        # sem começo.
        self.assertIsNone(task.ends_at)

    def test_dragging_in_the_calendar_preserves_the_duration(self):
        task = Task.objects.create(
            title="Mover no calendário",
            starts_at="2026-08-15T10:00:00Z",
            ends_at="2026-08-15T12:00:00Z",
            owner=self.user,
        )
        self.client.post(
            f"/api/tasks/{task.pk}/schedule/",
            {"starts_at": "2026-08-20T10:00:00Z"},
            format="json",
        )
        task.refresh_from_db()
        self.assertEqual((task.ends_at - task.starts_at).total_seconds(), 2 * 3600)

    def test_schedule_rejects_end_before_start(self):
        task = Task.objects.create(title="Invertida", owner=self.user)
        response = self.client.post(
            f"/api/tasks/{task.pk}/schedule/",
            {"starts_at": "2026-08-15T12:00:00Z", "ends_at": "2026-08-15T10:00:00Z"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_end_before_start_is_rejected_on_create(self):
        response = self.client.post(
            "/api/tasks/",
            {"title": "Invertida", "starts_at": "2026-08-10T10:00:00Z",
             "ends_at": "2026-08-10T09:00:00Z"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class GlobalSearchTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="s@ex.com", password="senha-forte-123")
        self.client.force_authenticate(self.user)
        self.category = make_category(self.user, "Biologia")
        self.folder = make_folder(self.user, self.category, "Genética")

    def test_search_spans_documents_folders_and_tasks(self):
        make_document(self.user, self.folder, title="Fotossíntese")
        make_folder(self.user, self.category, "Fotossíntese e plantas")
        Task.objects.create(title="Estudar fotossíntese", owner=self.user)

        response = self.client.get("/api/search/", {"q": "fotossíntese"})
        self.assertEqual(
            {r["type"] for r in response.data["results"]}, {"note", "folder", "task"}
        )

    def test_each_document_kind_is_its_own_search_type(self):
        for kind in ("note", "spreadsheet", "diagram", "canvas"):
            make_document(self.user, self.folder, kind=kind, title="Mitose")

        response = self.client.get("/api/search/", {"q": "mitose"})
        self.assertEqual(
            {r["type"] for r in response.data["results"]},
            {"note", "spreadsheet", "diagram", "canvas"},
        )
        narrowed = self.client.get("/api/search/", {"q": "mitose", "type": "canvas"})
        self.assertEqual({r["type"] for r in narrowed.data["results"]}, {"canvas"})

    def test_spreadsheet_is_found_by_cell_content(self):
        """Sem extrair texto do payload, planilhas só seriam achadas pelo título."""
        with self.captureOnCommitCallbacks(execute=True):
            make_document(
                self.user, self.folder, kind="spreadsheet",
                title="Planilha sem pistas no nome",
                data={"columns": [{"id": "c1", "name": "Disciplina", "type": "text"}],
                      "rows": [{"id": "r1", "cells": {"c1": "Bioquímica"}}]},
            )
        response = self.client.get("/api/search/", {"q": "bioquímica"})
        self.assertEqual(
            [r["title"] for r in response.data["results"]], ["Planilha sem pistas no nome"]
        )

    def test_diagram_is_found_by_node_label(self):
        with self.captureOnCommitCallbacks(execute=True):
            make_document(
                self.user, self.folder, kind="diagram", title="Modelo",
                data={"nodes": [{"id": "n1", "type": "class", "x": 0, "y": 0,
                                 "text": "Matricula", "fields": ["semestre"]}], "edges": []},
            )
        response = self.client.get("/api/search/", {"q": "matricula"})
        self.assertEqual([r["title"] for r in response.data["results"]], ["Modelo"])

    def test_file_is_found_by_part_of_its_name(self):
        """O Postgres trata 'relatorio_final.pdf' como um token só; guardar
        o nome também quebrado em palavras é o que faz a busca parcial valer."""
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                "/api/documents/upload/",
                {"files": [make_upload("relatorio_final.pdf")], "folder": str(self.folder.pk)},
                format="multipart",
            )
        response = self.client.get("/api/search/", {"q": "relatorio"})
        self.assertEqual(
            [r["title"] for r in response.data["results"]], ["relatorio_final.pdf"]
        )

    def test_category_filter_reaches_items_through_their_folder(self):
        make_document(self.user, self.folder, title="Célula")
        outra = make_folder(self.user, make_category(self.user, "Outra"), "Fora")
        make_document(self.user, outra, title="Célula fora")

        response = self.client.get(
            "/api/search/",
            {"q": "célula", "category": str(self.category.pk), "type": "note"},
        )
        self.assertEqual([r["title"] for r in response.data["results"]], ["Célula"])

    def test_search_excludes_other_users_data(self):
        other = User.objects.create_user(email="other@ex.com", password="senha-forte-123")
        make_document(other, make_folder(other, name="Dele"), title="Segredo alheio")

        self.assertEqual(self.client.get("/api/search/", {"q": "segredo"}).data["total"], 0)

    def test_facets_lists_categories_and_every_type(self):
        response = self.client.get("/api/search/facets/")
        self.assertEqual([c["name"] for c in response.data["categories"]], ["Biologia"])
        values = {t["value"] for t in response.data["types"]}
        self.assertTrue({"note", "file", "spreadsheet", "diagram", "canvas"} <= values)


class DocumentDerivedFieldTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="n@ex.com", password="senha-forte-123")
        self.client.force_authenticate(self.user)
        self.folder = make_folder(self.user, name="Derivados")

    def test_html_tags_do_not_count_as_words(self):
        """O editor rico salva HTML; a contagem tem de ver só o texto."""
        doc = make_document(
            self.user, self.folder, title="Resumo",
            content='<p><span style="color:#f00">uma</span> duas</p><p>três quatro</p>',
        )
        self.assertEqual(doc.word_count, 4)
        self.assertNotIn("<", doc.excerpt)

    def test_duplicate_creates_independent_copy_in_the_same_folder(self):
        original = make_document(self.user, self.folder, title="Original", content="x")
        response = self.client.post(f"/api/documents/{original.pk}/duplicate/")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(response.data["id"], str(original.pk))
        self.assertEqual(response.data["title"], "Original (cópia)")
        self.assertEqual(str(response.data["folder"]), str(self.folder.pk))

    def test_list_omits_heavy_payloads(self):
        make_document(self.user, self.folder, title="Longa", content="x" * 5000)
        response = self.client.get("/api/documents/")
        self.assertNotIn("content", response.data["results"][0])
        self.assertNotIn("data", response.data["results"][0])

    def test_title_matches_rank_above_body_matches(self):
        """O peso A do título tem que vencer o peso B do corpo.

        Um `score > 0` sozinho passa mesmo com o tsvector corrompido,
        porque a coluna convertida para texto ainda contém as palavras
        originais — só a ordenação por peso denuncia o problema.
        """
        with self.captureOnCommitCallbacks(execute=True):
            make_document(
                self.user, self.folder, title="Nota sobre outro assunto",
                content="Uma menção passageira a osmose no meio do texto.",
            )
            make_document(self.user, self.folder, title="Osmose", content="Qualquer coisa.")

        results = self.client.get("/api/search/", {"q": "osmose", "type": "note"}).data["results"]
        self.assertEqual(results[0]["title"], "Osmose")
        self.assertGreater(results[0]["score"], results[1]["score"])

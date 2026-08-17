"""Login por nome de usuário, perfil e backup."""

import io
import zipfile

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from content.models import Document
from core.testutils import make_category, make_document, make_folder, make_upload, make_user
from organization.models import Category, Folder
from planner.models import Task
from users import backup
from users.models import User


class LoginPorUsernameTests(APITestCase):
    def test_cadastro_pede_so_username_e_senha(self):
        response = self.client.post(
            reverse("auth-register"),
            {
                "username": "joana",
                "password": "senha-forte-123",
                "password_confirm": "senha-forte-123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("email", response.data["user"])
        self.assertEqual(response.data["user"]["username"], "joana")

    def test_username_repetido_e_recusado_sem_diferenciar_maiusculas(self):
        make_user(username="Joana")
        response = self.client.post(
            reverse("auth-register"),
            {
                "username": "joana",
                "password": "senha-forte-123",
                "password_confirm": "senha-forte-123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_login_usa_username(self):
        make_user(username="pedro", password="senha-forte-123")
        response = self.client.post(
            reverse("auth-login"),
            {"username": "pedro", "password": "senha-forte-123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_trocar_o_proprio_username(self):
        user = make_user(username="antigo")
        self.client.force_authenticate(user)
        response = self.client.patch(reverse("me"), {"username": "novo"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertEqual(user.username, "novo")

    def test_nao_da_para_roubar_o_username_de_outra_pessoa(self):
        make_user(username="ocupado")
        user = make_user(username="eu")
        self.client.force_authenticate(user)
        response = self.client.patch(reverse("me"), {"username": "ocupado"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class BackupTests(APITestCase):
    def setUp(self):
        self.user = make_user(username="dono")
        categoria = make_category(self.user, name="Estudos")
        pasta = make_folder(self.user, category=categoria, name="Cálculo")
        make_document(self.user, pasta, kind="note", title="Limites", content="<p>oi</p>")
        Document.objects.create(
            owner=self.user, folder=pasta, kind="file", title="prova.pdf", file=make_upload()
        )
        Task.objects.create(owner=self.user, title="Revisar", status="todo")

    def test_exportar_devolve_um_zip_com_manifesto_e_arquivos(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("me-backup-export"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/zip")

        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            nomes = zf.namelist()
        self.assertIn("notefy.json", nomes)
        self.assertTrue(any(n.startswith("media/") for n in nomes))

    def test_ida_e_volta_preserva_conteudo_e_metadados_do_arquivo(self):
        blob = backup.exportar(self.user)
        outro = make_user(username="outro")
        resumo = backup.importar(outro, io.BytesIO(blob))

        self.assertEqual(resumo["categorias"], 1)
        self.assertEqual(resumo["documentos"], 2)
        self.assertEqual(resumo["tarefas"], 1)

        original = Document.objects.get(owner=self.user, kind="file")
        copia = Document.objects.get(owner=outro, kind="file")
        # O checksum é o teste de verdade: prova que os bytes chegaram
        # inteiros, e não só que existe um arquivo com o mesmo nome.
        self.assertEqual(copia.checksum, original.checksum)
        self.assertEqual(copia.size, original.size)
        self.assertEqual(copia.mime_type, original.mime_type)

    def test_importar_duas_vezes_renomeia_em_vez_de_estourar(self):
        blob = backup.exportar(self.user)
        backup.importar(self.user, io.BytesIO(blob))
        backup.importar(self.user, io.BytesIO(blob))

        nomes = sorted(Category.objects.filter(owner=self.user).values_list("name", flat=True))
        self.assertEqual(nomes, ["Estudos", "Estudos (2)", "Estudos (3)"])

    def test_substituir_troca_o_conteudo_em_vez_de_somar(self):
        blob = backup.exportar(self.user)
        make_category(self.user, name="Lixo")
        backup.importar(self.user, io.BytesIO(blob), substituir=True)

        self.assertEqual(Category.objects.filter(owner=self.user).count(), 1)
        self.assertEqual(Folder.objects.filter(owner=self.user).count(), 1)
        self.assertEqual(Document.objects.filter(owner=self.user).count(), 2)

    def test_zip_que_nao_e_backup_do_notefy_da_400(self):
        self.client.force_authenticate(self.user)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            zf.writestr("qualquer.txt", "nada a ver")
        buffer.seek(0)
        buffer.name = "x.zip"

        response = self.client.post(
            reverse("me-backup-import"), {"file": buffer}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_backup_leva_so_o_conteudo_de_quem_pediu(self):
        vizinho = make_user(username="vizinho")
        make_category(vizinho, name="Segredo")

        blob = backup.exportar(self.user)
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            manifesto = zf.read("notefy.json").decode("utf-8")
        self.assertNotIn("Segredo", manifesto)

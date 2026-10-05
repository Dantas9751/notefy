"""Somente leitura (Propriedades) e os números da janela de pasta e categoria.

Somente leitura protege o conteúdo, como o atributo do Windows: editar o
texto volta 423, mas renomear, mover e desmarcar continuam valendo.
"""

from rest_framework.test import APITestCase

from content.models import Document
from core.testutils import make_category, make_document, make_folder, make_user

NOTA = {"sections": [{"id": "s1", "type": "text", "html": "<p>Original</p>"}]}
EDITADA = {"sections": [{"id": "s1", "type": "text", "html": "<p>Mexida</p>"}]}


class SomenteLeituraTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)
        self.doc = make_document(self.user, title="Prova", data=NOTA, is_read_only=True)
        self.url = f"/api/documents/{self.doc.id}/"

    def test_editar_o_conteudo_volta_423(self):
        resposta = self.client.patch(self.url, {"data": EDITADA}, format="json")
        self.assertEqual(resposta.status_code, 423, resposta.content)
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.data, NOTA)

    def test_renomear_vale_mesmo_com_o_corpo_inteiro(self):
        # O editor manda tudo a cada gravação; o conteúdo igual não conta.
        resposta = self.client.patch(self.url, {"title": "Prova 1", "data": NOTA}, format="json")
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertEqual(resposta.json()["title"], "Prova 1")

    def test_desmarcar_e_editar_no_mesmo_pedido(self):
        resposta = self.client.patch(self.url, {"is_read_only": False, "data": EDITADA}, format="json")
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.doc.refresh_from_db()
        self.assertFalse(self.doc.is_read_only)
        self.assertEqual(self.doc.data, EDITADA)

    def test_esvaziar_tambem_e_editar(self):
        planilha = make_document(self.user, kind="spreadsheet", title="Notas", is_read_only=True)
        self.assertEqual(self.client.post(f"/api/documents/{planilha.id}/reset/").status_code, 423)

    def test_a_copia_nasce_editavel(self):
        resposta = self.client.post(f"{self.url}duplicate/")
        self.assertEqual(resposta.status_code, 201, resposta.content)
        self.assertFalse(Document.objects.get(pk=resposta.json()["id"]).is_read_only)


class NumerosDasPropriedadesTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def test_pasta_conta_a_subarvore_e_soma_os_arquivos(self):
        categoria = make_category(self.user, name="Faculdade")
        pasta = make_folder(self.user, category=categoria, name="Cálculo")
        sub = make_folder(self.user, category=categoria, name="Listas", parent=pasta)
        nota = make_document(self.user, folder=pasta, title="Resumo")
        make_document(self.user, folder=sub, kind="file", title="lista.pdf", size=1000)
        make_document(self.user, folder=pasta, kind="file", title="foto.png", size=24, attached_to=nota)

        resposta = self.client.get(f"/api/folders/{pasta.id}/properties/")
        self.assertEqual(resposta.json(), {"pastas": 1, "itens": 2, "tamanho": 1024})

        resposta = self.client.get(f"/api/categories/{categoria.id}/properties/")
        self.assertEqual(resposta.json(), {"pastas": 2, "itens": 2, "tamanho": 1024})

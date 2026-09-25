"""Etiquetas do documento.

Um item tem DUAS ligações com categoria: a que ele herda da pasta (onde
mora) e as que recebe à mão (o que é). A busca precisa achar pelas duas —
filtrar só pela herdada deixaria de fora justamente a nota etiquetada.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.testutils import make_category, make_document, make_folder, make_user


class EtiquetasTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        # A categoria de ONDE o item mora.
        self.moradia = make_category(self.user, name="Faculdade")
        self.folder = make_folder(self.user, category=self.moradia)
        # A etiqueta do QUE o item é.
        self.etiqueta = make_category(self.user, name="Revisar")
        self.doc = make_document(self.user, folder=self.folder, title="Integrais")
        self.client.force_authenticate(self.user)

    def test_etiqueta_pelo_patch(self):
        resposta = self.client.patch(
            f"/api/documents/{self.doc.id}/",
            {"categories": [str(self.etiqueta.id)]},
            format="json",
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual([c["name"] for c in resposta.data["categories_detail"]], ["Revisar"])

    def test_busca_acha_pela_etiqueta_direta(self):
        self.doc.categories.add(self.etiqueta)
        resposta = self.client.get(reverse("global-search"), {"category": str(self.etiqueta.id)})
        titulos = [r["title"] for r in resposta.data["results"]]
        self.assertIn("Integrais", titulos)

    def test_busca_continua_achando_pela_categoria_da_pasta(self):
        """A ligação antiga não pode ter sido trocada pela nova."""
        resposta = self.client.get(reverse("global-search"), {"category": str(self.moradia.id)})
        titulos = [r["title"] for r in resposta.data["results"]]
        self.assertIn("Integrais", titulos)

    def test_nao_duplica_quando_as_duas_ligacoes_batem(self):
        """O `OR` vira JOIN duplo: sem `distinct()` o item vinha duas vezes."""
        self.doc.categories.add(self.moradia)
        resposta = self.client.get(reverse("global-search"), {"category": str(self.moradia.id)})
        titulos = [r["title"] for r in resposta.data["results"] if r["type"] == "note"]
        self.assertEqual(titulos.count("Integrais"), 1)

    def test_nao_aceita_categoria_de_outro_usuario(self):
        """`OwnedPrimaryKeyRelatedField`: o filtro do queryset protege a
        leitura, não a escrita de relacionamento."""
        alheia = make_category(make_user(username="outro"), name="Alheia")
        resposta = self.client.patch(
            f"/api/documents/{self.doc.id}/",
            {"categories": [str(alheia.id)]},
            format="json",
        )
        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)


class ListagemTests(APITestCase):
    """A listagem é por onde a pasta, recentes e arquivos entram.

    Nenhum teste a cobria, e foi assim que um `fields` com um campo não
    declarado passou verde e derrubou a tela inteira com 500.
    """

    def setUp(self):
        self.user = make_user()
        self.folder = make_folder(self.user, category=make_category(self.user))
        self.doc = make_document(self.user, folder=self.folder, title="Item")
        self.client.force_authenticate(self.user)

    def test_listagem_responde(self):
        resposta = self.client.get("/api/documents/")
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

    def test_listagem_traz_as_etiquetas(self):
        etiqueta = make_category(self.user, name="Revisar")
        self.doc.categories.add(etiqueta)
        resposta = self.client.get("/api/documents/")
        item = next(r for r in resposta.data["results"] if r["id"] == str(self.doc.id))
        self.assertEqual([c["name"] for c in item["categories_detail"]], ["Revisar"])

    def test_detalhe_responde(self):
        resposta = self.client.get(f"/api/documents/{self.doc.id}/")
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)

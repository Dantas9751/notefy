"""Id malformado chegando pela rede.

Um UUID quebrado num `filter(pk=...)` não devolve queryset vazio: ele
derruba a consulta com `ValueError`, e o que deveria ser "pasta não
encontrada" vira 500 — a tela mostra "algo deu errado" e o usuário não
descobre que só precisava escolher outro destino.

Não é entrada hipotética. Chega de um link salvo com uma categoria já
apagada, de um id copiado pela metade e do payload de um arraste que
ficou na memória depois de o item sumir.
"""

from rest_framework.test import APITestCase

from core.testutils import make_category, make_document, make_folder, make_user


class IdsInvalidosTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.categoria = make_category(self.user)
        self.pasta = make_folder(self.user, category=self.categoria)
        self.doc = make_document(self.user, folder=self.pasta)
        self.client.force_authenticate(self.user)
        self.client.default_format = "json"

    def test_mover_documento_para_pasta_invalida(self):
        resposta = self.client.post(
            f"/api/documents/{self.doc.id}/move/", {"folder": "nao-e-uuid"}
        )
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("folder", resposta.json())

    def test_mover_pasta_para_pai_invalido(self):
        resposta = self.client.post(
            f"/api/folders/{self.pasta.id}/move/", {"parent": "nao-e-uuid"}
        )
        self.assertEqual(resposta.status_code, 400)

    def test_mover_pasta_para_categoria_invalida(self):
        resposta = self.client.post(
            f"/api/folders/{self.pasta.id}/move/", {"category": "nao-e-uuid"}
        )
        self.assertEqual(resposta.status_code, 400)

    def test_busca_ignora_categoria_invalida(self):
        """Aqui o certo é seguir, não recusar.

        O filtro vem da query string e um id inválido não casaria com
        nada; buscar sem ele devolve o que a pessoa queria ver.
        """
        resposta = self.client.get("/api/search/?q=a&category=nao-e-uuid")
        self.assertEqual(resposta.status_code, 200)

    def test_busca_aproveita_a_categoria_boa_de_uma_lista_mista(self):
        resposta = self.client.get(
            f"/api/search/?category=nao-e-uuid&category={self.categoria.id}"
        )
        self.assertEqual(resposta.status_code, 200)
        # O documento mora na pasta desta categoria: o filtro bom sobreviveu.
        titulos = [r["title"] for r in resposta.json()["results"]]
        self.assertIn(self.doc.title, titulos)


class LimitesDaBuscaTests(APITestCase):
    """Números que chegam pela URL, não pelo teclado.

    O `?limit=` do "carregar mais" viaja na query string: um link velho,
    um valor editado à mão ou um cliente com bug mandam qualquer coisa.
    """

    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def test_limite_negativo_nao_derruba_a_busca(self):
        # `qs[:-5]` é recusado pelo Django com ValueError — era 500.
        self.assertEqual(self.client.get("/api/search/?q=a&limit=-5").status_code, 200)

    def test_limite_zero_nao_derruba_a_busca(self):
        self.assertEqual(self.client.get("/api/search/?q=a&limit=0").status_code, 200)

    def test_limite_com_texto_cai_no_padrao(self):
        resposta = self.client.get("/api/search/?q=a&limit=abc")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json()["limit"], 20)

    def test_limite_absurdo_para_no_teto(self):
        resposta = self.client.get("/api/search/?q=a&limit=999999")
        self.assertEqual(resposta.json()["limit"], 200)

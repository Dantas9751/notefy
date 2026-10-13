"""Ícone por item e leitura por nota: o que a personalização grava no documento."""

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from core.testutils import make_document, make_user
from core.validators import validar_icone


class ValidarIcone(SimpleTestCase):
    def test_emoji_simples_composto_e_bandeira_passam(self):
        # 🫎 é do Unicode 15, mais novo que a tabela do Python 3.11.
        for emoji in ("\U0001FACE","📘", "✏️", "👩‍🎓", "🇧🇷", "👍🏽", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", ""):
            validar_icone(emoji)

    def test_nome_de_icone_antigo_continua_valendo(self):
        validar_icone("book-open")

    def test_texto_espaco_e_letra_de_outro_alfabeto_sao_recusados(self):
        for valor in ("Oi", "📘 x", "日", "‍", "‮📘"):
            with self.assertRaises(ValidationError, msg=valor):
                validar_icone(valor)


class IconeELeituraPelaApi(APITestCase):
    def setUp(self):
        self.dona = make_user("dona")
        self.client.force_authenticate(self.dona)
        self.doc = make_document(self.dona, title="Cálculo")
        self.url = f"/api/documents/{self.doc.id}/"

    def test_icone_vai_e_volta_e_aparece_nos_favoritos(self):
        resposta = self.client.patch(self.url, {"icon": "📘", "is_favorite": True}, format="json")
        self.assertEqual(resposta.status_code, 200, resposta.data)
        self.assertEqual(resposta.data["icon"], "📘")
        favoritos = self.client.get("/api/favorites/").json()["results"]
        self.assertEqual([i["icon"] for i in favoritos if i["id"] == str(self.doc.id)], ["📘"])

    def test_icone_que_nao_e_emoji_e_recusado(self):
        resposta = self.client.patch(self.url, {"icon": "texto"}, format="json")
        self.assertEqual(resposta.status_code, 200)  # kebab-case: nome de ícone
        resposta = self.client.patch(self.url, {"icon": "Texto livre"}, format="json")
        self.assertEqual(resposta.status_code, 400)

    def test_leitura_da_nota_e_conferida(self):
        secoes = [{"id": "s1", "type": "text", "html": "<p>oi</p>"}]
        ok = self.client.patch(
            self.url,
            {"data": {"sections": secoes, "leitura": {"largura": "estreita", "entrelinha": "ampla"}}},
            format="json",
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data["data"]["leitura"], {"largura": "estreita", "entrelinha": "ampla"})
        for leitura in ({"largura": "gigante"}, {"cor": "azul"}, "estreita"):
            ruim = self.client.patch(self.url, {"data": {"sections": secoes, "leitura": leitura}}, format="json")
            self.assertEqual(ruim.status_code, 400, leitura)

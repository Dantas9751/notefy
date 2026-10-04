"""O idioma da requisição chega aos textos que o servidor gera.

O app manda `Accept-Language`, e o `LocaleMiddleware` ativa o idioma. Sem
isso, quem usa o Notefy em inglês ganhava "Aula (cópia)" e um quadro
"Meu quadro" no meio de uma tela toda em inglês.
"""

from datetime import datetime, timezone

from django.test import SimpleTestCase
from django.utils import translation
from rest_framework.test import APITestCase

from ai.views import fechamento_do_sistema
from core.idioma import data_hora, em_ingles, texto
from core.testutils import make_category, make_folder, make_user


class AuxiliaresTests(SimpleTestCase):
    def test_sem_requisicao_vale_o_portugues(self):
        self.assertFalse(em_ingles())
        self.assertEqual(texto("cópia", "copy"), "cópia")

    def test_ativado_o_ingles(self):
        with translation.override("en"):
            self.assertTrue(em_ingles())
            self.assertEqual(texto("cópia", "copy"), "copy")

    def test_data_e_hora_seguem_o_idioma(self):
        momento = datetime(2026, 9, 5, 14, 30, tzinfo=timezone.utc)
        self.assertEqual(data_hora(momento), "05/09/2026 14:30")
        with translation.override("en"):
            self.assertEqual(data_hora(momento), "09/05/2026 2:30 PM")

    def test_hora_da_manha_sem_zero_a_esquerda(self):
        momento = datetime(2026, 9, 5, 9, 5, tzinfo=timezone.utc)
        with translation.override("en"):
            self.assertEqual(data_hora(momento), "09/05/2026 9:05 AM")


class PedidoEmInglesTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.folder = make_folder(self.user, category=make_category(self.user))
        self.client.force_authenticate(self.user)

    def tearDown(self):
        # O `LocaleMiddleware` ativa o idioma na thread e o cliente de teste
        # não desativa no fim: sem isto o inglês vazaria para o teste seguinte.
        translation.deactivate_all()

    def nota(self):
        return self.client.post(
            "/api/documents/",
            {"kind": "note", "title": "Aula", "folder": str(self.folder.id)},
            format="json",
        ).json()

    def duplicar(self, nota, idioma=None):
        extra = {"HTTP_ACCEPT_LANGUAGE": idioma} if idioma else {}
        return self.client.post(f"/api/documents/{nota['id']}/duplicate/", **extra).json()

    def test_duplicata_em_portugues_por_padrao(self):
        self.assertEqual(self.duplicar(self.nota())["title"], "Aula (cópia)")

    def test_duplicata_em_ingles(self):
        self.assertEqual(self.duplicar(self.nota(), "en-US")["title"], "Aula (copy)")

    def test_segunda_duplicata_em_ingles(self):
        nota = self.nota()
        self.duplicar(nota, "en-US")
        self.assertEqual(self.duplicar(nota, "en-US")["title"], "Aula (copy 2)")

    def test_quadro_padrao_de_conta_nova_em_ingles(self):
        from planner.models import Board

        nome = self.client.get("/api/boards/", HTTP_ACCEPT_LANGUAGE="en-US")
        self.assertEqual(nome.status_code, 200)
        self.assertEqual(Board.objects.filter(owner=self.user).first().name, "My board")


class LavielEmInglesTests(SimpleTestCase):
    def test_em_portugues_nada_muda(self):
        self.assertNotIn("English", fechamento_do_sistema("chat"))

    def test_em_ingles_o_laviel_responde_em_ingles(self):
        with translation.override("en"):
            self.assertIn("English", fechamento_do_sistema("chat"))
            self.assertIn("English", fechamento_do_sistema("nota.resumir"))

    def test_traduzir_nao_e_forcado_para_ingles(self):
        # O idioma da resposta é o que a pessoa escolheu no submenu.
        with translation.override("en"):
            self.assertNotIn("English (US)", fechamento_do_sistema("nota.traduzir"))

"""Arrumação da barra lateral e a tela inicial "onde parei"."""

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from core.testutils import make_user
from users.backup import _preferencias_do_backup
from users.barra import limpar_barra


class LimparBarra(SimpleTestCase):
    def test_guarda_ordem_e_ocultos_sem_repetir(self):
        self.assertEqual(
            limpar_barra({"ordem": ["quadro", "inicio", "quadro"], "ocultos": ["roadmap"], "outra": 1}),
            {"ordem": ["quadro", "inicio"], "ocultos": ["roadmap"]},
        )

    def test_vazio_vira_objeto_vazio(self):
        self.assertEqual(limpar_barra(None), {})
        self.assertEqual(limpar_barra({}), {})

    def test_forma_errada_e_recusada(self):
        for valor in ([], {"ordem": "quadro"}, {"ordem": ["Quadro"]}, {"ocultos": [1]}, {"ordem": ["a"] * 25}):
            with self.assertRaises(ValidationError, msg=valor):
                limpar_barra(valor)


class PreferenciasPelaApi(APITestCase):
    def setUp(self):
        self.client.force_authenticate(make_user("ana"))

    def test_barra_e_onde_parei_sao_gravados(self):
        resposta = self.client.patch(
            "/api/me/preferences/",
            {"sidebar_layout": {"ordem": ["quadro", "inicio"], "ocultos": ["roadmap"]}, "default_view": "last"},
            format="json",
        )
        self.assertEqual(resposta.status_code, 200, resposta.data)
        self.assertEqual(resposta.data["sidebar_layout"], {"ordem": ["quadro", "inicio"], "ocultos": ["roadmap"]})
        self.assertEqual(resposta.data["default_view"], "last")

    def test_barra_invalida_e_recusada(self):
        resposta = self.client.patch("/api/me/preferences/", {"sidebar_layout": {"ordem": "x"}}, format="json")
        self.assertEqual(resposta.status_code, 400)


class BackupDaBarra(SimpleTestCase):
    def test_backup_confere_a_barra_e_a_tela_inicial(self):
        self.assertEqual(
            _preferencias_do_backup({"sidebar_layout": {"ocultos": ["roadmap"]}, "default_view": "last"}),
            {"sidebar_layout": {"ocultos": ["roadmap"]}, "default_view": "last"},
        )
        self.assertEqual(_preferencias_do_backup({"sidebar_layout": "x", "default_view": "qualquer"}), {})

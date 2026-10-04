"""Entradas que derrubavam a API com 500, e a sessão que sobrevivia.

Saídas de um ataque ao app. O critério comum: entrada ruim tem que voltar
como 400 ou 409 com mensagem legível, e trocar a senha tem que expulsar
quem estava dentro.
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from core.testutils import make_category, make_user
from core.validators import normalizar_nome
from planner.models import Task


class NomesTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)
        self.categoria = self.client.post("/api/categories/", {"name": "Faculdade"}, format="json").json()

    def test_categoria_repetida_em_outra_caixa_e_400(self):
        # O `validate_name` estava fora da classe e o banco barrava com 500.
        for nome in ("FACULDADE", " faculdade "):
            resposta = self.client.post("/api/categories/", {"name": nome}, format="json")
            self.assertEqual(resposta.status_code, 400, nome)

    def test_mesmo_nome_em_unicode_decomposto_e_repetido(self):
        pasta = {"category": self.categoria["id"]}
        self.client.post("/api/folders/", {"name": "Cálculo", **pasta}, format="json")
        decomposto = "Cálculo"
        resposta = self.client.post("/api/folders/", {"name": decomposto, **pasta}, format="json")
        self.assertEqual(resposta.status_code, 400)

    def test_controle_de_direcao_sai_do_nome(self):
        self.assertEqual(normalizar_nome("fatura‮fdp.exe"), "faturafdp.exe")
        # LRM fica: é usado em nomes em árabe e hebraico.
        self.assertEqual(normalizar_nome("a‎b"), "a‎b")

    def test_quadro_na_lixeira_libera_o_nome(self):
        quadro = self.client.post("/api/boards/", {"name": "Pessoal"}, format="json").json()
        self.client.delete(f"/api/boards/{quadro['id']}/")
        resposta = self.client.post("/api/boards/", {"name": "Pessoal"}, format="json")
        self.assertEqual(resposta.status_code, 201)


class ErrosQueEramQuinhentosTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def test_json_aninhado_demais_e_400(self):
        corpo = '{"name": ' + "[" * 5000 + "]" * 5000 + "}"
        resposta = self.client.post("/api/categories/", corpo, content_type="application/json")
        self.assertEqual(resposta.status_code, 400)

    def test_conflito_no_banco_vira_409_legivel(self):
        # Passando por cima do serializer (que agora barra antes), a
        # restrição do banco ainda existe. Quando é ela quem responde, a
        # tela recebe uma frase, e não a página de erro do Django.
        from core.excecoes import tratar_excecao
        from django.db import IntegrityError

        resposta = tratar_excecao(IntegrityError("UNIQUE constraint failed: x"), {})
        self.assertEqual(resposta.status_code, 409)
        self.assertIn("nome", resposta.data["detail"])

    def test_validacao_do_modelo_vira_400(self):
        from django.core.exceptions import ValidationError

        from core.excecoes import tratar_excecao

        resposta = tratar_excecao(ValidationError({"title": ["longo demais"]}), {})
        self.assertEqual(resposta.status_code, 400)
        self.assertEqual(resposta.data["title"], ["longo demais"])


class SessaoDepoisDeTrocarSenhaTests(APITestCase):
    def test_refresh_antigo_morre_e_o_novo_vale(self):
        make_user(username="ana", password="senha-forte-123")
        anon = APIClient()
        login = anon.post(
            "/api/auth/login/", {"username": "ana", "password": "senha-forte-123"}, format="json"
        ).json()

        logado = APIClient()
        logado.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access']}")
        troca = logado.post(
            "/api/auth/change-password/",
            {"current_password": "senha-forte-123", "new_password": "outra-senha-456"},
            format="json",
        )
        self.assertEqual(troca.status_code, 200)

        velho = anon.post("/api/auth/refresh/", {"refresh": login["refresh"]}, format="json")
        self.assertEqual(velho.status_code, 401)

        # Quem trocou continua dentro, com o par que veio na resposta.
        novo = anon.post("/api/auth/refresh/", {"refresh": troca.json()["refresh"]}, format="json")
        self.assertEqual(novo.status_code, 200)


class RecorrenciaIdempotenteTests(APITestCase):
    def test_concluir_reabrir_concluir_nao_duplica_a_proxima(self):
        user = make_user()
        make_category(user)
        self.client.force_authenticate(user)
        tarefa = self.client.post(
            "/api/tasks/",
            {"title": "Revisar", "starts_at": (timezone.now() + timedelta(days=1)).isoformat(), "recurrence_rule": "FREQ=DAILY"},
            format="json",
        ).json()

        for _ in range(3):
            self.client.post(f"/api/tasks/{tarefa['id']}/toggle/")

        self.assertEqual(Task.objects.alive().filter(owner=user, title="Revisar").count(), 2)

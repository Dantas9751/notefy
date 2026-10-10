"""Caixa de entrada do input()/prompt() do código que roda na nota."""

import threading
import time
from unittest import mock

from rest_framework.test import APITestCase

from core import entrada
from core.testutils import make_user


class CaixaDeEntrada(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def abrir(self):
        return self.client.post("/api/entrada/").data["canal"]

    def responder(self, canal, valor):
        return self.client.post(f"/api/entrada/{canal}/", {"valor": valor}, format="json")

    def test_resposta_chega_a_quem_espera_sem_login(self):
        canal = self.abrir()
        self.assertEqual(self.responder(canal, "Ana").status_code, 204)
        self.client.force_authenticate(None)
        resposta = self.client.get(f"/api/entrada/{canal}/")
        self.assertEqual(resposta.data, {"valor": "Ana"})

    def test_espera_vencida_devolve_204_para_perguntar_de_novo(self):
        canal = self.abrir()
        with mock.patch.object(entrada, "ESPERA_POR_PEDIDO", 0.01):
            self.assertEqual(self.client.get(f"/api/entrada/{canal}/").status_code, 204)

    def test_fechar_acorda_quem_espera_com_none(self):
        canal = self.abrir()
        recebido = []
        espera = threading.Thread(target=lambda: recebido.append(entrada.esperar(canal, 5)))
        espera.start()
        self.assertEqual(self.client.delete(f"/api/entrada/{canal}/").status_code, 204)
        espera.join(5)
        self.assertEqual(recebido, [None])
        self.assertEqual(self.client.get(f"/api/entrada/{canal}/").status_code, 404)

    def test_canal_desconhecido_e_404(self):
        self.assertEqual(self.client.get("/api/entrada/nao-existe/").status_code, 404)
        self.assertEqual(self.responder("nao-existe", "x").status_code, 404)

    def test_outra_pessoa_nao_responde_nem_fecha(self):
        canal = self.abrir()
        self.client.force_authenticate(make_user("outra"))
        self.assertEqual(self.responder(canal, "intrusa").status_code, 404)
        self.client.delete(f"/api/entrada/{canal}/")
        self.assertTrue(entrada.responder(canal, self.user.id, "minha"))
        self.assertEqual(entrada.esperar(canal, 1), "minha")

    def test_responder_e_abrir_pedem_login(self):
        canal = self.abrir()
        self.client.force_authenticate(None)
        self.assertEqual(self.responder(canal, "x").status_code, 401)
        self.assertEqual(self.client.post("/api/entrada/").status_code, 401)

    def test_valor_precisa_ser_texto_curto(self):
        canal = self.abrir()
        self.assertEqual(self.client.post(f"/api/entrada/{canal}/", ["x"], format="json").status_code, 400)
        self.assertEqual(self.responder(canal, 42).status_code, 400)
        self.assertEqual(self.responder(canal, "x" * (entrada.MAX_CARACTERES + 1)).status_code, 400)

    def test_canal_a_mais_fecha_o_mais_antigo(self):
        canais = [self.abrir() for _ in range(entrada.MAX_CANAIS_POR_PESSOA + 1)]
        self.assertNotIn(canais[0], entrada._canais)
        self.assertTrue(all(c in entrada._canais for c in canais[1:]))

    def test_segunda_espera_no_mesmo_canal_e_recusada(self):
        # Cada espera prende uma thread do servidor por até 25 s: GETs em
        # paralelo no mesmo canal travariam o app inteiro.
        canal = self.abrir()
        primeira = threading.Thread(target=lambda: entrada.esperar(canal, 5))
        primeira.start()
        for _ in range(200):
            if entrada._canais[canal][2].locked():
                break
            time.sleep(0.01)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/entrada/{canal}/").status_code, 409)
        entrada.fechar(canal, self.user.id)
        primeira.join(5)
        self.assertFalse(primeira.is_alive())

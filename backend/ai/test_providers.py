"""Testes do parsing de resposta dos provedores.

O caso que motivou este arquivo: gateways compatíveis com OpenAI
(9router, OpenRouter, LM Studio...) respondem em SSE MESMO numa chamada
sem streaming. O `.json()` estourava e TODA ação de IA que não fosse o
chat morria com 502 — o chat escapava porque já lia SSE.
"""

import json
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase

from .providers import ErroProvedor, _extrair_pedaco, _juntar_sse, _requisicao, completar


class ExtrairPedacoTests(SimpleTestCase):
    def test_delta_do_stream(self):
        evento = {"choices": [{"delta": {"content": "olá"}}]}
        self.assertEqual(_extrair_pedaco(evento, "custom"), "olá")

    def test_mensagem_inteira_num_evento(self):
        """Há gateway que manda a resposta completa num único evento SSE."""
        evento = {"choices": [{"message": {"content": "resposta"}}]}
        self.assertEqual(_extrair_pedaco(evento, "custom"), "resposta")

    def test_campo_text_legado(self):
        evento = {"choices": [{"text": "legado"}]}
        self.assertEqual(_extrair_pedaco(evento, "custom"), "legado")

    def test_anthropic_usa_content_block_delta(self):
        evento = {"type": "content_block_delta", "delta": {"text": "oi"}}
        self.assertEqual(_extrair_pedaco(evento, "anthropic"), "oi")

    def test_anthropic_ignora_outros_eventos(self):
        evento = {"type": "message_start", "delta": {"text": "ruído"}}
        self.assertEqual(_extrair_pedaco(evento, "anthropic"), "")

    def test_evento_vazio_nao_quebra(self):
        self.assertEqual(_extrair_pedaco({}, "custom"), "")


class JuntarSseTests(SimpleTestCase):
    def sse(self, *eventos):
        corpo = "".join(f"data: {json.dumps(e)}\n\n" for e in eventos)
        return corpo + "data: [DONE]\n\n"

    def test_remonta_json_partido_em_varios_eventos(self):
        """O caso real: JSON de documento fatiado entre deltas."""
        corpo = self.sse(
            {"choices": [{"delta": {"content": '{"sections": '}}]},
            {"choices": [{"delta": {"content": "[]}"}}]},
        )
        self.assertEqual(_juntar_sse(corpo, "custom"), '{"sections": []}')

    def test_para_no_done(self):
        corpo = self.sse({"choices": [{"delta": {"content": "vale"}}]})
        corpo += 'data: {"choices":[{"delta":{"content":"depois do fim"}}]}\n\n'
        self.assertEqual(_juntar_sse(corpo, "custom"), "vale")

    def test_ignora_linhas_que_nao_sao_data(self):
        corpo = (
            ": comentário do keep-alive\n\n"
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
            "event: ping\n\n"
            "data: [DONE]\n\n"
        )
        self.assertEqual(_juntar_sse(corpo, "custom"), "ok")

    def test_ignora_evento_com_json_invalido(self):
        corpo = (
            "data: {nao é json}\n\n"
            'data: {"choices":[{"delta":{"content":"bom"}}]}\n\n'
            "data: [DONE]\n\n"
        )
        self.assertEqual(_juntar_sse(corpo, "custom"), "bom")

    def test_corpo_que_nao_e_sse_devolve_vazio(self):
        """Vazio deixa quem chamou decidir o erro — não inventa resposta."""
        self.assertEqual(_juntar_sse("<html>erro do proxy</html>", "custom"), "")
        self.assertEqual(_juntar_sse("", "custom"), "")

    def test_anthropic_remonta(self):
        corpo = self.sse(
            {"type": "content_block_delta", "delta": {"text": "Est"}},
            {"type": "content_block_delta", "delta": {"text": "udo"}},
        )
        self.assertEqual(_juntar_sse(corpo, "anthropic"), "Estudo")


class CompletarTests(SimpleTestCase):
    """`completar()` de ponta a ponta, com o transporte trocado por mock."""

    prefs = SimpleNamespace(
        ai_provider="custom",
        ai_key="k",
        ai_model="m",
        ai_base_url="http://gateway.local/v1",
    )

    def responder(self, corpo, content_type="application/json", status=200):
        """Um httpx.Response de verdade, para exercitar o `.json()` real."""
        return httpx.Response(
            status_code=status,
            headers={"content-type": content_type},
            content=corpo.encode(),
            request=httpx.Request("POST", "http://gateway.local/v1/chat/completions"),
        )

    def chamar(self, resposta):
        with patch("httpx.Client.post", return_value=resposta):
            return completar(self.prefs, [{"role": "user", "content": "oi"}], "sys")

    def test_json_normal_continua_funcionando(self):
        corpo = json.dumps({"choices": [{"message": {"content": "resposta"}}]})
        self.assertEqual(self.chamar(self.responder(corpo)), "resposta")

    def test_gateway_que_responde_sse_sem_stream(self):
        """O bug: 200 + SSE numa chamada sem streaming virava 502."""
        corpo = (
            'data: {"choices":[{"delta":{"content":"Plano "}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"de estudo"}}]}\n\n'
            "data: [DONE]\n\n"
        )
        texto = self.chamar(self.responder(corpo, content_type="text/event-stream"))
        self.assertEqual(texto, "Plano de estudo")

    def test_corpo_ilegivel_vira_erro_claro(self):
        with self.assertRaises(ErroProvedor) as caso:
            self.chamar(self.responder("<html>502</html>", content_type="text/html"))
        self.assertEqual(caso.exception.status, 502)
        self.assertIn("inválida", caso.exception.detail)


class RequisicaoTests(SimpleTestCase):
    """As duas chamadas (stream e inteira) saem do mesmo construtor.

    Antes eram dois blocos copiados; nada impedia um de ganhar correção e o
    outro não. Estes testes prendem o que difere entre eles.
    """

    def _prefs(self, **extra):
        base = dict(ai_provider="custom", ai_key="k", ai_model="m", ai_base_url="https://gw")
        base.update(extra)
        return SimpleNamespace(**base)

    def test_stream_e_inteira_diferem_so_no_esperado(self):
        mensagens = [{"role": "user", "content": "oi"}]
        url_s, cab_s, pay_s = _requisicao(self._prefs(), mensagens, "sis", stream=True)
        url_i, cab_i, pay_i = _requisicao(self._prefs(), mensagens, "sis", stream=False)

        self.assertEqual(url_s, url_i)
        self.assertEqual(cab_s, cab_i)
        self.assertTrue(pay_s["stream"])
        # Explícito, e não ausente: gateway que não vê o campo assume SSE e
        # devolve stream numa chamada que espera JSON.
        self.assertFalse(pay_i["stream"])
        self.assertGreater(pay_s["temperature"], pay_i["temperature"])

    def test_sistema_entra_como_mensagem_no_dialeto_openai(self):
        _, _, payload = _requisicao(self._prefs(), [{"role": "user", "content": "oi"}], "sis", stream=True)
        self.assertEqual(payload["messages"][0], {"role": "system", "content": "sis"})
        self.assertEqual(payload["model"], "m")

    def test_sem_chave_nao_manda_authorization(self):
        _, cabecalhos, _ = _requisicao(self._prefs(ai_key=""), [], "sis", stream=True)
        self.assertEqual(cabecalhos, {})

    def test_anthropic_usa_rota_e_campos_proprios(self):
        prefs = self._prefs(ai_provider="anthropic")
        _, cabecalhos, pay_s = _requisicao(prefs, [], "sis", stream=True)
        _, _, pay_i = _requisicao(prefs, [], "sis", stream=False)

        self.assertIn("x-api-key", cabecalhos)
        # `system` é campo de topo, não a primeira mensagem.
        self.assertEqual(pay_s["system"], "sis")
        self.assertTrue(pay_s["stream"])
        # Sem streaming a Anthropic quer o campo AUSENTE, não `false`.
        self.assertNotIn("stream", pay_i)
        self.assertGreater(pay_i["max_tokens"], pay_s["max_tokens"])

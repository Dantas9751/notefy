"""A tarefa `editar`: o pedido livre do chat que muda o item aberto.

O provedor é simulado. O que importa aqui é o que o modelo NÃO controla:
o que fica de fora do prompt e volta igual, o schema como última palavra,
o item travado, e a marca que o chat recebe para trocar de modo.
"""

import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from content.models import Document
from organization.models import Category, Folder

from .tarefas import MARCA_EDITAR

User = get_user_model()

NOTA = {
    "sections": [
        {"id": "s1", "type": "text", "html": "<p>Olá</p>"},
        {"id": "s2", "type": "checklist", "items": [{"id": "i1", "text": "comprar pão", "done": False}]},
    ]
}
QUADRO = {
    "nodes": [{"id": "n1", "type": "sticky", "x": 0, "y": 0, "w": 170, "h": 70, "text": "A", "color": "#FEF08A"}],
    "edges": [],
    "strokes": [{"id": "t1", "tool": "pen", "points": [[0, 0], [5, 5]], "color": "#000000", "width": 2}],
    "viewport": {"x": 10, "y": 20, "zoom": 2},
}


class EditarTests(APITestCase):
    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")
        self.client.force_authenticate(self.usuario)
        self.client.default_format = "json"
        prefs = self.usuario.preferences
        prefs.ai_provider = "custom"
        prefs.ai_base_url = "http://exemplo.invalido"
        prefs.ai_model = "modelo"
        prefs.save()
        categoria = Category.objects.create(name="C", owner=self.usuario)
        self.pasta = Folder.objects.create(name="P", category=categoria, owner=self.usuario)

    def doc(self, kind, data):
        return Document.objects.create(owner=self.usuario, folder=self.pasta, kind=kind, title="D", data=data)

    def editar(self, doc, resposta):
        with patch("ai.views.completar", return_value=resposta) as chamada:
            r = self.client.post("/api/ai/run/", {"task": "editar", "document_id": str(doc.id), "input": "mude"})
        return r, chamada

    def test_grava_o_item_editado_e_preserva_secoes_que_a_criacao_descartaria(self):
        doc = self.doc(Document.Kind.NOTE, NOTA)
        novo = json.loads(json.dumps(NOTA))
        novo["sections"][0]["html"] = "<p>Oi</p>"
        r, chamada = self.editar(doc, "```json\n" + json.dumps(novo) + "\n```")
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        doc.refresh_from_db()
        self.assertEqual(doc.data["sections"][0]["html"], "<p>Oi</p>")
        self.assertEqual(doc.data["sections"][1]["type"], "checklist")
        # O JSON atual vai antes do pedido, que continua sendo a última mensagem.
        mensagens = chamada.call_args.args[1]
        self.assertEqual(mensagens[-1]["content"], "mude")
        self.assertIn('"checklist"', mensagens[-2]["content"])

    def test_tracos_e_enquadramento_nao_vao_ao_modelo_e_voltam_iguais(self):
        doc = self.doc(Document.Kind.CANVAS, QUADRO)
        resposta = {"nodes": [{**QUADRO["nodes"][0], "text": "B"}], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}
        r, chamada = self.editar(doc, json.dumps(resposta))
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        self.assertNotIn("strokes", chamada.call_args.args[1][-2]["content"])
        doc.refresh_from_db()
        self.assertEqual(doc.data["nodes"][0]["text"], "B")
        self.assertEqual(doc.data["nodes"][0]["color"], "#FEF08A")
        self.assertEqual(doc.data["strokes"], QUADRO["strokes"])
        self.assertEqual(doc.data["viewport"], QUADRO["viewport"])

    def test_resposta_fora_do_schema_nao_grava(self):
        doc = self.doc(Document.Kind.NOTE, NOTA)
        r, _ = self.editar(doc, json.dumps({"sections": [{"id": "s1", "type": "inventado"}]}))
        self.assertEqual(r.status_code, status.HTTP_502_BAD_GATEWAY)
        doc.refresh_from_db()
        self.assertEqual(doc.data, NOTA)

    def test_item_somente_leitura_recusa(self):
        doc = self.doc(Document.Kind.NOTE, NOTA)
        doc.is_read_only = True
        doc.save()
        r, chamada = self.editar(doc, json.dumps(NOTA))
        self.assertEqual(r.status_code, status.HTTP_423_LOCKED)
        chamada.assert_not_called()

    def test_item_grande_demais_recusa_antes_de_chamar_o_modelo(self):
        doc = self.doc(Document.Kind.NOTE, {"sections": [{"id": "s1", "type": "text", "html": "x" * 20000}]})
        r, chamada = self.editar(doc, "{}")
        self.assertEqual(r.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        chamada.assert_not_called()

    def test_sem_documento_recusa(self):
        with patch("ai.views.completar") as chamada:
            r = self.client.post("/api/ai/run/", {"task": "editar", "input": "mude"})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        chamada.assert_not_called()

    def test_chat_so_ensina_a_marca_onde_da_para_editar(self):
        def sistema_do_chat(doc):
            with patch("ai.views.abrir", side_effect=RuntimeError) as abrir:
                try:
                    self.client.post("/api/ai/chat/", {"messages": [{"role": "user", "content": "oi"}], "document_id": str(doc.id)})
                except RuntimeError:
                    pass
            return abrir.call_args.args[2]

        nota = self.doc(Document.Kind.NOTE, NOTA)
        self.assertIn(MARCA_EDITAR, sistema_do_chat(nota))
        nota.is_read_only = True
        nota.save()
        self.assertNotIn(MARCA_EDITAR, sistema_do_chat(nota))

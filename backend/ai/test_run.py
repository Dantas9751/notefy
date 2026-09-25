"""Testes do endpoint único `/api/ai/run/`.

O provedor é simulado (`completar` trocado por uma função nossa): o que
está sob teste é o catálogo de tarefas, a normalização do JSON que o
modelo devolve e a gravação no documento — não a rede.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from content.models import Document
from content.schemas import empty_data_for
from organization.models import Category, Folder

from .documentos import ErroFormato, montar

User = get_user_model()


class RunViewTests(APITestCase):
    def setUp(self):
        self.usuario = User.objects.create_user(username="tester", password="senha123!")
        self.client.force_authenticate(self.usuario)
        self.client.default_format = "json"
        prefs = self.usuario.preferences
        prefs.ai_provider = "custom"
        prefs.ai_key = "chave"
        prefs.ai_base_url = "http://exemplo.invalido"
        prefs.ai_model = "modelo"
        prefs.save()

        self.categoria = Category.objects.create(name="Categoria", owner=self.usuario)
        self.pasta = Folder.objects.create(
            name="Pasta", category=self.categoria, owner=self.usuario
        )

    def documento(self, kind=Document.Kind.DIAGRAM, title="Doc"):
        return Document.objects.create(
            owner=self.usuario,
            folder=self.pasta,
            kind=kind,
            title=title,
            data=empty_data_for(kind),
        )

    def rodar(self, payload, resposta_do_modelo):
        with patch("ai.views.completar", return_value=resposta_do_modelo):
            return self.client.post("/api/ai/run/", payload)

    # ------------------------------------------------------------ tarefas
    def test_tarefa_desconhecida_retorna_400(self):
        resposta = self.client.post("/api/ai/run/", {"task": "inexistente", "input": "x"})
        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_tarefa_de_texto_devolve_texto(self):
        resposta = self.rodar(
            {"task": "nota.resumir", "input": "um texto longo"}, "resumo pronto"
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta.json()["text"], "resumo pronto")

    def test_sem_apply_apenas_pre_visualiza(self):
        alvo = self.documento()
        resposta = self.rodar(
            {"task": "diagrama.gerar", "input": "um DER de blog", "target_id": str(alvo.id)},
            '{"nodes": [{"id": "n1", "type": "er_entity", "text": "Post"}], "edges": []}',
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        alvo.refresh_from_db()
        self.assertEqual(alvo.data["nodes"], [])

    # ------------------------------------------------------------ gravação
    def test_apply_replace_grava_no_documento(self):
        alvo = self.documento()
        resposta = self.rodar(
            {
                "task": "diagrama.gerar",
                "input": "um DER de blog",
                "apply": "replace",
                "target_id": str(alvo.id),
            },
            '{"nodes": [{"id": "n1", "type": "er_entity", "text": "Post"},'
            ' {"id": "n2", "type": "er_entity", "text": "Autor"}],'
            ' "edges": [{"id": "e1", "type": "er_one_many", "from": "n2", "to": "n1"}]}',
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        alvo.refresh_from_db()
        self.assertEqual(len(alvo.data["nodes"]), 2)
        self.assertEqual(alvo.data["edges"][0]["from"], "n2")

    def test_replace_em_tipo_diferente_e_recusado(self):
        nota = self.documento(kind=Document.Kind.NOTE)
        resposta = self.rodar(
            {
                "task": "diagrama.gerar",
                "input": "x",
                "apply": "replace",
                "target_id": str(nota.id),
            },
            '{"nodes": [{"id": "n1", "type": "er_entity", "text": "Post"}], "edges": []}',
        )
        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_apply_create_cria_documento_na_pasta(self):
        origem = self.documento(kind=Document.Kind.NOTE, title="Origem")
        resposta = self.rodar(
            {
                "task": "criar.planilha",
                "document_id": str(origem.id),
                "apply": "create",
                "folder_id": str(self.pasta.id),
                "title": "Tabela nova",
            },
            '{"columns": [{"id": "c1", "name": "Item", "type": "text"}],'
            ' "rows": [{"id": "r1", "cells": {"c1": "café"}}]}',
        )
        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        criado = Document.objects.get(id=resposta.json()["document_id"])
        self.assertEqual(criado.kind, "spreadsheet")
        self.assertEqual(criado.title, "Tabela nova")
        self.assertEqual(criado.data["rows"][0]["cells"]["c1"], "café")

    def test_apply_create_duas_vezes_nao_estoura_por_nome_repetido(self):
        """Gerar de novo a partir do mesmo item é normal.

        O título é único por pasta; sem desambiguar, a segunda geração
        estourava a validação do model e virava 500 com página HTML.
        """
        origem = self.documento(kind=Document.Kind.NOTE, title="Origem")
        corpo = {
            "task": "criar.planilha",
            "document_id": str(origem.id),
            "apply": "create",
            "folder_id": str(self.pasta.id),
            "title": "Mesmo nome",
        }
        json_planilha = (
            '{"columns": [{"id": "c1", "name": "Item", "type": "text"}],'
            ' "rows": [{"id": "r1", "cells": {"c1": "café"}}]}'
        )

        primeira = self.rodar(corpo, json_planilha)
        segunda = self.rodar(corpo, json_planilha)

        self.assertEqual(primeira.status_code, status.HTTP_201_CREATED)
        self.assertEqual(segunda.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Document.objects.get(id=primeira.json()["document_id"]).title,
            "Mesmo nome",
        )
        self.assertEqual(
            Document.objects.get(id=segunda.json()["document_id"]).title,
            "Mesmo nome (2)",
        )

    def test_replace_exige_target(self):
        resposta = self.client.post(
            "/api/ai/run/", {"task": "diagrama.gerar", "input": "x", "apply": "replace"}
        )
        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_documento_de_outro_usuario_nao_e_gravado(self):
        outro = User.objects.create_user(username="outro", password="senha123!")
        categoria = Category.objects.create(name="C", owner=outro)
        pasta = Folder.objects.create(name="P", category=categoria, owner=outro)
        alheio = Document.objects.create(
            owner=outro, folder=pasta, kind=Document.Kind.DIAGRAM, title="Alheio",
            data=empty_data_for(Document.Kind.DIAGRAM),
        )
        resposta = self.rodar(
            {
                "task": "diagrama.gerar",
                "input": "x",
                "apply": "replace",
                "target_id": str(alheio.id),
            },
            '{"nodes": [{"id": "n1", "type": "er_entity", "text": "X"}], "edges": []}',
        )
        self.assertEqual(resposta.status_code, status.HTTP_404_NOT_FOUND)

    def test_json_invalido_do_modelo_vira_502(self):
        alvo = self.documento()
        resposta = self.rodar(
            {"task": "diagrama.gerar", "input": "x", "apply": "replace", "target_id": str(alvo.id)},
            "desculpe, não posso ajudar",
        )
        self.assertEqual(resposta.status_code, status.HTTP_502_BAD_GATEWAY)


class MontarTests(APITestCase):
    """A normalização do que o modelo devolve."""

    def test_aceita_json_cercado_por_crases(self):
        data = montar(
            "diagram",
            '```json\n{"nodes": [{"id": "n1", "type": "process", "text": "A"}], "edges": []}\n```',
        )
        self.assertEqual(data["nodes"][0]["text"], "A")

    def test_aceita_json_com_frase_antes(self):
        data = montar(
            "diagram",
            'Claro! {"nodes": [{"id": "n1", "type": "process", "text": "A"}], "edges": []}',
        )
        self.assertEqual(len(data["nodes"]), 1)

    def test_preenche_id_e_posicao_ausentes(self):
        data = montar(
            "diagram",
            '{"nodes": [{"type": "process", "label": "A"}, {"type": "process", "label": "B"}],'
            ' "edges": []}',
        )
        ids = [n["id"] for n in data["nodes"]]
        self.assertEqual(len(set(ids)), 2)
        # Sem coordenada, os nós não podem cair todos no mesmo ponto.
        self.assertNotEqual(
            (data["nodes"][0]["x"], data["nodes"][0]["y"]),
            (data["nodes"][1]["x"], data["nodes"][1]["y"]),
        )

    def test_descarta_aresta_orfa(self):
        data = montar(
            "diagram",
            '{"nodes": [{"id": "n1", "type": "process", "text": "A"}],'
            ' "edges": [{"id": "e1", "type": "flow", "from": "n1", "to": "fantasma"}]}',
        )
        self.assertEqual(data["edges"], [])

    def test_tipo_invalido_e_recusado(self):
        with self.assertRaises(ErroFormato):
            montar(
                "diagram",
                '{"nodes": [{"id": "n1", "type": "banana", "text": "A"}], "edges": []}',
            )

    def test_resposta_sem_elementos_e_recusada(self):
        with self.assertRaises(ErroFormato):
            montar("diagram", '{"nodes": [], "edges": []}')
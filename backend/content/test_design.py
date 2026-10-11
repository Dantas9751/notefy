"""Design: o tipo de item de telas (docs/plans/2026-10-10-design.md).

O `data` é uma árvore de camadas por página. O servidor confere a
estrutura (ids, tipos, números, quem pode ter filhos) e deixa passar
campo novo, para o editor evoluir sem migração.
"""

import copy

from rest_framework.test import APITestCase

from content.schemas import extract_text
from core.testutils import make_document, make_folder, make_user

TELA = {
    "version": 1,
    "pages": [
        {
            "id": "p1",
            "name": "Página 1",
            "background": None,
            "children": [
                {
                    "id": "f1", "type": "frame", "name": "Login", "x": 0, "y": 0, "w": 390, "h": 844,
                    "clip": True, "fills": [{"type": "solid", "color": "#FFFFFF", "opacity": 1}],
                    "children": [
                        {"id": "t1", "type": "text", "name": "Título", "x": 24, "y": 80, "w": 200, "h": 32,
                         "text": "Bem-vindo de volta", "font": {"family": "Segoe UI", "size": 24}},
                        {"id": "b1", "type": "frame", "name": "Botão", "x": 24, "y": 700, "w": 342, "h": 48,
                         "layout": {"mode": "row", "justify": "center", "align": "center"},
                         "children": [{"id": "t2", "type": "text", "x": 0, "y": 0, "w": 60, "h": 20, "text": "Entrar"}]},
                    ],
                }
            ],
        }
    ],
    "viewport": {"p1": {"x": 0, "y": 0, "zoom": 1}},
}


class DesignTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)
        self.pasta = make_folder(self.user)

    def criar(self, data=None):
        corpo = {"kind": "design", "title": "App", "folder": str(self.pasta.id)}
        if data is not None:
            corpo["data"] = data
        return self.client.post("/api/documents/", corpo, format="json")

    def test_nasce_com_uma_pagina_vazia(self):
        resposta = self.criar()
        self.assertEqual(resposta.status_code, 201, resposta.content)
        data = resposta.json()["data"]
        self.assertEqual(data["version"], 1)
        self.assertEqual(len(data["pages"]), 1)
        self.assertEqual(data["pages"][0]["children"], [])

    def test_aceita_uma_tela_com_auto_layout(self):
        resposta = self.criar(copy.deepcopy(TELA))
        self.assertEqual(resposta.status_code, 201, resposta.content)

    def test_recusa_tipo_de_camada_desconhecido(self):
        data = copy.deepcopy(TELA)
        data["pages"][0]["children"][0]["children"][0]["type"] = "button"
        self.assertEqual(self.criar(data).status_code, 400)

    def test_recusa_id_repetido_em_qualquer_nivel(self):
        data = copy.deepcopy(TELA)
        data["pages"][0]["children"][0]["children"][1]["children"][0]["id"] = "t1"
        self.assertEqual(self.criar(data).status_code, 400)

    def test_so_frame_e_grupo_tem_filhos(self):
        data = copy.deepcopy(TELA)
        data["pages"][0]["children"][0]["children"][0]["children"] = [
            {"id": "x", "type": "rect", "x": 0, "y": 0, "w": 1, "h": 1}
        ]
        self.assertEqual(self.criar(data).status_code, 400)

    def test_recusa_tamanho_nao_numerico_ou_negativo(self):
        data = copy.deepcopy(TELA)
        data["pages"][0]["children"][0]["w"] = "390"
        self.assertEqual(self.criar(data).status_code, 400)
        data["pages"][0]["children"][0]["w"] = -1
        self.assertEqual(self.criar(data).status_code, 400)

    def test_posicao_ausente_entra_como_zero(self):
        data = copy.deepcopy(TELA)
        del data["pages"][0]["children"][0]["x"]
        resposta = self.criar(data)
        self.assertEqual(resposta.status_code, 201, resposta.content)
        self.assertEqual(resposta.json()["data"]["pages"][0]["children"][0]["x"], 0)

    def test_recusa_preenchimento_desconhecido(self):
        data = copy.deepcopy(TELA)
        data["pages"][0]["children"][0]["fills"] = [{"type": "noise"}]
        self.assertEqual(self.criar(data).status_code, 400)

    def test_recusa_formato_que_derrubaria_o_editor(self):
        # Vindo do Laviel ou da API: passava na validação e o editor quebrava ao abrir.
        quebrados = [
            ("layout", {"mode": "row", "padding": 16}),
            ("layout", {"mode": "grid"}),
            ("font", {"size": "grande"}),
            ("radius", [4, 4]),
            ("effects", [{"type": "drop", "blur": "muito"}]),
            ("fills", [{"type": "linear", "stops": ["#fff"]}]),
            ("rotation", "45"),
        ]
        for campo, valor in quebrados:
            data = copy.deepcopy(TELA)
            data["pages"][0]["children"][0]["children"][0][campo] = valor
            self.assertEqual(self.criar(data).status_code, 400, campo)

    def test_recusa_profundidade_absurda(self):
        data = copy.deepcopy(TELA)
        camada = {"id": "g0", "type": "group", "x": 0, "y": 0, "w": 1, "h": 1, "children": []}
        data["pages"][0]["children"] = [camada]
        for i in range(1, 60):
            filho = {"id": f"g{i}", "type": "group", "x": 0, "y": 0, "w": 1, "h": 1, "children": []}
            camada["children"].append(filho)
            camada = filho
        self.assertEqual(self.criar(data).status_code, 400)

    def test_busca_encontra_texto_e_nome_da_tela(self):
        texto = extract_text("design", TELA)
        self.assertIn("Bem-vindo de volta", texto)
        self.assertIn("Login", texto)
        self.assertIn("Entrar", texto)
        # Nome de camada qualquer não é conteúdo.
        self.assertNotIn("Título", texto)
        # Nem o de um frame aninhado: "Botão" é nome de peça, não de tela.
        self.assertNotIn("Botão", texto)

    def test_esvaziar_volta_ao_design_em_branco(self):
        doc = make_document(self.user, self.pasta, kind="design", data=copy.deepcopy(TELA))
        resposta = self.client.post(f"/api/documents/{doc.id}/reset/")
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertEqual(resposta.json()["data"]["pages"][0]["children"], [])

    def test_vira_modelo(self):
        doc = make_document(self.user, self.pasta, kind="design", title="Tela", data=copy.deepcopy(TELA))
        resposta = self.client.post("/api/templates/", {"document": str(doc.id)}, format="json")
        self.assertEqual(resposta.status_code, 201, resposta.content)
        self.assertEqual(resposta.json()["kind"], "design")

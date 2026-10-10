"""Preferências do Início: layout (`home_layout`) e rascunho (`scratch_pad`).

O layout é um JSON livre no banco, então tudo depende de `limpar_inicio`:
o que o app conhece passa, o que não conhece cai fora, e valor que não dá
para entender volta 400 em vez de ficar gravado esperando quebrar a tela.
"""

import io
import json
import zipfile

from rest_framework.test import APITestCase

from content.models import Template
from core.testutils import make_user
from users.backup import exportar, importar
from users.inicio import MAX_RASCUNHO
from users.models import User, UserPreferences

LAYOUT = {
    "capa": {"tipo": "gradiente", "id": "aurora"},
    "blocos": [
        {"id": "notas", "visivel": True, "largura": "inteira"},
        {"id": "tarefas", "visivel": False, "largura": "metade"},
    ],
    "itens": "pilha",
    "aba_notas": "favoritos",
}


class LayoutDoInicioTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def gravar(self, **campos):
        return self.client.patch("/api/me/preferences/", campos, format="json")

    def test_grava_e_devolve_o_layout(self):
        resposta = self.gravar(home_layout=LAYOUT)
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertEqual(resposta.json()["home_layout"], LAYOUT)
        # Usuário relido, como numa requisição de verdade: o `force_authenticate`
        # reaproveita o objeto do teste, com as preferências antigas em cache.
        self.client.force_authenticate(User.objects.get(pk=self.user.pk))
        self.assertEqual(self.client.get("/api/me/").json()["preferences"]["home_layout"], LAYOUT)

    def test_chave_desconhecida_cai_fora(self):
        resposta = self.gravar(home_layout={**LAYOUT, "script": "<b>x</b>"})
        self.assertEqual(resposta.status_code, 200)
        self.assertNotIn("script", resposta.json()["home_layout"])

    def test_valor_fora_das_opcoes_volta_400(self):
        for ruim in (
            {"itens": "carrossel"},
            {"blocos": [{"id": "notas"}, {"id": "notas"}]},
            {"blocos": "notas"},
            {"capa": {"tipo": "gradiente", "id": "Com Espaço"}},
            "texto",
        ):
            with self.subTest(ruim=ruim):
                self.assertEqual(self.gravar(home_layout=ruim).status_code, 400)

    def test_posicao_livre_fica_na_faixa(self):
        blocos = [
            {"id": "notas", "visivel": True, "largura": "metade", "x": 12.345, "y": 40.6, "w": 300, "h": 10},
            # Posição pela metade não vale: o app arruma esse bloco sozinho.
            {"id": "agenda", "visivel": True, "largura": "metade", "x": 10},
        ]
        resposta = self.gravar(home_layout={"blocos": blocos})
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertEqual(
            resposta.json()["home_layout"]["blocos"],
            [
                {"id": "notas", "visivel": True, "largura": "metade", "x": 12.35, "y": 41, "w": 100.0, "h": 80},
                {"id": "agenda", "visivel": True, "largura": "metade"},
            ],
        )
        ruim = {"id": "notas", "x": "10", "y": 0, "w": 50, "h": 200}
        self.assertEqual(self.gravar(home_layout={"blocos": [ruim]}).status_code, 400)

    def test_tamanho_do_bloco_arrastado_fica_na_faixa(self):
        blocos = [
            {"id": "notas", "visivel": True, "largura": "metade", "colunas": 7, "altura": 333},
            {"id": "agenda", "visivel": True, "largura": "inteira", "colunas": 40, "altura": 10},
            {"id": "tarefas", "visivel": True, "largura": "metade", "altura": None},
        ]
        resposta = self.gravar(home_layout={"blocos": blocos})
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertEqual(
            resposta.json()["home_layout"]["blocos"],
            [
                {"id": "notas", "visivel": True, "largura": "metade", "colunas": 7, "altura": 333},
                {"id": "agenda", "visivel": True, "largura": "inteira", "colunas": 12, "altura": 80},
                {"id": "tarefas", "visivel": True, "largura": "metade"},
            ],
        )
        for ruim in ({"colunas": "6"}, {"colunas": True}, {"altura": "alta"}, {"altura": [300]}):
            with self.subTest(ruim=ruim):
                bloco = {"id": "notas", **ruim}
                self.assertEqual(self.gravar(home_layout={"blocos": [bloco]}).status_code, 400)

    def test_capa_de_imagem_so_aceita_arquivo_de_midia(self):
        boa = {"capa": {"tipo": "imagem", "url": "http://127.0.0.1:8000/media/files/a/foto.png"}}
        self.assertEqual(self.gravar(home_layout=boa).status_code, 200)
        for url in (
            "javascript:alert(1)",
            "https://exemplo.com/foto.png",
            "/media/a.png) ; background: url(x",
        ):
            with self.subTest(url=url):
                ruim = {"capa": {"tipo": "imagem", "url": url}}
                self.assertEqual(self.gravar(home_layout=ruim).status_code, 400)

    def test_recorte_da_capa_fica_na_faixa(self):
        foto = {"tipo": "imagem", "url": "/media/capas/1/foto.png"}
        resposta = self.gravar(home_layout={"capa": {**foto, "x": 150, "y": 12.345, "zoom": 0.5}})
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertEqual(resposta.json()["home_layout"]["capa"], {**foto, "x": 100, "y": 12.35, "zoom": 1})
        for ruim in ({"x": "50"}, {"zoom": True}, {"y": None}):
            with self.subTest(ruim=ruim):
                self.assertEqual(self.gravar(home_layout={"capa": {**foto, **ruim}}).status_code, 400)

    def test_rascunho_tem_teto(self):
        self.assertEqual(self.gravar(scratch_pad="  lembrar do pão\n").status_code, 200)
        prefs = UserPreferences.objects.get(user=self.user)
        self.assertEqual(prefs.scratch_pad, "  lembrar do pão\n")
        self.assertEqual(self.gravar(scratch_pad="x" * (MAX_RASCUNHO + 1)).status_code, 400)


class BackupDoInicioTests(APITestCase):
    def test_layout_rascunho_e_modelos_vao_e_voltam(self):
        dono = make_user("dono")
        UserPreferences.objects.update_or_create(
            user=dono, defaults={"home_layout": LAYOUT, "scratch_pad": "ideias"}
        )
        Template.objects.create(
            owner=dono, name="Aula", kind="note",
            data={"sections": [{"id": "s1", "type": "text", "html": "<p>Tema</p>"}]},
        )

        outra = make_user("outra")
        resumo = importar(outra, io.BytesIO(exportar(dono)))

        prefs = UserPreferences.objects.get(user=outra)
        self.assertEqual((prefs.home_layout, prefs.scratch_pad), (LAYOUT, "ideias"))
        self.assertEqual(resumo["modelos"], 1)
        self.assertEqual(Template.objects.get(owner=outra).name, "Aula")

    def test_backup_montado_a_mao_nao_grava_layout_estragado(self):
        dono = make_user("dono")
        bruto = io.BytesIO(exportar(dono))
        with zipfile.ZipFile(bruto) as zf:
            dados = json.loads(zf.read("notefy.json"))
        dados["preferencias"] = {
            "theme": "dark",
            "home_layout": {"capa": {"tipo": "imagem", "url": "javascript:alert(1)"}},
            "scratch_pad": ["não é texto"],
        }
        dados["modelos"] = [{"name": "Quebrado", "kind": "note", "data": {"sections": "x"}}]
        novo = io.BytesIO()
        with zipfile.ZipFile(novo, "w") as zf:
            zf.writestr("notefy.json", json.dumps(dados))
        novo.seek(0)

        outra = make_user("outra")
        importar(outra, novo)

        prefs = UserPreferences.objects.get(user=outra)
        self.assertEqual(prefs.theme, "dark")
        self.assertEqual((prefs.home_layout, prefs.scratch_pad), ({}, ""))
        self.assertFalse(Template.objects.filter(owner=outra).exists())


def _png():
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (8, 4), "#336699").save(buffer, format="PNG")
    return buffer.getvalue()


class CapaDoInicioTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def enviar(self, conteudo, nome="capa.png", tipo="image/png"):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return self.client.post(
            "/api/me/cover/", {"imagem": SimpleUploadedFile(nome, conteudo, content_type=tipo)}, format="multipart"
        )

    def test_envia_a_foto_e_devolve_o_endereco_de_midia(self):
        resposta = self.enviar(_png())
        self.assertEqual(resposta.status_code, 201, resposta.content)
        self.assertIn("/media/capas/", resposta.json()["url"])
        # O endereço passa na regra da capa de imagem do layout.
        layout = {"capa": {"tipo": "imagem", "url": resposta.json()["url"]}}
        self.assertEqual(self.client.patch("/api/me/preferences/", {"home_layout": layout}, format="json").status_code, 200)

    def test_outra_foto_apaga_a_anterior(self):
        self.enviar(_png())
        antiga = UserPreferences.objects.get(user=self.user).home_cover
        caminho = antiga.path
        self.enviar(_png())
        import os

        self.assertFalse(os.path.exists(caminho))

    def test_o_que_nao_e_imagem_volta_400(self):
        resposta = self.enviar(b"<svg onload='x'></svg>", nome="capa.svg", tipo="image/svg+xml")
        self.assertEqual(resposta.status_code, 400)
        self.assertFalse(UserPreferences.objects.get_or_create(user=self.user)[0].home_cover)

    def test_excluir_tira_a_foto(self):
        self.enviar(_png())
        self.assertEqual(self.client.delete("/api/me/cover/").status_code, 204)
        self.assertFalse(UserPreferences.objects.get(user=self.user).home_cover)


class FotosDoInicioTests(APITestCase):
    """O papel de parede e a foto do relógio: o mesmo envio da capa, cada um no seu lugar."""

    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def enviar(self, para):
        arquivo = io.BytesIO(_png())
        arquivo.name = "foto.png"
        return self.client.post(f"/api/me/cover/?para={para}", {"imagem": arquivo}, format="multipart")

    def test_cada_foto_fica_no_seu_campo_e_uma_nao_apaga_a_outra(self):
        for para in ("capa", "fundo", "foto"):
            self.assertEqual(self.enviar(para).status_code, 201)
        prefs = UserPreferences.objects.get(user=self.user)
        self.assertTrue(prefs.home_cover and prefs.home_background and prefs.home_photo)
        self.assertEqual(len({prefs.home_cover.name, prefs.home_background.name, prefs.home_photo.name}), 3)
        self.assertEqual(self.client.delete("/api/me/cover/?para=fundo").status_code, 204)
        prefs.refresh_from_db()
        self.assertFalse(prefs.home_background)
        self.assertTrue(prefs.home_cover and prefs.home_photo)

    def test_destino_desconhecido_volta_400(self):
        self.assertEqual(self.enviar("avatar").status_code, 400)

    def test_layout_aceita_fundo_e_foto_e_recusa_material_na_foto(self):
        url = self.enviar("fundo").json()["url"]
        layout = {"fundo": {"tipo": "imagem", "url": url, "zoom": 9}, "foto": {"tipo": "imagem", "url": url}}
        resposta = self.client.patch("/api/me/preferences/", {"home_layout": layout}, format="json")
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertEqual(resposta.json()["home_layout"]["fundo"]["zoom"], 3)
        self.assertEqual(resposta.json()["home_layout"]["foto"]["url"], url)
        for ruim in ({"foto": {"tipo": "gradiente", "id": "lousa"}}, {"fundo": {"tipo": "imagem", "url": "javascript:alert(1)"}}):
            self.assertEqual(self.client.patch("/api/me/preferences/", {"home_layout": ruim}, format="json").status_code, 400, ruim)

"""Modelos salvos pela pessoa (`/api/templates/`).

Um modelo é molde, não conteúdo: nasce de um item ("salvar como modelo")
ou de um `data` pronto, passa pela mesma validação do documento e nunca
enxerga item de outra conta.
"""

from rest_framework.test import APITestCase

from content.models import Template
from core.testutils import make_document, make_user

NOTA = {
    "sections": [
        {"id": "s1", "type": "text", "html": "<h2>Pauta</h2><p>Tópicos da reunião</p>"},
        {"id": "s2", "type": "checklist", "items": [{"id": "i1", "text": "Ler a ata", "done": False}]},
    ]
}


class ModelosTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def test_cria_a_partir_de_um_item_copiando_tipo_e_conteudo(self):
        doc = make_document(self.user, title="Reunião semanal", data=NOTA)

        resposta = self.client.post("/api/templates/", {"document": str(doc.id)}, format="json")

        self.assertEqual(resposta.status_code, 201, resposta.content)
        modelo = Template.objects.get(pk=resposta.json()["id"])
        self.assertEqual(modelo.kind, "note")
        self.assertEqual(modelo.name, "Reunião semanal")
        self.assertEqual(modelo.data["sections"][1]["items"][0]["text"], "Ler a ata")

    def test_o_modelo_e_uma_copia_e_nao_muda_com_o_item(self):
        doc = make_document(self.user, title="Original", data=NOTA)
        resposta = self.client.post(
            "/api/templates/", {"document": str(doc.id), "name": "Ata"}, format="json"
        )
        doc.data = {"sections": [{"id": "s1", "type": "text", "html": "<p>outra coisa</p>"}]}
        doc.save()

        modelo = Template.objects.get(pk=resposta.json()["id"])
        self.assertEqual(modelo.name, "Ata")
        self.assertIn("Pauta", modelo.data["sections"][0]["html"])

    def test_cria_com_conteudo_pronto(self):
        resposta = self.client.post(
            "/api/templates/",
            {"name": "Diário", "description": "Uma página por dia", "kind": "note", "data": NOTA},
            format="json",
        )
        self.assertEqual(resposta.status_code, 201, resposta.content)
        self.assertEqual(resposta.json()["excerpt"], "Pauta Tópicos da reunião Ler a ata")

    def test_conteudo_invalido_volta_400(self):
        ruim = {"sections": [{"id": "s1", "type": "video"}]}
        resposta = self.client.post(
            "/api/templates/", {"name": "X", "kind": "note", "data": ruim}, format="json"
        )
        self.assertEqual(resposta.status_code, 400)
        self.assertEqual(Template.objects.count(), 0)

    def test_arquivo_nao_vira_modelo(self):
        resposta = self.client.post(
            "/api/templates/", {"name": "PDF", "kind": "file", "data": {}}, format="json"
        )
        self.assertEqual(resposta.status_code, 400)

    def test_sem_nome_volta_400(self):
        resposta = self.client.post("/api/templates/", {"kind": "note", "data": NOTA}, format="json")
        self.assertEqual(resposta.status_code, 400)

    def test_item_de_outra_conta_nao_vira_modelo(self):
        alheio = make_document(make_user("outra"), title="Segredo", data=NOTA)
        resposta = self.client.post("/api/templates/", {"document": str(alheio.id)}, format="json")
        self.assertEqual(resposta.status_code, 400)
        self.assertEqual(Template.objects.count(), 0)

    def test_listagem_sem_conteudo_e_detalhe_com(self):
        modelo = Template.objects.create(owner=self.user, name="Aula", kind="note", data=NOTA)

        lista = self.client.get("/api/templates/").json()
        itens = lista["results"] if isinstance(lista, dict) else lista
        self.assertEqual([i["name"] for i in itens], ["Aula"])
        self.assertNotIn("data", itens[0])

        detalhe = self.client.get(f"/api/templates/{modelo.id}/").json()
        self.assertEqual(detalhe["data"]["sections"][0]["id"], "s1")

    def test_modelo_de_outra_conta_nao_aparece(self):
        Template.objects.create(owner=make_user("outra"), name="Alheio", kind="note", data=NOTA)
        lista = self.client.get("/api/templates/").json()
        itens = lista["results"] if isinstance(lista, dict) else lista
        self.assertEqual(itens, [])

    def test_editar_troca_nome_mas_nao_o_conteudo(self):
        modelo = Template.objects.create(owner=self.user, name="Aula", kind="note", data=NOTA)
        resposta = self.client.patch(
            f"/api/templates/{modelo.id}/",
            {"name": "Aula prática", "kind": "canvas", "data": {"nodes": []}},
            format="json",
        )
        self.assertEqual(resposta.status_code, 200, resposta.content)
        modelo.refresh_from_db()
        self.assertEqual((modelo.name, modelo.kind), ("Aula prática", "note"))
        self.assertEqual(modelo.data, NOTA)

    def test_excluir_apaga_de_vez_sem_tocar_nos_itens(self):
        doc = make_document(self.user, title="Original", data=NOTA)
        modelo = Template.objects.create(owner=self.user, name="Aula", kind="note", data=NOTA)
        resposta = self.client.delete(f"/api/templates/{modelo.id}/")
        self.assertEqual(resposta.status_code, 204)
        self.assertFalse(Template.objects.exists())
        doc.refresh_from_db()
        self.assertIsNone(doc.deleted_at)


class AnexosNaListagemTests(APITestCase):
    """A capa do Início procura imagens também entre os anexos das notas."""

    def test_anexo_so_aparece_quando_pedido(self):
        user = make_user()
        self.client.force_authenticate(user)
        nota = make_document(user, title="Nota")
        make_document(user, folder=nota.folder, kind="file", title="foto.png", attached_to=nota)

        def titulos(url):
            dados = self.client.get(url).json()
            return [d["title"] for d in (dados["results"] if isinstance(dados, dict) else dados)]

        self.assertNotIn("foto.png", titulos("/api/documents/?kind=file"))
        self.assertIn("foto.png", titulos("/api/documents/?kind=file&anexos=true"))

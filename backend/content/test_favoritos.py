"""A lista de favoritos que a barra lateral desenha.

Antes existiam duas fontes para a mesma pergunta: a tela de Favoritos
lia `/api/favorites/`, e a barra lateral montava a lista dela com
`/api/documents/?is_favorite=true` mais `/api/folders/?is_favorite=true`,
com ordenações diferentes. A tela saiu e sobrou uma fonte só, então o que
este endpoint devolve virou o que o usuário vê — inclusive os campos que
a barra usa para pintar o ícone e para oferecer "Ir para pasta".
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from content.models import Document
from core.testutils import make_category, make_document, make_folder, make_user
from organization.models import Folder


class FavoritosTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.category = make_category(self.user)
        self.folder = make_folder(self.user, category=self.category, name="Cálculo")
        self.client.force_authenticate(self.user)

    def resultados(self):
        resposta = self.client.get("/api/favorites/")
        self.assertEqual(resposta.status_code, 200)
        return resposta.json()["results"]

    def test_so_o_que_esta_com_a_estrela_aparece(self):
        make_document(self.user, folder=self.folder, title="Marcado", is_favorite=True)
        make_document(self.user, folder=self.folder, title="Sem estrela")

        titulos = [item["title"] for item in self.resultados()]
        self.assertEqual(titulos, ["Marcado"])

    def test_pastas_entram_junto_com_os_documentos(self):
        self.folder.is_favorite = True
        self.folder.save(update_fields=["is_favorite"])
        make_document(self.user, folder=self.folder, title="Lista 1", is_favorite=True)

        tipos = {item["type"] for item in self.resultados()}
        self.assertEqual(tipos, {"folder", "note"})

    def test_ordem_e_do_mais_recente_para_o_mais_antigo(self):
        # A barra lateral mostra só os primeiros itens, então a ordem
        # decide QUAIS aparecem. Pasta e documento disputam as mesmas
        # vagas: a de antes empilhava as pastas na frente, sempre.
        self.folder.is_favorite = True
        self.folder.save(update_fields=["is_favorite"])
        doc = make_document(self.user, folder=self.folder, title="Lista 1", is_favorite=True)

        # As datas vão escritas à mão, por `update()` (que passa por cima do
        # `auto_now`). Salvar um e depois o outro não garante ordem: no
        # Windows o relógio pode devolver o MESMO instante para dois saves
        # seguidos, e o teste passava ou falhava conforme a sorte.
        agora = timezone.now()

        Folder.objects.filter(pk=self.folder.pk).update(updated_at=agora - timedelta(minutes=5))
        Document.objects.filter(pk=doc.pk).update(updated_at=agora)
        self.assertEqual(self.resultados()[0]["id"], str(doc.id))

        Folder.objects.filter(pk=self.folder.pk).update(updated_at=agora + timedelta(minutes=5))
        self.assertEqual(self.resultados()[0]["id"], str(self.folder.id))

    def test_documento_carrega_a_pasta_e_a_cor(self):
        doc = make_document(
            self.user,
            folder=self.folder,
            title="Lista 1",
            is_favorite=True,
            color="#FF0000",
        )

        item = self.resultados()[0]
        # `folder` é o id (destino do "Ir para pasta"); `subtitle` é o nome.
        self.assertEqual(item["folder"], str(self.folder.id))
        self.assertEqual(item["subtitle"], "Cálculo")
        self.assertEqual(item["color"], "#FF0000")
        self.assertEqual(item["url"], f"/notes/{doc.id}")

    def test_pasta_nao_tem_pasta_de_destino(self):
        self.folder.is_favorite = True
        self.folder.color = "#00FF00"
        self.folder.save(update_fields=["is_favorite", "color"])

        item = self.resultados()[0]
        self.assertEqual(item["folder"], "")
        self.assertEqual(item["color"], "#00FF00")
        self.assertEqual(item["url"], f"/folders/{self.folder.id}")

    def test_favorito_de_outra_pessoa_nao_vaza(self):
        outro = make_user(username="outro")
        pasta_dele = make_folder(outro, category=make_category(outro))
        make_document(outro, folder=pasta_dele, title="Particular", is_favorite=True)

        self.assertEqual(self.resultados(), [])

    def test_item_na_lixeira_sai_da_lista(self):
        doc = make_document(self.user, folder=self.folder, title="Lista 1", is_favorite=True)
        self.assertEqual(len(self.resultados()), 1)

        doc.delete()
        self.assertEqual(self.resultados(), [])

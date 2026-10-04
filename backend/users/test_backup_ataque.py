"""O import de backup contra .zip fabricado, e as imagens na restauração.

O .zip é a única entrada do app que não passa por serializer nenhum. Um
backup corrompido, montado à mão ou malicioso tem que dar 400 legível,
nunca 500, e nunca meia restauração.
"""

import io
import json
import re
import zipfile

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from content.models import Document
from core.testutils import make_category, make_folder, make_user
from organization.models import Category

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def zip_de(entradas, metodo=zipfile.ZIP_DEFLATED):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", metodo) as zf:
        for nome, dado in entradas.items():
            zf.writestr(nome, dado)
    return buffer.getvalue()


class ImportMaliciosoTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)

    def importar(self, conteudo, substituir=False):
        return self.client.post(
            "/api/me/backup/import/",
            {
                "file": SimpleUploadedFile("b.zip", conteudo, content_type="application/zip"),
                "replace": "true" if substituir else "false",
            },
            format="multipart",
        )

    def manifesto(self, **extra):
        return json.dumps({"notefy_backup": 1, "categorias": [], "pastas": [], "documentos": [], **extra})

    def test_bomba_de_zip_e_recusada_antes_de_ler(self):
        limite = settings.MAX_UPLOAD_SIZE
        bomba = zip_de({"notefy.json": self.manifesto(), "media/x.bin": b"\0" * (limite + 1)})
        self.assertLess(len(bomba), limite // 100)  # comprimida, é minúscula
        resposta = self.importar(bomba)
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("grande demais", resposta.json()["file"])

    def test_formato_que_nao_e_numero(self):
        self.assertEqual(self.importar(zip_de({"notefy.json": '{"notefy_backup": "1"}'})).status_code, 400)

    def test_manifesto_que_nao_e_objeto(self):
        self.assertEqual(self.importar(zip_de({"notefy.json": "[1, 2, 3]"})).status_code, 400)

    def test_manifesto_aninhado_demais(self):
        profundo = '{"notefy_backup": 1, "x": ' + "[" * 5000 + "]" * 5000 + "}"
        self.assertEqual(self.importar(zip_de({"notefy.json": profundo})).status_code, 400)

    def test_item_sem_id_nao_deixa_meia_restauracao(self):
        manifesto = self.manifesto(categorias=[{"id": "c1", "name": "Boa"}, {"name": "Sem id"}])
        resposta = self.importar(zip_de({"notefy.json": manifesto}))
        self.assertEqual(resposta.status_code, 400)
        # Atômico: a categoria boa, criada antes do erro, também sai.
        self.assertFalse(Category.objects.filter(owner=self.user).exists())


class ImagensNaRestauracaoTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.folder = make_folder(self.user, category=make_category(self.user))
        self.client.force_authenticate(self.user)

    def criar_com_imagem(self, kind, titulo):
        doc = self.client.post(
            "/api/documents/",
            {"kind": kind, "title": titulo, "folder": str(self.folder.id)},
            format="json",
        ).json()
        url = self.client.post(
            "/api/documents/upload/",
            {"files": [SimpleUploadedFile("image.png", PNG, content_type="image/png")], "attached_to": doc["id"]},
            format="multipart",
        ).json()[0]["file_url"]
        if kind == "note":
            data = {"sections": [{"id": "s", "type": "text", "html": f'<img src="{url}">'}]}
        else:
            data = {"nodes": [{"id": "n", "type": "image", "x": 0, "y": 0, "w": 9, "h": 9, "url": url}], "edges": [], "strokes": []}
        self.client.patch(f"/api/documents/{doc['id']}/", {"data": data}, format="json")
        return doc["id"]

    def caminhos_citados(self, doc):
        return re.findall(r"/media/(files/[^\"'\s\\]+)", json.dumps(doc.data))

    def restaurar_substituindo(self):
        exportado = self.client.get("/api/me/backup/")
        corpo = b"".join(exportado.streaming_content) if hasattr(exportado, "streaming_content") else exportado.content
        resposta = self.client.post(
            "/api/me/backup/import/",
            {"file": SimpleUploadedFile("b.zip", corpo, content_type="application/zip"), "replace": "true"},
            format="multipart",
        )
        self.assertEqual(resposta.status_code, 200, resposta.content[:300])

    def test_imagens_de_nota_e_canvas_voltam_funcionando(self):
        self.criar_com_imagem("note", "Aula")
        self.criar_com_imagem("canvas", "Mapa")

        with self.captureOnCommitCallbacks(execute=True):
            self.restaurar_substituindo()

        for doc in Document.objects.alive().filter(owner=self.user).exclude(kind="file"):
            citados = self.caminhos_citados(doc)
            self.assertEqual(len(citados), 1, doc.kind)
            self.assertTrue((settings.MEDIA_ROOT / citados[0]).is_file(), f"{doc.kind}: {citados[0]}")

    def test_arquivo_compartilhado_volta_compartilhado(self):
        original = self.criar_com_imagem("note", "Aula")
        self.client.post(f"/api/documents/{original}/duplicate/")

        with self.captureOnCommitCallbacks(execute=True):
            self.restaurar_substituindo()

        notas = list(Document.objects.alive().filter(owner=self.user, kind="note"))
        self.assertEqual(len(notas), 2)
        # As duas notas citam o MESMO arquivo, e cada uma tem um anexo
        # apontando para ele: apagar uma não pode levar a imagem da outra.
        citados = {self.caminhos_citados(n)[0] for n in notas}
        self.assertEqual(len(citados), 1)
        compartilhado = citados.pop()
        for nota in notas:
            self.assertEqual(Document.objects.alive().get(attached_to=nota).file.name, compartilhado)

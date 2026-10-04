"""Anexos, imagens coladas e arquivos compartilhados.

Tudo aqui saiu de um ataque ao app. Cada teste é um jeito real de perder
uma imagem ou de ver "erro do servidor":

- o segundo print colado na mesma pasta estourava (todo print chega como
  "image.png", e a regra de nome único valia para anexo);
- duplicar e depois apagar o original levava as imagens da cópia;
- duplicar um arquivo e apagar o original apagava o arquivo da cópia;
- um HTML ou SVG enviado era servido como página ativa.
"""

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory
from rest_framework.test import APITestCase

from core.servir_midia import servir_midia
from core.testutils import make_category, make_folder, make_user

from .models import Document

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00"
    b"\x00\x00\x00IEND\xaeB`\x82"
)


class Base(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.folder = make_folder(self.user, category=make_category(self.user))
        self.client.force_authenticate(self.user)

    def nota(self, titulo="Aula"):
        return self.client.post(
            "/api/documents/",
            {"kind": "note", "title": titulo, "folder": str(self.folder.id)},
            format="json",
        ).json()

    def colar(self, doc_id, nome="image.png"):
        return self.client.post(
            "/api/documents/upload/",
            {"files": [SimpleUploadedFile(nome, PNG, content_type="image/png")], "attached_to": doc_id},
            format="multipart",
        )

    def existe_no_disco(self, doc):
        return (settings.MEDIA_ROOT / doc.file.name).is_file()


class ColarImagemTests(Base):
    def test_segundo_print_na_mesma_pasta(self):
        a, b = self.nota("A"), self.nota("B")
        self.assertEqual(self.colar(a["id"]).status_code, 201)
        # Mesmo nome, mesma pasta (o anexo herda a pasta da nota).
        self.assertEqual(self.colar(b["id"]).status_code, 201)
        self.assertEqual(self.colar(a["id"]).status_code, 201)

    def test_arquivo_solto_continua_com_nome_unico(self):
        # A exceção é só para anexo: dois itens soltos com o mesmo nome na
        # mesma pasta apareceriam repetidos na listagem.
        subir = lambda: self.client.post(  # noqa: E731
            "/api/documents/upload/",
            {"files": [SimpleUploadedFile("prova.pdf", b"%PDF-1.4")], "folder": str(self.folder.id)},
            format="multipart",
        )
        self.assertEqual(subir().status_code, 201)
        self.assertEqual(subir().status_code, 400)

    def test_nome_de_arquivo_longo_vira_titulo_com_extensao(self):
        resposta = self.client.post(
            "/api/documents/upload/",
            {"files": [SimpleUploadedFile("a" * 300 + ".pdf", b"%PDF")], "folder": str(self.folder.id)},
            format="multipart",
        )
        self.assertEqual(resposta.status_code, 201)
        titulo = resposta.json()[0]["title"]
        self.assertLessEqual(len(titulo), 250)
        self.assertTrue(titulo.endswith(".pdf"))


class DuplicarTests(Base):
    def test_copia_mantem_imagens_depois_de_apagar_o_original(self):
        original = self.nota()
        self.colar(original["id"])
        copia_id = self.client.post(f"/api/documents/{original['id']}/duplicate/").json()["id"]

        self.client.delete(f"/api/documents/{original['id']}/")
        self.client.delete(f"/api/trash/document/{original['id']}/")

        anexos = Document.objects.alive().filter(attached_to_id=copia_id)
        self.assertEqual(anexos.count(), 1)
        self.assertTrue(self.existe_no_disco(anexos.get()))

    def test_arquivo_duplicado_sobrevive_ao_original(self):
        subido = self.client.post(
            "/api/documents/upload/",
            {"files": [SimpleUploadedFile("prova.pdf", b"%PDF-1.4 x")], "folder": str(self.folder.id)},
            format="multipart",
        ).json()[0]
        copia = self.client.post(f"/api/documents/{subido['id']}/duplicate/").json()

        self.client.delete(f"/api/documents/{subido['id']}/")
        self.client.delete(f"/api/trash/document/{subido['id']}/")

        self.assertTrue(self.existe_no_disco(Document.objects.get(pk=copia["id"])))

    def test_ultimo_dono_leva_o_arquivo(self):
        # A contagem não pode virar vazamento: sem ninguém apontando, o
        # arquivo sai do disco como antes.
        nota = self.nota()
        anexo = Document.objects.get(pk=self.colar(nota["id"]).json()[0]["id"])
        caminho = settings.MEDIA_ROOT / anexo.file.name
        with self.captureOnCommitCallbacks(execute=True):
            anexo.hard_delete()
        self.assertFalse(caminho.exists())


class TipoDoItemTests(Base):
    def test_kind_nao_muda_depois_de_criado(self):
        nota = self.nota()
        for outro in ("spreadsheet", "file"):
            resposta = self.client.patch(f"/api/documents/{nota['id']}/", {"kind": outro}, format="json")
            self.assertEqual(resposta.status_code, 400)
        self.assertEqual(Document.objects.get(pk=nota["id"]).kind, "note")

    def test_mandar_o_mesmo_kind_continua_valendo(self):
        # O editor manda o `kind` em todo salvamento.
        nota = self.nota()
        resposta = self.client.patch(
            f"/api/documents/{nota['id']}/", {"kind": "note", "title": "Novo"}, format="json"
        )
        self.assertEqual(resposta.status_code, 200)


class ArquivoAtivoTests(Base):
    def servir(self, nome, conteudo, tipo):
        doc = self.client.post(
            "/api/documents/upload/",
            {"files": [SimpleUploadedFile(nome, conteudo, content_type=tipo)], "folder": str(self.folder.id)},
            format="multipart",
        ).json()[0]
        # A view direto, e não a URL: a rota de /media/ só é montada com
        # DEBUG ou no desktop, e o executor de testes força DEBUG=False.
        relativo = Document.objects.get(pk=doc["id"]).file.name
        return servir_midia(RequestFactory().get("/media/" + relativo), relativo)

    def test_html_e_svg_saem_como_download_isolado(self):
        for nome, tipo in (("p.html", "text/html"), ("logo.svg", "image/svg+xml")):
            resposta = self.servir(nome, b"<script>alert(1)</script>", tipo)
            self.assertTrue(resposta["Content-Disposition"].startswith("attachment"), nome)
            self.assertIn("sandbox", resposta["Content-Security-Policy"])
            self.assertEqual(resposta["X-Content-Type-Options"], "nosniff")

    def test_pdf_e_imagem_continuam_abrindo_na_hora(self):
        resposta = self.servir("print.png", PNG, "image/png")
        self.assertFalse(resposta.get("Content-Disposition", "").startswith("attachment"))
        self.assertNotIn("Content-Security-Policy", resposta)

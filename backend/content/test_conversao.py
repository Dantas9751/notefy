"""Conversão de arquivos importados pelo botão direito."""

import io
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from PIL import Image
from pypdf import PdfReader
from rest_framework.test import APITestCase

from core.testutils import make_category, make_document, make_folder, make_user

from .conversao import (
    COLUNAS_DO_PDF,
    LIMITE_DE_PIXELS,
    LIMITE_DE_TEXTO,
    NaoConverte,
    _quebrar_em_colunas,
    _texto_como_html,
    converter,
    destinos,
    nome_convertido,
)
from .models import Document


def imagem(formato="PNG", modo="RGBA", cor=(255, 0, 0, 0), tamanho=(4, 2), **extra):
    saida = io.BytesIO()
    Image.new(modo, tamanho, cor).save(saida, formato, **extra)
    return saida.getvalue()


def abrir(dados):
    return Image.open(io.BytesIO(dados))


class Destinos(SimpleTestCase):
    def test_imagem_vai_para_as_outras_e_para_pdf(self):
        self.assertEqual(destinos("foto.PNG"), ["pdf", "jpg", "webp", "gif", "bmp", "tiff"])
        self.assertNotIn("jpg", destinos("foto.jpeg"))

    def test_texto_so_vai_para_pdf(self):
        for nome in ("a.txt", "b.md", "c.html"):
            self.assertEqual(destinos(nome), ["pdf"])

    def test_office_e_desconhecido_nao_convertem(self):
        for nome in ("a.docx", "b.pptx", "c.pdf", "sem-extensao", ""):
            self.assertEqual(destinos(nome), [])

    def test_nome_troca_so_extensao_conhecida(self):
        self.assertEqual(nome_convertido("foto.png", "jpg"), "foto.jpg")
        self.assertEqual(nome_convertido("Relatório v1.2", "pdf"), "Relatório v1.2.pdf")


class Converter(SimpleTestCase):
    def test_transparencia_vira_branco_onde_nao_cabe(self):
        jpg = abrir(converter(imagem(), "a.png", "jpg"))
        self.assertEqual(jpg.format, "JPEG")
        self.assertGreater(min(jpg.convert("RGB").getpixel((0, 0))), 245)

    def test_transparencia_fica_onde_cabe(self):
        webp = abrir(converter(imagem(), "a.png", "webp"))
        self.assertEqual(webp.getpixel((0, 0))[3], 0)

    def test_imagem_para_pdf(self):
        self.assertTrue(converter(imagem("JPEG", "RGB", "blue"), "a.jpg", "pdf").startswith(b"%PDF"))

    def test_gif_animado_leva_o_primeiro_quadro(self):
        saida = io.BytesIO()
        quadros = [Image.new("RGB", (2, 2), cor) for cor in ("red", "blue")]
        quadros[0].save(saida, "GIF", save_all=True, append_images=quadros[1:])
        png = abrir(converter(saida.getvalue(), "a.gif", "png"))
        self.assertEqual(png.convert("RGB").getpixel((0, 0)), (255, 0, 0))

    def test_foto_de_celular_sai_em_pe(self):
        exif = Image.Exif()
        exif[0x0112] = 6  # girar 90°: a câmera gravou deitada
        dados = imagem("JPEG", "RGB", "green", (4, 2), exif=exif.tobytes())
        self.assertEqual(abrir(converter(dados, "a.jpg", "png")).size, (2, 4))

    def test_texto_para_pdf_mantem_as_quebras_de_linha_e_o_recuo(self):
        # `white-space: pre-wrap` virava um parágrafo só no xhtml2pdf.
        html = _texto_como_html("Linha 1\n    recuada\n\nLinha 4".encode(), "txt")
        self.assertNotIn("pre-wrap", html)
        self.assertIn("<pre", html)
        self.assertIn("Linha 1\n    recuada\n\nLinha 4", html)

    def test_linha_longa_quebra_na_margem_com_o_mesmo_recuo(self):
        longa = "    " + "palavra " * 40
        quebrada = _quebrar_em_colunas(longa)
        linhas = quebrada.split("\n")
        self.assertGreater(len(linhas), 1)
        self.assertTrue(all(len(l) <= COLUNAS_DO_PDF for l in linhas))
        self.assertTrue(all(l.startswith("    ") for l in linhas))
        # Palavra sem espaço maior que a margem também parte, em vez de sair da página.
        self.assertTrue(all(len(l) <= COLUNAS_DO_PDF for l in _quebrar_em_colunas("x" * 300).split("\n")))

    def test_texto_vira_pdf_com_o_conteudo(self):
        pdf = converter("Olá, ação\n\tcom recuo".encode(), "a.txt", "pdf")
        texto = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
        self.assertIn("Olá, ação", texto)

    def test_html_e_lido_como_html(self):
        pdf = converter(b"<h1>Titulo</h1><script>x</script>", "a.html", "pdf")
        self.assertIn("Titulo", PdfReader(io.BytesIO(pdf)).pages[0].extract_text())

    def test_arquivo_corrompido_explica(self):
        with self.assertRaises(NaoConverte):
            converter(b"isto nao e png", "a.png", "jpg")

    def test_par_invalido_recusa(self):
        with self.assertRaises(NaoConverte):
            converter(b"x", "a.txt", "png")


class ConverterPelaApi(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.folder = make_folder(self.user, category=make_category(self.user))
        self.client.force_authenticate(self.user)

    def enviar(self, nome="foto.png", dados=None):
        resposta = self.client.post(
            "/api/documents/upload/",
            {"folder": str(self.folder.id), "files": [SimpleUploadedFile(nome, dados or imagem())]},
            format="multipart",
        )
        return Document.objects.get(pk=resposta.data[0]["id"])

    def converter(self, documento, para):
        return self.client.post(f"/api/documents/{documento.id}/convert/", {"para": para}, format="json")

    def test_cria_arquivo_novo_ao_lado_e_numera_o_repetido(self):
        original = self.enviar()
        primeira = self.converter(original, "jpg")
        segunda = self.converter(original, "JPG")
        self.assertEqual(primeira.status_code, 201, primeira.data)
        self.assertEqual(primeira.data["title"], "foto.jpg")
        self.assertEqual(primeira.data["mime_type"], "image/jpeg")
        self.assertEqual(primeira.data["folder"], self.folder.id)
        self.assertEqual(segunda.data["title"], "foto (2).jpg")
        original.refresh_from_db()
        self.assertEqual(original.mime_type, "image/png")

    def test_nome_repetido_nao_diferencia_maiusculas(self):
        self.enviar("FOTO.JPG", imagem("JPEG", "RGB", "red"))
        self.assertEqual(self.converter(self.enviar(), "jpg").data["title"], "foto (2).jpg")

    def test_campo_conversoes_so_em_arquivo_importado(self):
        arquivo = self.enviar()
        nota = make_document(self.user, self.folder, title="Aula")
        lista = self.client.get(f"/api/folders/{self.folder.id}/contents/").data["documents"]
        por_id = {item["id"]: item for item in lista}
        self.assertIn("pdf", por_id[str(arquivo.id)]["conversoes"])
        self.assertEqual(por_id[str(nota.id)]["conversoes"], [])
        self.assertIn("jpg", self.client.get(f"/api/documents/{arquivo.id}/").data["conversoes"])

    def test_item_do_app_nao_converte(self):
        nota = make_document(self.user, self.folder, title="Aula.txt")
        self.assertEqual(self.converter(nota, "pdf").status_code, 400)

    def test_formato_fora_da_lista_recusa(self):
        self.assertEqual(self.converter(self.enviar(), "docx").status_code, 400)

    def test_arquivo_corrompido_vira_422_com_motivo(self):
        resposta = self.converter(self.enviar("quebrada.png", b"nao e imagem"), "jpg")
        self.assertEqual(resposta.status_code, 422)
        self.assertIn("corrompido", resposta.data["detail"])

    def test_arquivo_sumido_do_disco_vira_422(self):
        original = self.enviar()
        original.file.storage.delete(original.file.name)
        self.assertEqual(self.converter(original, "jpg").status_code, 422)

    def test_arquivo_de_outra_conta_nao_aparece(self):
        original = self.enviar()
        self.client.force_authenticate(make_user("outra"))
        self.assertEqual(self.converter(original, "jpg").status_code, 404)

    def test_salvar_pdf_da_nota_duas_vezes_numera(self):
        nota = make_document(self.user, self.folder, title="Aula")
        titulos = [
            self.client.post(f"/api/documents/{nota.id}/pdf/").data["title"] for _ in range(2)
        ]
        self.assertEqual(titulos, ["Aula.pdf", "Aula (2).pdf"])


class Limites(SimpleTestCase):
    """Arquivo pequeno que vira muito: o servidor não pode cair por ele."""

    def test_imagem_com_pixels_demais_e_recusada_antes_de_decodificar(self):
        # Um PNG de uma cor só comprime para quase nada no upload, mas
        # declara milhões de pixels; decodificado, ocuparia gigabytes.
        lado = int(LIMITE_DE_PIXELS ** 0.5) + 1
        dados = imagem("PNG", "1", 0, (lado, lado))
        self.assertLess(len(dados), 2 * 1024 * 1024)
        with self.assertRaises(NaoConverte) as erro:
            converter(dados, "a.png", "jpg")
        self.assertIn("grande", str(erro.exception))

    def test_texto_grande_demais_para_pdf_e_recusado(self):
        with self.assertRaises(NaoConverte) as erro:
            converter(b"a" * (LIMITE_DE_TEXTO + 1), "a.txt", "pdf")
        self.assertIn("grande", str(erro.exception))

    def test_imagem_acima_do_limite_do_pillow_e_grande_demais(self):
        # Acima do limite do Pillow, o `Image.open` já recusa, antes da
        # nossa conta de pixels: a mensagem tem de ser a mesma.
        with mock.patch.object(Image, "MAX_IMAGE_PIXELS", 10):
            with self.assertRaises(NaoConverte) as erro:
                converter(imagem("PNG", "RGB", "red", (10, 10)), "a.png", "jpg")
        self.assertIn("grande", str(erro.exception))


class CorpoInvalido(APITestCase):
    def test_corpo_que_nao_e_objeto_vira_400(self):
        user = make_user()
        self.client.force_authenticate(user)
        folder = make_folder(user, category=make_category(user))
        resposta = self.client.post(
            "/api/documents/upload/",
            {"folder": str(folder.id), "files": [SimpleUploadedFile("a.png", imagem())]},
            format="multipart",
        )
        url = f"/api/documents/{resposta.data[0]['id']}/convert/"
        self.assertEqual(self.client.post(url, ["pdf"], format="json").status_code, 400)

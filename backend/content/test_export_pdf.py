"""Exportar nota em PDF, com imagem dentro.

Desde que a nota aceita imagem, o `<img src>` aponta para a mídia do
próprio servidor. Sem `link_callback` o xhtml2pdf ia buscá-la por HTTP —
contra o mesmo processo que está gerando o PDF — e a exportação inteira
voltava 500.
"""

from pathlib import Path

from django.conf import settings
from django.test import TestCase
from PIL import Image

from content.export_pdf import _resolver_midia, render_pdf
from content.models import Document
from core.testutils import make_category, make_document, make_folder, make_user


class ResolverMidiaTests(TestCase):
    def setUp(self):
        self.pasta = Path(settings.MEDIA_ROOT) / "teste-pdf"
        self.pasta.mkdir(parents=True, exist_ok=True)

    def _url(self, nome):
        return f"http://127.0.0.1:8000{settings.MEDIA_URL}teste-pdf/{nome}"

    def test_midia_local_vira_caminho_de_disco(self):
        arquivo = self.pasta / "valida.png"
        Image.new("RGB", (8, 8), (112, 134, 76)).save(arquivo)
        self.assertEqual(_resolver_midia(self._url("valida.png")), str(arquivo))

    def test_imagem_corrompida_e_descartada(self):
        """Devolver o caminho faria o xhtml2pdf estourar OSError."""
        arquivo = self.pasta / "quebrada.png"
        arquivo.write_bytes(b"\x89PNG\r\n\x1a\n lixo")
        self.assertIsNone(_resolver_midia(self._url("quebrada.png")))

    def test_url_de_fora_nao_passa_mais(self):
        """Este teste AFIRMAVA o contrário, e o contrário era a falha.

        Devolver a URL como veio fazia o xhtml2pdf buscá-la: quem
        escrevesse o `html` de uma nota escolhia um endereço e o servidor
        ia lá. Agora a imagem externa não sai no PDF — é o lado certo da
        troca para fechar uma requisição cega a partir do backend.
        """
        self.assertIsNone(_resolver_midia("https://exemplo.com/figura.png"))

    def test_arquivo_ausente_nao_passa_mais(self):
        """Mesmo motivo: devolver a URL mandava o xhtml2pdf buscá-la."""
        self.assertIsNone(_resolver_midia(self._url("nao-existe.png")))


class RenderPdfTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.folder = make_folder(self.user, category=make_category(self.user))
        self.pasta = Path(settings.MEDIA_ROOT) / "teste-pdf"
        self.pasta.mkdir(parents=True, exist_ok=True)

    def _nota_com_imagem(self, nome):
        url = f"{settings.MEDIA_URL}teste-pdf/{nome}"
        html = f'<p>Antes</p><img src="{url}" alt="fig" /><p>Depois</p>'
        return make_document(
            self.user,
            folder=self.folder,
            kind=Document.Kind.NOTE,
            title="Com imagem",
            content=html,
            data={"sections": [{"id": "s1", "type": "text", "html": html}]},
        )

    def test_nota_com_imagem_valida_gera_pdf(self):
        Image.new("RGB", (40, 20), (112, 134, 76)).save(self.pasta / "ok.png")
        self.assertGreater(len(render_pdf(self._nota_com_imagem("ok.png"))), 0)

    def test_imagem_quebrada_nao_derruba_a_exportacao(self):
        """Uma nota de vinte páginas não pode deixar de sair por um PNG."""
        (self.pasta / "ruim.png").write_bytes(b"\x89PNG\r\n\x1a\n lixo")
        self.assertGreater(len(render_pdf(self._nota_com_imagem("ruim.png"))), 0)

    def test_nota_sem_imagem_continua_gerando(self):
        nota = make_document(
            self.user, folder=self.folder, kind=Document.Kind.NOTE, title="Só texto"
        )
        self.assertGreater(len(render_pdf(nota)), 0)


class SecoesNoPdfTests(TestCase):
    """Checklist e tabela têm que chegar ao papel.

    Um tipo de seção sem renderizador cairia no ramo de texto, que lê
    `html` — e o bloco sairia do PDF em silêncio, sem erro nenhum para
    avisar. É o modo de falhar mais caro: só se descobre ao imprimir.
    """

    def setUp(self):
        self.user = make_user()
        self.folder = make_folder(self.user, category=make_category(self.user))

    def nota(self, *sections):
        return make_document(
            self.user,
            folder=self.folder,
            kind=Document.Kind.NOTE,
            title="Aula",
            data={"sections": list(sections)},
        )

    def test_checklist_vira_colchetes(self):
        from content.export_pdf import build_html

        html = build_html(self.nota({
            "id": "s1",
            "type": "checklist",
            "items": [
                {"id": "i1", "text": "Ler o capítulo", "done": True},
                {"id": "i2", "text": "Fazer a lista", "done": False},
            ],
        }))
        self.assertIn("Ler o capítulo", html)
        self.assertIn("Fazer a lista", html)
        # `<input type=checkbox>` não sobrevive ao xhtml2pdf.
        self.assertIn("[x]", html)
        self.assertNotIn("<input", html)

    def test_tabela_usa_th_na_primeira_linha(self):
        from content.export_pdf import build_html

        html = build_html(self.nota({
            "id": "s1",
            "type": "table",
            "rows": [["Autor", "Obra"], ["Machado", "Dom Casmurro"]],
        }))
        self.assertIn("<th>Autor</th>", html)
        self.assertIn("<td>Machado</td>", html)

    def test_linha_curta_ganha_celula_vazia(self):
        """Senão a tabela sai com buraco na borda direita."""
        from content.export_pdf import build_html

        html = build_html(self.nota({
            "id": "s1",
            "type": "table",
            "rows": [["a", "b", "c"], ["só uma"]],
        }))
        self.assertEqual(html.count("<td>"), 3)

    def test_celula_com_html_e_escapada(self):
        from content.export_pdf import build_html

        html = build_html(self.nota({
            "id": "s1",
            "type": "table",
            "rows": [["<script>x</script>"], ["ok"]],
        }))
        self.assertNotIn("<script>", html)

    def test_pdf_com_as_tres_secoes_e_gerado(self):
        pdf = render_pdf(self.nota(
            {"id": "s1", "type": "text", "html": "<p>Resumo</p>"},
            {"id": "s2", "type": "checklist", "items": [{"id": "i1", "text": "Revisar"}]},
            {"id": "s3", "type": "table", "rows": [["Termo", "Definição"], ["BFS", "largura"]]},
        ))
        self.assertTrue(pdf.startswith(b"%PDF"))


class MidiaConfinadaTests(TestCase):
    """O `link_callback` do xhtml2pdf abre o caminho que devolvermos.

    Quem escreve o `html` de uma nota escolhe o `src` da imagem — e o
    `html` também chega de um backup importado de fora. Antes desta
    trava, `_resolver_midia` devolvia:

    - o caminho montado sem resolver `..`, então `/media/../../foto.png`
      saía do `MEDIA_ROOT` e o arquivo ia embutido no PDF;
    - a URI COMO VEIO quando não era `/media/`, então um caminho absoluto
      era lido direto e um `http://` virava requisição feita pelo
      servidor (SSRF cego no momento de exportar).
    """

    def setUp(self):
        self.raiz = Path(settings.MEDIA_ROOT).resolve()
        self.raiz.mkdir(parents=True, exist_ok=True)
        self.fora = self.raiz.parent / "alvo-fora-da-midia.png"
        Image.new("RGB", (4, 4), (200, 0, 0)).save(self.fora)
        self.dentro = self.raiz / "alvo-dentro.png"
        Image.new("RGB", (4, 4), (0, 150, 0)).save(self.dentro)

    def tearDown(self):
        for arquivo in (self.fora, self.dentro):
            arquivo.unlink(missing_ok=True)

    def test_travessia_com_ponto_ponto_e_recusada(self):
        self.assertIsNone(_resolver_midia("/media/../alvo-fora-da-midia.png"))

    def test_travessia_codificada_e_recusada(self):
        # `unquote` decodifica antes de montar o caminho: sem resolver e
        # comparar, `%2e%2e` escapava igual ao `..` literal.
        self.assertIsNone(_resolver_midia("/media/%2e%2e/alvo-fora-da-midia.png"))
        self.assertIsNone(_resolver_midia("/media/..%2f..%2falvo-fora-da-midia.png"))

    def test_caminho_absoluto_e_recusado(self):
        """Nem precisava de `..`: o que não era /media/ voltava como veio."""
        self.assertIsNone(_resolver_midia(str(self.fora)))

    def test_url_externa_nao_vira_requisicao_do_servidor(self):
        for uri in (
            "http://169.254.169.254/latest/meta-data",
            "http://10.0.0.1:8080/x.png",
            "https://exemplo.com/figura.png",
        ):
            self.assertIsNone(_resolver_midia(uri), uri)

    def test_imagem_de_verdade_continua_passando(self):
        resolvido = _resolver_midia("/media/alvo-dentro.png")
        self.assertIsNotNone(resolvido)
        self.assertTrue(Path(resolvido).is_relative_to(self.raiz))

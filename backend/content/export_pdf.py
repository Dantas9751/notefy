"""Renderização de uma nota em PDF.

Monta um HTML próprio e o converte com xhtml2pdf (pisa), que é Python
puro — sem GTK nem navegador headless para instalar, o que importa num
projeto que precisa rodar em Windows sem cerimônia.

O código é colorido com Pygments no servidor, em estilos inline: o
xhtml2pdf entende um subconjunto pequeno de CSS, e classes com folha de
estilo separada não sobreviveriam à conversão.
"""

import html as html_lib
import io
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.conf import settings
from PIL import Image as PILImage

from pygments import highlight as pygments_highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound
from xhtml2pdf import pisa

#: Apelidos do editor que o Pygments não conhece pelo mesmo nome.
LEXER_ALIASES = {
    "jsx": "javascript",
    "tsx": "typescript",
    "plaintext": "text",
    "dockerfile": "docker",
}

#: `noclasses` embute a cor em cada <span>; o xhtml2pdf ignora <style>.
_FORMATTER = HtmlFormatter(noclasses=True, nowrap=True, style="friendly")

PAGE_CSS = """
@page { size: A4; margin: 2cm 1.8cm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt;
       line-height: 1.5; color: #2a2724; }
h1.doc-title { font-size: 20pt; margin: 0 0 2pt 0; color: #1a1816; }
.doc-meta { font-size: 8pt; color: #7c766e; margin: 0 0 16pt 0;
            border-bottom: 0.6pt solid #d7d2cc; padding-bottom: 6pt; }
h1 { font-size: 15pt; margin: 14pt 0 5pt 0; color: #1a1816; }
h2 { font-size: 13pt; margin: 12pt 0 4pt 0; color: #1a1816; }
h3 { font-size: 11.5pt; margin: 10pt 0 4pt 0; color: #1a1816; }
p { margin: 0 0 7pt 0; }
ul, ol { margin: 0 0 7pt 16pt; }
li { margin-bottom: 2pt; }
blockquote { margin: 0 0 8pt 0; padding-left: 8pt;
             border-left: 2pt solid #d7d2cc; color: #5c574f; font-style: italic; }
a { color: #4338ca; }
.code-block { margin: 0 0 10pt 0; }
.code-head { font-family: Courier, monospace; font-size: 7.5pt; color: #5c574f;
             background-color: #eeece9; padding: 3pt 6pt;
             border: 0.6pt solid #d7d2cc; }
.code-body { font-family: Courier, monospace; font-size: 8.5pt; line-height: 1.35;
             background-color: #f7f6f4; padding: 6pt;
             border: 0.6pt solid #d7d2cc; border-top: none; }
.section-gap { margin-bottom: 4pt; }
table.nota { border-collapse: collapse; width: 100%; margin: 0 0 10pt 0;
             font-size: 9.5pt; }
table.nota td, table.nota th { border: 0.6pt solid #d7d2cc; padding: 4pt 6pt;
                               text-align: left; vertical-align: top; }
table.nota th { background-color: #eeece9; font-weight: bold; color: #1a1816; }
ul.tarefas { list-style-type: none; margin: 0 0 8pt 0; padding: 0; }
ul.tarefas li { margin-bottom: 3pt; }
.feito { color: #7c766e; }
"""

#: Tags que o xhtml2pdf não desenha e que só sujariam a saída.
_STRIP_TAGS_RE = re.compile(r"</?(?:section|article|figure|figcaption)[^>]*>", re.I)


def _highlight(code, language):
    """Código em HTML com cores embutidas."""
    name = LEXER_ALIASES.get(language, language or "text")
    try:
        lexer = get_lexer_by_name(name, stripnl=False)
    except ClassNotFound:
        return html_lib.escape(code)
    return pygments_highlight(code, lexer, _FORMATTER)


def _render_code_section(section):
    code = section.get("code", "")
    language = section.get("language", "plaintext")
    title = section.get("title") or language

    return (
        f'<div class="code-block">'
        f'<div class="code-head">{html_lib.escape(title)}</div>'
        f'<pre class="code-body">{_highlight(code, language)}</pre>'
        f"</div>"
    )


def _render_text_section(section):
    body = _STRIP_TAGS_RE.sub("", section.get("html", "") or "")
    return f'<div class="section-gap">{body}</div>' if body.strip() else ""


def _render_checklist_section(section):
    """Caixinhas de verdade viram [x]/[ ] no papel.

    Um `<input type="checkbox">` não sobrevive ao xhtml2pdf (sai vazio, ou
    nem sai). O par de colchetes é a convenção do Markdown e é legível
    impresso, que é o ponto de exportar.
    """
    itens = [i for i in section.get("items") or [] if isinstance(i, dict)]
    if not itens:
        return ""
    linhas = "".join(
        '<li class="{classe}">{marca} {texto}</li>'.format(
            classe="feito" if item.get("done") else "",
            marca="[x]" if item.get("done") else "[&nbsp;]",
            texto=html_lib.escape(str(item.get("text", ""))),
        )
        for item in itens
    )
    return f'<ul class="tarefas">{linhas}</ul>'


def _render_table_section(section):
    """Primeira linha é cabeçalho — a mesma regra do editor."""
    linhas = [r for r in section.get("rows") or [] if isinstance(r, list)]
    if not linhas:
        return ""
    # A largura é a da linha mais larga: uma linha curta ganha células
    # vazias em vez de deixar a tabela com buraco na borda direita.
    largura = max(len(r) for r in linhas)

    def celulas(linha, tag):
        preenchida = list(linha) + [""] * (largura - len(linha))
        return "".join(
            f"<{tag}>{html_lib.escape(str(c))}</{tag}>" for c in preenchida
        )

    corpo = "".join(f"<tr>{celulas(l, 'td')}</tr>" for l in linhas[1:])
    return (
        '<table class="nota">'
        f"<tr>{celulas(linhas[0], 'th')}</tr>"
        f"{corpo}"
        "</table>"
    )


#: Como cada tipo de seção vira HTML. O `build_html` consulta o mapa em
#: vez de encadear `if`s: um tipo novo entra aqui e em lugar nenhum.
_RENDERIZADORES = {
    "code": _render_code_section,
    "checklist": _render_checklist_section,
    "table": _render_table_section,
}


def build_html(document):
    """HTML completo da nota, pronto para a conversão."""
    sections = (document.data or {}).get("sections")

    if sections:
        body = "".join(
            _RENDERIZADORES.get(section.get("type"), _render_text_section)(section)
            for section in sections
            if isinstance(section, dict)
        )
    else:
        # Nota anterior à divisão em seções.
        body = _STRIP_TAGS_RE.sub("", document.content or "")

    trail = " › ".join(
        [document.folder.category.name] if document.folder.category_id else []
    )
    if document.folder_id:
        trail = f"{trail} › {document.folder.name}" if trail else document.folder.name

    meta = html_lib.escape(trail)
    if document.updated_at:
        meta += f" — atualizada em {document.updated_at.strftime('%d/%m/%Y %H:%M')}"

    return (
        "<!DOCTYPE html><html><head>"
        '<meta charset="utf-8" />'
        f"<style>{PAGE_CSS}</style>"
        "</head><body>"
        f'<h1 class="doc-title">{html_lib.escape(document.title)}</h1>'
        f'<p class="doc-meta">{meta}</p>'
        f"{body}"
        "</body></html>"
    )


def _resolver_midia(uri, rel=None):
    """`<img src>` da nota -> caminho no disco.

    Sem isto o xhtml2pdf busca a imagem por HTTP — contra o MESMO servidor
    que está atendendo o pedido do PDF. O servidor de desenvolvimento é
    de uma requisição por vez, então ele espera por si mesmo e a imagem
    volta truncada: `OSError: broken data stream when reading image file`,
    e a exportação inteira morre com 500.

    O arquivo está no disco desta máquina. Ler dali não faz requisição
    nenhuma, funciona com o servidor ocupado e continua valendo no
    aplicativo empacotado, onde não há porta para chamar.

    SÓ arquivos de dentro do `MEDIA_ROOT`. Qualquer outra coisa devolve
    `None`, e o xhtml2pdf deixa um espaço em branco no lugar da imagem.

    Isso fecha duas falhas que a versão anterior tinha, as duas
    alcançáveis por quem conseguisse escrever o `html` de uma nota —
    inclusive por um backup importado de fora:

    1. **Leitura de arquivo arbitrário.** `urlparse` não resolve `..` e o
       `unquote` ainda decodificava `%2e%2e`, então
       `<img src="/media/../../../foto.png">` saía do `MEDIA_ROOT` e o
       xhtml2pdf embutia o arquivo no PDF devolvido. Testado: escapava.
    2. **Requisição cega a partir do servidor (SSRF).** O que não era
       `/media/` voltava COMO VEIO, então `<img src="http://10.0.0.1/x">`
       ou o IP de metadados da nuvem viravam um GET feito pelo backend na
       hora de exportar.

    O preço é imagem externa (`https://...`) não aparecer mais no PDF.
    É o lado certo da troca: no app as imagens são enviadas e ficam na
    mídia; buscar URL arbitrária a partir do servidor não era recurso que
    alguém tivesse pedido.
    """
    if not uri or not settings.MEDIA_URL:
        return None

    caminho = urlparse(uri).path
    if not caminho.startswith(settings.MEDIA_URL):
        return None

    relativo = unquote(caminho[len(settings.MEDIA_URL):]).lstrip("/\\")
    raiz = Path(settings.MEDIA_ROOT).resolve()
    try:
        local = (raiz / relativo).resolve()
    except (OSError, ValueError):
        return None

    # `is_relative_to` depois do `resolve()` é o que amarra: `..`,
    # `%2e%2e`, caminho absoluto e link simbólico já viraram um caminho
    # real antes da comparação.
    if not local.is_relative_to(raiz) or not local.is_file():
        return None

    # Uma imagem ilegível (upload truncado, arquivo corrompido no disco)
    # levava o xhtml2pdf a estourar `OSError` e a exportação INTEIRA
    # morria com 500 — a nota de vinte páginas não saía por causa de um
    # PNG. Conferir aqui é barato e transforma o caso em "essa imagem não
    # aparece", que é o que o usuário consegue entender e resolver.
    try:
        with PILImage.open(local) as imagem:
            imagem.verify()
    except Exception:  # noqa: BLE001 — qualquer defeito do arquivo serve
        return None

    return str(local)


def render_pdf(document):
    """Bytes do PDF. Levanta RuntimeError se a conversão falhar."""
    buffer = io.BytesIO()
    result = pisa.CreatePDF(
        src=build_html(document),
        dest=buffer,
        encoding="utf-8",
        link_callback=_resolver_midia,
    )
    if result.err:
        raise RuntimeError("Não foi possível gerar o PDF desta nota.")
    return buffer.getvalue()


def pdf_filename(document):
    """Nome de arquivo seguro a partir do título."""
    safe = re.sub(r"[^\w\s.-]", "", document.title, flags=re.UNICODE).strip()
    safe = re.sub(r"\s+", "-", safe) or "nota"
    return f"{safe[:80]}.pdf"

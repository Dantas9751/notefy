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


def build_html(document):
    """HTML completo da nota, pronto para a conversão."""
    sections = (document.data or {}).get("sections")

    if sections:
        body = "".join(
            _render_code_section(section)
            if section.get("type") == "code"
            else _render_text_section(section)
            for section in sections
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


def render_pdf(document):
    """Bytes do PDF. Levanta RuntimeError se a conversão falhar."""
    buffer = io.BytesIO()
    result = pisa.CreatePDF(
        src=build_html(document),
        dest=buffer,
        encoding="utf-8",
    )
    if result.err:
        raise RuntimeError("Não foi possível gerar o PDF desta nota.")
    return buffer.getvalue()


def pdf_filename(document):
    """Nome de arquivo seguro a partir do título."""
    safe = re.sub(r"[^\w\s.-]", "", document.title, flags=re.UNICODE).strip()
    safe = re.sub(r"\s+", "-", safe) or "nota"
    return f"{safe[:80]}.pdf"

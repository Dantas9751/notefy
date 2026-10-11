"""Conversão de arquivos importados, só com o que o app já carrega.

Pillow converte imagens entre si e para PDF; o xhtml2pdf da exportação de
notas põe texto, Markdown e HTML em PDF. Office (docx, pptx, xlsx) fica
de fora: converter com fidelidade pede LibreOffice, centenas de MB a mais
no instalador.
"""

import io
import os
import re
import textwrap
from html import escape

from PIL import Image, ImageOps

from core.idioma import texto

from .export_pdf import PAGE_CSS, html_para_pdf, manter_recuo_do_pre

#: Extensão -> formato do Pillow. Sinônimos (jpeg, tif) entram, não saem.
FORMATOS_DE_IMAGEM = {
    "png": "PNG", "jpg": "JPEG", "jpeg": "JPEG", "webp": "WEBP",
    "gif": "GIF", "bmp": "BMP", "tif": "TIFF", "tiff": "TIFF",
}
SAIDAS_DE_IMAGEM = ("pdf", "png", "jpg", "webp", "gif", "bmp", "tiff")
TEXTOS = ("txt", "md", "html", "htm")
#: Formatos sem canal de transparência: o fundo transparente vira branco.
SEM_TRANSPARENCIA = {"JPEG", "BMP", "PDF"}
#: Transparência de liga e desliga: o pixel some inteiro ou aparece inteiro.
TRANSPARENCIA_BINARIA = {"GIF"}

_FORMATO_DE_SAIDA = {**FORMATOS_DE_IMAGEM, "pdf": "PDF"}

#: Uma foto de celular de 48 MP passa. O Pillow sozinho só recusa perto de
#: 180 milhões, e um PNG de uma cor com isso cabe em poucos KB de upload:
#: decodificado, seriam gigabytes de memória do servidor.
LIMITE_DE_PIXELS = 50_000_000
#: Mais de mil páginas. O xhtml2pdf é lento, e um texto de dezenas de MB
#: prenderia uma thread do servidor por minutos.
LIMITE_DE_TEXTO = 2 * 1024 * 1024


class NaoConverte(Exception):
    """O arquivo não pôde ser convertido; a mensagem é para o usuário."""


def _grande_demais():
    return NaoConverte(texto(
        "Este arquivo é grande demais para converter.",
        "This file is too large to convert.",
    ))


def extensao(nome):
    return os.path.splitext(nome or "")[1].lstrip(".").lower()


def destinos(nome):
    """Formatos para os quais o arquivo `nome` pode ser convertido."""
    origem = extensao(nome)
    if origem in FORMATOS_DE_IMAGEM:
        return [d for d in SAIDAS_DE_IMAGEM if _FORMATO_DE_SAIDA[d] != FORMATOS_DE_IMAGEM[origem]]
    return ["pdf"] if origem in TEXTOS else []


def nome_convertido(titulo, destino):
    """'foto.png' -> 'foto.jpg'; um título sem extensão conhecida só ganha a nova."""
    base, ext = os.path.splitext(titulo)
    conhecida = ext.lstrip(".").lower() in (*FORMATOS_DE_IMAGEM, *TEXTOS)
    return f"{base if conhecida else titulo}.{destino}"


def converter(dados, nome, destino):
    """Bytes do arquivo `nome` no formato `destino`. Levanta `NaoConverte`."""
    if destino not in destinos(nome):
        raise NaoConverte(texto(
            "Este arquivo não pode ser convertido para esse formato.",
            "This file can't be converted to that format.",
        ))
    eh_texto = extensao(nome) in TEXTOS
    if eh_texto and len(dados) > LIMITE_DE_TEXTO:
        raise _grande_demais()
    try:
        if eh_texto:
            return html_para_pdf(_texto_como_html(dados, extensao(nome)))
        return _converter_imagem(dados, _FORMATO_DE_SAIDA[destino])
    except NaoConverte:
        raise
    except Image.DecompressionBombError as erro:
        raise _grande_demais() from erro
    except Exception as erro:  # noqa: BLE001 — Pillow e xhtml2pdf falham de muitos jeitos
        raise NaoConverte(texto(
            "Não foi possível ler este arquivo para converter. Ele pode estar corrompido.",
            "Couldn't read this file to convert it. It may be corrupted.",
        )) from erro


def _converter_imagem(dados, formato):
    # `exif_transpose` devolve uma cópia já girada como a câmera indicou
    # (sem isso a foto do celular sai deitada) e só com o primeiro quadro
    # de um GIF animado.
    with Image.open(io.BytesIO(dados)) as original:
        # O tamanho vem do cabeçalho: dá para recusar antes de decodificar.
        if original.width * original.height > LIMITE_DE_PIXELS:
            raise _grande_demais()
        imagem = _no_modo_de(ImageOps.exif_transpose(original), formato)
    saida = io.BytesIO()
    imagem.save(saida, formato)
    return saida.getvalue()


def _no_modo_de(imagem, formato):
    """RGB ou RGBA, que todo formato grava; sem transparência, fundo branco."""
    if not imagem.has_transparency_data:
        return imagem.convert("RGB")
    rgba = imagem.convert("RGBA")
    if formato not in SEM_TRANSPARENCIA | TRANSPARENCIA_BINARIA:
        return rgba
    fundo = Image.new("RGB", rgba.size, "white")
    fundo.paste(rgba, mask=rgba.getchannel("A"))
    if formato in SEM_TRANSPARENCIA:
        return fundo
    # O GIF ignorava o alfa parcial: a sombra a 20% e a borda suavizada
    # saíam com a cor crua a 100%, mais escuras que o original. O
    # meio-transparente vai sobre o branco (como fica numa página) e o quase
    # invisível some.
    fundo.putalpha(rgba.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
    return fundo


def _texto_como_html(dados, origem):
    try:
        conteudo = dados.decode("utf-8-sig")
    except UnicodeDecodeError:
        conteudo = dados.decode("cp1252", errors="replace")
    if origem in ("html", "htm"):
        return _com_estilo_base(_PRE_RE.sub(lambda m: m[1] + manter_recuo_do_pre(m[2]) + m[3], conteudo))
    # Markdown sai como o texto que é, sem renderizar: renderizar pediria
    # outra biblioteca só para isso.
    #
    # `pre` puro, com as linhas já quebradas aqui: o xhtml2pdf trata
    # `white-space: pre-wrap` como texto corrido e junta o arquivo inteiro num
    # parágrafo só (sem quebra de linha e sem recuo), e com `pre` a linha
    # longa passa da margem e é cortada fora da página.
    return (
        f'<html><head><meta charset="utf-8" /><style>{PAGE_CSS}</style></head><body>'
        '<pre style="font-family: Courier; font-size: 9.5pt">'
        f"{manter_recuo_do_pre(escape(_quebrar_em_colunas(conteudo)))}</pre></body></html>"
    )


#: O mínimo para um HTML qualquer sair legível: sem isso o xhtml2pdf usa
#: letra de 7 pt e a tabela sem espaço nenhum, com o texto em cima da borda.
_CSS_DO_HTML = PAGE_CSS + """
table { border-collapse: collapse; margin: 0 0 10pt 0; }
td, th { padding: 4pt 6pt; vertical-align: top; }
pre, code { font-family: Courier, monospace; font-size: 9pt; }
"""

_PRE_RE = re.compile(r"(<pre\b[^>]*>)(.*?)(</pre>)", re.I | re.S)
#: Onde o estilo base entra: logo no começo do `head`, ou depois do doctype.
_INICIO_DO_HTML = re.compile(r"<head\b[^>]*>|^\s*<!doctype[^>]*>", re.I)


def _com_estilo_base(html):
    """O estilo base antes de tudo, para o do próprio arquivo continuar mandando."""
    estilo = f"<style>{_CSS_DO_HTML}</style>"
    achado = _INICIO_DO_HTML.search(html)
    fim = achado.end() if achado else 0
    return html[:fim] + estilo + html[fim:]


#: Courier 9,5 pt tem 5,7 pt por caractere; a área útil da A4 (595 pt menos as
#: margens de 1,8 cm) dá 86 colunas. Duas de folga para não depender do arredondamento.
COLUNAS_DO_PDF = 84


def _quebrar_em_colunas(conteudo, colunas=COLUNAS_DO_PDF):
    """Quebra cada linha em `colunas`, mantendo o recuo na continuação."""
    saida = []
    for linha in conteudo.expandtabs(4).splitlines():
        recuo = linha[: len(linha) - len(linha.lstrip(" "))]
        saida.extend(
            textwrap.wrap(
                linha, colunas, subsequent_indent=recuo, break_long_words=True, break_on_hyphens=False
            )
            or [""]
        )
    return "\n".join(saida)

"""Conversão de arquivos importados, só com o que o app já carrega.

Pillow converte imagens entre si e para PDF; o xhtml2pdf da exportação de
notas põe texto, Markdown e HTML em PDF. Office (docx, pptx, xlsx) fica
de fora: converter com fidelidade pede LibreOffice, centenas de MB a mais
no instalador.
"""

import io
import os
from html import escape

from PIL import Image, ImageOps

from core.idioma import texto

from .export_pdf import PAGE_CSS, html_para_pdf

#: Extensão -> formato do Pillow. Sinônimos (jpeg, tif) entram, não saem.
FORMATOS_DE_IMAGEM = {
    "png": "PNG", "jpg": "JPEG", "jpeg": "JPEG", "webp": "WEBP",
    "gif": "GIF", "bmp": "BMP", "tif": "TIFF", "tiff": "TIFF",
}
SAIDAS_DE_IMAGEM = ("pdf", "png", "jpg", "webp", "gif", "bmp", "tiff")
TEXTOS = ("txt", "md", "html", "htm")
#: Formatos sem canal de transparência: o fundo transparente vira branco.
SEM_TRANSPARENCIA = {"JPEG", "BMP", "PDF"}

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
    if formato not in SEM_TRANSPARENCIA:
        return rgba
    fundo = Image.new("RGB", rgba.size, "white")
    fundo.paste(rgba, mask=rgba.getchannel("A"))
    return fundo


def _texto_como_html(dados, origem):
    try:
        conteudo = dados.decode("utf-8-sig")
    except UnicodeDecodeError:
        conteudo = dados.decode("cp1252", errors="replace")
    if origem in ("html", "htm"):
        return conteudo
    # Markdown sai como o texto que é, sem renderizar: renderizar pediria
    # outra biblioteca só para isso. `pre-wrap` mantém o recuo e quebra a
    # linha longa na margem, em vez de cortá-la fora da página.
    return (
        f'<html><head><meta charset="utf-8" /><style>{PAGE_CSS}</style></head><body>'
        '<pre style="white-space: pre-wrap; font-family: Courier; font-size: 9.5pt">'
        f"{escape(conteudo.expandtabs(4))}</pre></body></html>"
    )

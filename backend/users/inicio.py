"""Formato da preferência `home_layout`: como a pessoa montou o Início.

Um JSON só, e não uma coluna por escolha: o Início ganha e perde blocos com
o tempo, e cada mudança virar migração seria caro para uma preferência
visual. Em troca, o formato é conferido aqui, chave por chave, e o que não
é conhecido cai fora. Serve ao serializer e à importação de backup, que é
a única entrada do app onde o dado não passou por serializer nenhum.
"""

import math
import re

from django.core.exceptions import ValidationError

from core.idioma import texto

LARGURAS = ("inteira", "metade")
LAYOUTS_DE_ITENS = ("cartoes", "pilha", "lista")
ABAS_DE_NOTAS = ("recentes", "favoritos")
ABAS_DE_ARQUIVOS = ("imagens", "documentos", "todos")
MAX_BLOCOS = 20
#: Teto do rascunho do Início: é um post-it, não um documento.
MAX_RASCUNHO = 20000

_SLUG = re.compile(r"^[a-z0-9-]{1,32}$")
#: A capa de imagem é um arquivo da própria conta, servido em `/media/`.
#: Sem aspas, parênteses nem espaço: o valor vira `url(...)` no CSS.
_URL_DE_MIDIA = re.compile(r"^(https?://[^\s\"'()<>]{1,200})?/media/[^\s\"'()<>]{1,300}$")


def _erro():
    return ValidationError(texto("Layout do Início inválido.", "Invalid Home layout."))


def _numero(valor, minimo, maximo):
    """Número do recorte da capa, preso à faixa; o que não é número é recusado."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not math.isfinite(valor):
        raise _erro()
    return round(min(maximo, max(minimo, float(valor))), 2)


def limpar_inicio(valor):
    """Devolve o layout só com o que o app conhece, ou recusa."""
    if valor in (None, ""):
        return {}
    if not isinstance(valor, dict):
        raise _erro()

    limpo = {}

    capa = valor.get("capa")
    if isinstance(capa, dict):
        tipo = capa.get("tipo")
        if tipo == "nenhuma":
            limpo["capa"] = {"tipo": "nenhuma"}
        elif tipo == "gradiente" and isinstance(capa.get("id"), str) and _SLUG.match(capa["id"]):
            limpo["capa"] = {"tipo": "gradiente", "id": capa["id"]}
        elif tipo == "imagem" and isinstance(capa.get("url"), str) and _URL_DE_MIDIA.match(capa["url"]):
            limpo["capa"] = {"tipo": "imagem", "url": capa["url"]}
            # Recorte (`FotoDaCapa`): o ponto da foto que a faixa segue, em %, e o zoom.
            for chave, minimo, maximo in (("x", 0, 100), ("y", 0, 100), ("zoom", 1, 3)):
                if chave in capa:
                    limpo["capa"][chave] = _numero(capa[chave], minimo, maximo)
        else:
            raise _erro()

    blocos = valor.get("blocos")
    if blocos is not None:
        if not isinstance(blocos, list) or len(blocos) > MAX_BLOCOS:
            raise _erro()
        vistos = set()
        limpo["blocos"] = []
        for bloco in blocos:
            if not isinstance(bloco, dict):
                raise _erro()
            ident = bloco.get("id")
            if not isinstance(ident, str) or not _SLUG.match(ident) or ident in vistos:
                raise _erro()
            vistos.add(ident)
            largura = bloco.get("largura", "inteira")
            if largura not in LARGURAS:
                raise _erro()
            limpo["blocos"].append(
                {"id": ident, "visivel": bool(bloco.get("visivel", True)), "largura": largura}
            )

    for chave, opcoes in (
        ("itens", LAYOUTS_DE_ITENS),
        ("aba_notas", ABAS_DE_NOTAS),
        ("aba_arquivos", ABAS_DE_ARQUIVOS),
    ):
        if chave in valor:
            if valor[chave] not in opcoes:
                raise _erro()
            limpo[chave] = valor[chave]

    return limpo

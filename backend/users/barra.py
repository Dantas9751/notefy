"""Formato da preferência `sidebar_layout`: como a pessoa arrumou a barra lateral.

`{"ordem": [ids], "ocultos": [ids]}`. Os ids são do app (`recentes`,
`quadro`, `favoritos`...), e quem sabe quais existem é ele: aqui só se
confere a forma. Um atalho novo que o app ganhar depois aparece para quem
já arrumou a barra, porque o que não está em `ocultos` está à mostra.
"""

import re

from django.core.exceptions import ValidationError

from core.idioma import texto

MAX_ITENS = 24
_ID = re.compile(r"^[a-z][a-z0-9-]{0,23}$")


def _erro():
    return ValidationError(texto("Arrumação da barra lateral inválida.", "Invalid sidebar layout."))


def _lista(valor):
    if not isinstance(valor, list) or len(valor) > MAX_ITENS:
        raise _erro()
    vistos = []
    for ident in valor:
        if not isinstance(ident, str) or not _ID.match(ident):
            raise _erro()
        if ident not in vistos:
            vistos.append(ident)
    return vistos


def limpar_barra(valor):
    """Devolve a arrumação só com `ordem` e `ocultos`, ou recusa."""
    if valor in (None, ""):
        return {}
    if not isinstance(valor, dict):
        raise _erro()
    return {chave: _lista(valor[chave]) for chave in ("ordem", "ocultos") if chave in valor}

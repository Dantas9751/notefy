"""Conversão da resposta do modelo em `data` válido de documento.

Modelos erram de formas previsíveis: cercam o JSON com ```json, esquecem
ids, mandam `label` em vez de `text`, inventam coordenadas coladas umas
nas outras. Em vez de recusar tudo isso, normalizamos o que dá — e o que
não dá vira ErroFormato, que a view devolve como 502 explicando.
"""

import json
import re

from content.schemas import empty_data_for, validate_data
from django.core.exceptions import ValidationError

#: ```json ... ``` em volta da resposta.
_CERCA = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)

#: Grade de fallback quando o modelo não dá coordenadas usáveis.
COLUNA = 240
LINHA = 140
POR_LINHA = 4


class ErroFormato(Exception):
    """O modelo não devolveu algo aproveitável."""


def _bruto_para_json(texto):
    limpo = _CERCA.sub("", (texto or "").strip())
    try:
        return json.loads(limpo)
    except ValueError:
        pass
    # Última tentativa: pegar do primeiro `{` ao último `}` — modelos
    # gostam de prefaciar o JSON com uma frase.
    inicio, fim = limpo.find("{"), limpo.rfind("}")
    if inicio == -1 or fim <= inicio:
        raise ErroFormato("A IA não devolveu JSON.")
    try:
        return json.loads(limpo[inicio : fim + 1])
    except ValueError as erro:
        raise ErroFormato("A IA devolveu JSON inválido.") from erro


def _texto_do(item, *chaves):
    for chave in chaves:
        valor = item.get(chave)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    return ""


def _numero(valor, padrao):
    return valor if isinstance(valor, (int, float)) and not isinstance(valor, bool) else padrao


def _normalizar_grafo(dados, kind):
    nodes, ids = [], set()
    for indice, bruto in enumerate(dados.get("nodes") or []):
        if not isinstance(bruto, dict):
            continue
        # id ausente ou repetido: geramos um estável pela posição.
        nid = str(bruto.get("id") or "").strip() or f"n{indice + 1}"
        while nid in ids:
            nid = f"{nid}_"
        ids.add(nid)
        no = {
            "id": nid,
            "type": bruto.get("type"),
            # Sem coordenada útil, empilha numa grade legível em vez de
            # jogar tudo em (0, 0).
            "x": _numero(bruto.get("x"), (indice % POR_LINHA) * COLUNA),
            "y": _numero(bruto.get("y"), (indice // POR_LINHA) * LINHA),
            "w": _numero(bruto.get("w"), 170),
            "h": _numero(bruto.get("h"), 70),
            "text": _texto_do(bruto, "text", "label", "title", "name"),
        }
        nodes.append(no)

    edges = []
    for indice, bruto in enumerate(dados.get("edges") or []):
        if not isinstance(bruto, dict):
            continue
        origem = str(bruto.get("from") or bruto.get("source") or "")
        destino = str(bruto.get("to") or bruto.get("target") or "")
        # Aresta órfã quebra o editor: descartar é melhor que recusar o
        # diagrama inteiro por causa de uma linha.
        if origem not in ids or destino not in ids:
            continue
        edges.append({
            "id": str(bruto.get("id") or "").strip() or f"e{indice + 1}",
            "type": bruto.get("type"),
            "from": origem,
            "to": destino,
            "label": _texto_do(bruto, "label", "text"),
        })

    if not nodes:
        raise ErroFormato("A IA não gerou nenhum elemento.")

    data = {**empty_data_for(kind), "nodes": nodes, "edges": edges}
    return data


def _normalizar_planilha(dados):
    colunas = []
    for indice, bruto in enumerate(dados.get("columns") or []):
        if not isinstance(bruto, dict):
            continue
        colunas.append({
            "id": str(bruto.get("id") or "").strip() or f"c{indice + 1}",
            "name": _texto_do(bruto, "name", "title", "label") or f"Coluna {indice + 1}",
            "type": bruto.get("type") if bruto.get("type") in
            ("text", "number", "date", "checkbox", "select") else "text",
        })
    if not colunas:
        raise ErroFormato("A IA não gerou colunas.")

    validos = {c["id"] for c in colunas}
    linhas = []
    for indice, bruto in enumerate(dados.get("rows") or []):
        if not isinstance(bruto, dict):
            continue
        celulas = bruto.get("cells")
        if not isinstance(celulas, dict):
            continue
        linhas.append({
            "id": str(bruto.get("id") or "").strip() or f"r{indice + 1}",
            # Célula de coluna inexistente some: o editor indexa por id.
            "cells": {k: v for k, v in celulas.items() if k in validos},
        })

    return {**empty_data_for("spreadsheet"), "columns": colunas, "rows": linhas}


def _normalizar_nota(dados):
    secoes = []
    for indice, bruto in enumerate(dados.get("sections") or []):
        if not isinstance(bruto, dict):
            continue
        tipo = bruto.get("type") if bruto.get("type") in ("text", "code") else "text"
        secao = {"id": str(bruto.get("id") or "").strip() or f"s{indice + 1}", "type": tipo}
        if tipo == "code":
            secao["code"] = str(bruto.get("code") or "")
            secao["language"] = bruto.get("language") or "plaintext"
            secao["title"] = _texto_do(bruto, "title")
        else:
            secao["html"] = str(bruto.get("html") or bruto.get("text") or "")
        secoes.append(secao)

    if not secoes:
        raise ErroFormato("A IA não gerou conteúdo.")
    return {"sections": secoes}


def montar(kind, bruto):
    """Texto do modelo -> `data` válido para `kind`. Levanta ErroFormato."""
    dados = _bruto_para_json(bruto)
    if not isinstance(dados, dict):
        raise ErroFormato("A IA devolveu um formato inesperado.")

    if kind in ("diagram", "canvas"):
        data = _normalizar_grafo(dados, kind)
    elif kind == "spreadsheet":
        data = _normalizar_planilha(dados)
    elif kind == "note":
        data = _normalizar_nota(dados)
    else:
        raise ErroFormato(f"Tipo não suportado: {kind}.")

    # O schema é a última palavra: tipo inventado pelo modelo para aqui,
    # e não no banco.
    try:
        validate_data(kind, data)
    except ValidationError as erro:
        raise ErroFormato(f"A IA gerou conteúdo inválido: {erro.messages[0]}") from erro
    return data


#: Fica de fora do que o modelo vê, e volta igual: os traços de caneta são
#: milhares de pontos que ele não edita, e o enquadramento é da tela.
_SO_DO_APP = ("strokes", "viewport")


def para_editar(data):
    """O `data` que vai para o modelo na tarefa `editar`."""
    return {k: v for k, v in (data or {}).items() if k not in _SO_DO_APP}


_PESOS_DE_FONTE = {
    "thin": 100, "extralight": 200, "light": 300, "regular": 400, "normal": 400,
    "medium": 500, "semibold": 600, "bold": 700, "extrabold": 800, "black": 900,
}
_NUMERICOS_DO_DESIGN = ("x", "y", "w", "h", "rotation", "opacity", "strokeWidth", "radius")
_NUMERO_COM_UNIDADE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*(?:px)?\s*$")


def _numero_do_design(valor):
    """"16", "16px" -> 16; o resto volta como veio (o schema decide se serve)."""
    if isinstance(valor, str):
        achou = _NUMERO_COM_UNIDADE.match(valor)
        if achou:
            n = float(achou.group(1))
            return int(n) if n.is_integer() else n
    return valor


def _arrumar_camada_do_design(camada):
    """Os deslizes mais comuns do modelo num design, sem refazer o que ele quis dizer.

    O schema recusa `padding: 16` e `weight: "bold"` (o editor desmonta o
    primeiro em quatro margens e soma o segundo), e o resultado era um erro
    para quem só pediu "mais espaço". Aqui entram só as conversões sem
    ambiguidade; o resto continua passando pelo schema.
    """
    if not isinstance(camada, dict):
        return
    for campo in _NUMERICOS_DO_DESIGN:
        if campo in camada:
            camada[campo] = _numero_do_design(camada[campo])
    layout = camada.get("layout")
    if isinstance(layout, dict):
        if "gap" in layout:
            layout["gap"] = _numero_do_design(layout["gap"])
        margens = layout.get("padding")
        if isinstance(margens, str):
            margens = _numero_do_design(margens)
        if isinstance(margens, (int, float)) and not isinstance(margens, bool):
            margens = [margens]
        if isinstance(margens, list) and 1 <= len(margens) <= 4:
            margens = [_numero_do_design(m) for m in margens]
            # Como no CSS: 1 valor = os quatro; 2 = vertical e horizontal; 3 = cima, lados, baixo.
            cima = margens[0]
            lados = margens[1] if len(margens) > 1 else cima
            baixo = margens[2] if len(margens) > 2 else cima
            esquerda = margens[3] if len(margens) > 3 else lados
            layout["padding"] = [cima, lados, baixo, esquerda]
    fonte = camada.get("font")
    if isinstance(fonte, dict):
        peso = fonte.get("weight")
        if isinstance(peso, str):
            fonte["weight"] = _PESOS_DE_FONTE.get(peso.strip().lower().replace(" ", "").replace("-", ""), _numero_do_design(peso))
        for campo in ("size", "lineHeight", "letterSpacing"):
            if campo in fonte:
                fonte[campo] = _numero_do_design(fonte[campo])
    for filho in camada.get("children") or []:
        _arrumar_camada_do_design(filho)


def editado(kind, original, bruto):
    """Resposta do `editar` -> `data` válido. Levanta ErroFormato.

    Validada direto contra o schema, sem os normalizadores de `montar`:
    eles reconstroem o item só com os campos que a criação conhece.
    """
    dados = _bruto_para_json(bruto)
    if not isinstance(dados, dict):
        raise ErroFormato("A IA devolveu um formato inesperado.")
    for chave in _SO_DO_APP:
        if chave in (original or {}):
            dados[chave] = original[chave]
    if kind == "design":
        for pagina in dados.get("pages") or []:
            for camada in (pagina.get("children") or []) if isinstance(pagina, dict) else []:
                _arrumar_camada_do_design(camada)
    try:
        validate_data(kind, dados)
    except ValidationError as erro:
        raise ErroFormato(f"A IA gerou conteúdo inválido: {erro.messages[0]}") from erro
    return dados

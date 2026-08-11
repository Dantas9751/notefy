"""Formato do payload `data` de cada tipo de documento.

Planilha, diagrama e canvas guardam sua estrutura num único JSONField. Este
módulo concentra o formato esperado e a validação, para que o contrato com
o frontend fique escrito num lugar só — e não espalhado entre serializer,
view e componente React.

A validação é estrutural, não exaustiva: confere tipos e chaves
obrigatórias e ignora o resto, de modo que os editores possam evoluir
campos novos sem exigir migração nem mudança no backend.
"""

import re

from django.core.exceptions import ValidationError

# --------------------------------------------------------------------------
# Nota — dividida em seções
#
# Uma nota é uma lista de blocos: texto rico ou código. Guardar o código
# num campo próprio, e não como <pre> dentro do HTML, é o que permite
# escolher a linguagem, colorir a sintaxe e manter a indentação intacta —
# um contentEditable normaliza espaços e brigaria com o realce.
# --------------------------------------------------------------------------
SECTION_TYPES = ("text", "code")

CODE_LANGUAGES = (
    "plaintext", "python", "javascript", "typescript", "jsx", "tsx",
    "java", "c", "cpp", "csharp", "go", "rust", "php", "ruby", "kotlin", "swift",
    "sql", "bash", "powershell", "json", "yaml", "xml", "html", "css", "scss",
    "markdown", "dockerfile", "ini",
)

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

# --------------------------------------------------------------------------
# Planilha
# --------------------------------------------------------------------------
COLUMN_TYPES = (
    "text",
    "longtext",
    "number",
    "currency",
    "percent",
    "date",
    "datetime",
    "select",
    "multiselect",
    "checkbox",
    "rating",
    "url",
    "email",
    "formula",
)

#: Resumo exibido no rodapé de cada coluna.
AGGREGATE_TYPES = (
    "none", "sum", "avg", "min", "max", "count", "filled", "empty", "percent_filled",
)

# --------------------------------------------------------------------------
# Diagrama — cobre as principais famílias UML mais fluxograma e ER.
#
# Um vocabulário só, e não um por família: o usuário desenha o que precisa
# sem antes declarar "isto é um diagrama de sequência", e nada impede um
# ator conversar com um processo no mesmo quadro.
# --------------------------------------------------------------------------
DIAGRAM_NODE_TYPES = (
    # Classes e estrutura
    "class", "interface", "abstract", "enum", "package", "component", "deployment",
    # Casos de uso
    "actor", "usecase", "boundary", "control", "entity",
    # Sequência
    "lifeline", "activation", "fragment",
    # Atividade e estado
    "start", "end", "action", "decision", "merge", "fork", "join", "state",
    # Entidade-relacionamento
    "er_entity", "er_weak_entity", "er_relationship", "er_attribute", "er_key_attribute",
    # Fluxograma
    "process", "io", "database", "document", "manual", "delay", "terminator",
    # Genéricos
    "note", "rect", "rounded", "ellipse", "diamond", "cylinder", "cloud", "hexagon", "text",
)

DIAGRAM_EDGE_TYPES = (
    # Estrutura
    "association", "directed", "inheritance", "implementation",
    "composition", "aggregation", "dependency",
    # Sequência
    "message", "message_async", "message_return", "message_create", "message_destroy",
    # Atividade / fluxo
    "flow", "transition", "control_flow", "object_flow",
    # ER
    "er_one_one", "er_one_many", "er_many_many", "er_optional",
    # Genéricos
    "line", "dashed", "arrow", "double_arrow",
)

# --------------------------------------------------------------------------
# Canvas — quadro branco livre.
#
# Além de nós e conectores, guarda TRAÇOS à mão livre: é o que separa um
# canvas de um diagrama. O traço não é um nó (não conecta, não tem borda
# de encaixe), então mora numa lista própria.
# --------------------------------------------------------------------------
CANVAS_NODE_TYPES = (
    "card", "sticky", "heading", "text", "link", "document", "image", "group",
    "rect", "rounded", "ellipse", "triangle", "diamond", "star", "arrow_shape", "line_shape",
)

CANVAS_EDGE_TYPES = ("line", "arrow", "dashed", "double_arrow", "curve")

#: Ferramentas de desenho à mão livre.
STROKE_TOOLS = ("pen", "marker", "highlighter", "eraser")


def empty_data_for(kind):
    """Payload inicial de um documento recém-criado."""
    if kind == "note":
        return {"sections": [{"id": "s1", "type": "text", "html": ""}]}
    if kind == "spreadsheet":
        return {
            "columns": [
                {"id": "c1", "name": "Nome", "type": "text", "width": 220},
                {"id": "c2", "name": "Valor", "type": "number", "width": 140,
                 "aggregate": "sum"},
                {"id": "c3", "name": "Feito", "type": "checkbox", "width": 100},
            ],
            "rows": [{"id": f"r{i}", "cells": {}} for i in range(1, 4)],
            "sort": None,
            "filters": [],
            "frozen_columns": 1,
        }
    if kind == "diagram":
        return {"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}
    if kind == "canvas":
        return {
            "nodes": [],
            "edges": [],
            "strokes": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "background": "grid",
        }
    return {}


def _require(condition, message):
    if not condition:
        raise ValidationError({"data": message})


# --------------------------------------------------------------------------
# Nota
# --------------------------------------------------------------------------

def _validate_note(data):
    sections = data.get("sections")
    _require(isinstance(sections, list), "`data.sections` deve ser uma lista.")

    seen = set()
    for index, section in enumerate(sections):
        _require(isinstance(section, dict), f"Seção {index} deve ser um objeto.")
        sid = section.get("id")
        _require(bool(sid), f"Seção {index} precisa de `id`.")
        _require(sid not in seen, f"`id` de seção duplicado: {sid!r}.")
        seen.add(sid)

        kind = section.get("type")
        _require(
            kind in SECTION_TYPES,
            f"Tipo de seção inválido em {sid!r}. Use um de: {', '.join(SECTION_TYPES)}.",
        )

        if kind == "text":
            _require(
                isinstance(section.get("html", ""), str),
                f"`html` da seção {sid!r} deve ser texto.",
            )
        else:
            _require(
                isinstance(section.get("code", ""), str),
                f"`code` da seção {sid!r} deve ser texto.",
            )
            _require(
                section.get("language", "plaintext") in CODE_LANGUAGES,
                f"Linguagem desconhecida em {sid!r}: {section.get('language')!r}.",
            )


# --------------------------------------------------------------------------
# Planilha
# --------------------------------------------------------------------------

def _validate_spreadsheet(data):
    columns = data.get("columns")
    rows = data.get("rows")
    _require(isinstance(columns, list), "`data.columns` deve ser uma lista.")
    _require(isinstance(rows, list), "`data.rows` deve ser uma lista.")

    seen = set()
    for index, column in enumerate(columns):
        _require(isinstance(column, dict), f"Coluna {index} deve ser um objeto.")
        cid = column.get("id")
        _require(bool(cid), f"Coluna {index} precisa de `id`.")
        _require(cid not in seen, f"`id` de coluna duplicado: {cid!r}.")
        seen.add(cid)
        _require(
            column.get("type", "text") in COLUMN_TYPES,
            f"Tipo de coluna inválido em {cid!r}. Use um de: {', '.join(COLUMN_TYPES)}.",
        )
        _require(
            column.get("aggregate", "none") in AGGREGATE_TYPES,
            f"Resumo inválido em {cid!r}. Use um de: {', '.join(AGGREGATE_TYPES)}.",
        )

    for index, row in enumerate(rows):
        _require(isinstance(row, dict), f"Linha {index} deve ser um objeto.")
        _require(bool(row.get("id")), f"Linha {index} precisa de `id`.")
        _require(
            isinstance(row.get("cells", {}), dict),
            f"`cells` da linha {index} deve ser um objeto.",
        )

    sort = data.get("sort")
    if sort:
        _require(isinstance(sort, dict), "`data.sort` deve ser um objeto.")
        _require(sort.get("column") in seen, "`sort.column` aponta para coluna inexistente.")
        _require(
            sort.get("direction", "asc") in ("asc", "desc"),
            "`sort.direction` deve ser 'asc' ou 'desc'.",
        )

    for index, rule in enumerate(data.get("filters") or []):
        _require(isinstance(rule, dict), f"Filtro {index} deve ser um objeto.")
        _require(
            rule.get("column") in seen,
            f"Filtro {index} aponta para uma coluna inexistente.",
        )


# --------------------------------------------------------------------------
# Grafos (diagrama e canvas)
# --------------------------------------------------------------------------

def _validate_graph(data, node_types, edge_types, *, allow_strokes=False):
    nodes = data.get("nodes")
    edges = data.get("edges")
    _require(isinstance(nodes, list), "`data.nodes` deve ser uma lista.")
    _require(isinstance(edges, list), "`data.edges` deve ser uma lista.")

    ids = set()
    for index, node in enumerate(nodes):
        _require(isinstance(node, dict), f"Nó {index} deve ser um objeto.")
        nid = node.get("id")
        _require(bool(nid), f"Nó {index} precisa de `id`.")
        _require(nid not in ids, f"`id` de nó duplicado: {nid!r}.")
        ids.add(nid)
        _require(
            node.get("type") in node_types,
            f"Tipo de nó inválido em {nid!r}: {node.get('type')!r}.",
        )
        for axis in ("x", "y"):
            _require(
                isinstance(node.get(axis, 0), (int, float)),
                f"`{axis}` do nó {nid!r} deve ser numérico.",
            )

    for index, edge in enumerate(edges):
        _require(isinstance(edge, dict), f"Aresta {index} deve ser um objeto.")
        _require(
            edge.get("type") in edge_types,
            f"Tipo de aresta inválido na aresta {index}: {edge.get('type')!r}.",
        )
        # Aresta órfã quebraria a renderização no frontend: sem o nó de
        # origem ou destino não há de onde nem para onde desenhar.
        for end in ("from", "to"):
            _require(
                edge.get(end) in ids,
                f"Aresta {index} aponta para um nó inexistente em `{end}`.",
            )
        for point in edge.get("waypoints") or []:
            _require(
                isinstance(point, dict)
                and isinstance(point.get("x", 0), (int, float))
                and isinstance(point.get("y", 0), (int, float)),
                f"Ponto de rota inválido na aresta {index}.",
            )

    if not allow_strokes:
        return

    for index, stroke in enumerate(data.get("strokes") or []):
        _require(isinstance(stroke, dict), f"Traço {index} deve ser um objeto.")
        _require(bool(stroke.get("id")), f"Traço {index} precisa de `id`.")
        _require(
            stroke.get("tool", "pen") in STROKE_TOOLS,
            f"Ferramenta inválida no traço {index}: {stroke.get('tool')!r}.",
        )
        points = stroke.get("points")
        _require(
            isinstance(points, list) and len(points) >= 2,
            f"Traço {index} precisa de pelo menos dois pontos.",
        )
        # Formato compacto [x, y]: um traço à mão livre tem centenas de
        # pontos, e objetos {x,y} triplicariam o tamanho do payload.
        for point in points[:200]:
            _require(
                isinstance(point, (list, tuple))
                and len(point) >= 2
                and all(isinstance(v, (int, float)) for v in point[:2]),
                f"Traço {index} tem ponto fora do formato [x, y].",
            )


def validate_data(kind, data):
    """Valida o payload conforme o tipo. Levanta ValidationError."""
    if not isinstance(data, dict):
        raise ValidationError({"data": "`data` deve ser um objeto."})
    if kind == "note":
        # Nota antiga só tem `content`; sem `sections` não há o que validar.
        if data.get("sections") is not None:
            _validate_note(data)
    elif kind == "spreadsheet":
        _validate_spreadsheet(data)
    elif kind == "diagram":
        _validate_graph(data, DIAGRAM_NODE_TYPES, DIAGRAM_EDGE_TYPES)
    elif kind == "canvas":
        _validate_graph(data, CANVAS_NODE_TYPES, CANVAS_EDGE_TYPES, allow_strokes=True)


# --------------------------------------------------------------------------
# Extração de texto para a busca
# --------------------------------------------------------------------------

def extract_text(kind, data):
    """Texto pesquisável de dentro do payload.

    É o que permite achar uma planilha pelo conteúdo de uma célula ou um
    diagrama pelo nome de uma classe — sem isso, esses documentos só
    seriam encontráveis pelo título.
    """
    if not isinstance(data, dict):
        return ""

    parts = []
    if kind == "note":
        for section in data.get("sections") or []:
            if not isinstance(section, dict):
                continue
            if section.get("type") == "code":
                if section.get("title"):
                    parts.append(str(section["title"]))
                # O código entra na busca como está: procurar por um nome
                # de função é justamente o caso de uso.
                parts.append(str(section.get("code", "")))
            else:
                parts.append(_TAG_RE.sub(" ", str(section.get("html", ""))))
        return _WS_RE.sub(" ", " ".join(parts)).strip()

    if kind == "spreadsheet":
        for column in data.get("columns", []):
            if isinstance(column, dict) and column.get("name"):
                parts.append(str(column["name"]))
        for row in data.get("rows", []):
            if not isinstance(row, dict):
                continue
            for value in (row.get("cells") or {}).values():
                if isinstance(value, bool):
                    continue
                if isinstance(value, (str, int, float)):
                    parts.append(str(value))
                elif isinstance(value, list):  # multiselect
                    parts.extend(str(v) for v in value if isinstance(v, str))
    elif kind in ("diagram", "canvas"):
        for node in data.get("nodes", []):
            if not isinstance(node, dict):
                continue
            for key in ("text", "title", "label", "url", "stereotype"):
                if node.get(key):
                    parts.append(str(node[key]))
            for key in ("fields", "methods", "items"):
                for entry in node.get(key) or []:
                    if isinstance(entry, str):
                        parts.append(entry)
        for edge in data.get("edges", []):
            if not isinstance(edge, dict):
                continue
            for key in ("label", "source_label", "target_label"):
                if edge.get(key):
                    parts.append(str(edge[key]))

    return " ".join(parts)

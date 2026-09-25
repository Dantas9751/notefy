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
import uuid

from django.core.exceptions import ValidationError

# --------------------------------------------------------------------------
# Nota — dividida em seções
#
# Uma nota é uma lista de blocos. Guardar cada um num campo próprio, e não
# tudo como HTML, é o que permite tratá-los como dados:
#
# - `code` tem linguagem, então dá para colorir a sintaxe e manter a
#   indentação intacta — um contentEditable normaliza espaços e brigaria
#   com o realce.
# - `checklist` tem itens com `done`, então marcar um item é um booleano e
#   não um caractere; dá para contar quantos faltam sem ler HTML.
# - `table` tem linhas e colunas de verdade, então a célula é endereçável.
#   Uma tabela desenhada dentro do texto rico só é tabela para os olhos.
#
# Os quatro convivem na mesma lista, na ordem que o autor escolher.
# --------------------------------------------------------------------------
SECTION_TYPES = ("text", "code", "checklist", "table")

#: Teto de itens/linhas por seção. Não é regra de negócio: é o que
#: impede um payload absurdo (colado, ou gerado por engano) virar um
#: JSONField de megabytes que o editor não consegue mais desenhar.
MAX_ITENS_SECAO = 500
MAX_COLUNAS_TABELA = 30

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
    # Imagem colada. O canvas já aceitava; o diagrama recusava na
    # validação, e um print do slide é exatamente o que se cola ao lado
    # de um fluxograma para explicar de onde ele veio.
    "image",
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

#: Tema do QUADRO (canvas e diagrama), independente do tema do app.
#: Fica no payload, não em coluna: é propriedade daquele desenho, e
#: `data` já é JSONField — nenhuma migração para isto.
#: Ausente significa "system": quadros salvos antes desta feature
#: continuam válidos e seguem o app, como sempre seguiram.
THEME_CHOICES = ("light", "dark", "system")


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
        return {
            "nodes": [],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "theme": "system",
        }
    if kind == "canvas":
        return {
            "nodes": [],
            "edges": [],
            "strokes": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "background": "grid",
            "theme": "system",
        }
    return {}


def _require(condition, message):
    if not condition:
        raise ValidationError({"data": message})


# --------------------------------------------------------------------------
# Nota
# --------------------------------------------------------------------------

def secao_tem_conteudo(section):
    """A seção tem algo escrito?

    Existe para o `save()` do modelo decidir se pode jogar o `content`
    antigo dentro de uma nota "vazia". Checar `html or code` direto ali
    dava dois problemas: uma nota cujo único bloco é uma tabela contava
    como vazia e era SOBRESCRITA pelo texto legado, e uma seção que não
    fosse dict derrubava o `.get` com AttributeError — 500 ao salvar.
    """
    if not isinstance(section, dict):
        return False
    if section.get("html") or section.get("code"):
        return True
    if any((i or {}).get("text") for i in section.get("items") or [] if isinstance(i, dict)):
        return True
    return any(any(c for c in row) for row in section.get("rows") or [] if isinstance(row, list))


def _validate_checklist_section(section, sid):
    """`items: [{id, text, done}]`.

    O `done` é booleano no banco, e não um `[x]` no meio do texto: é o
    que permite contar o que falta, riscar o item e um dia filtrar a
    busca por pendência — nada disso sai de uma string.
    """
    items = section.get("items")
    if items is None:
        section["items"] = []
        return
    _require(isinstance(items, list), f"`items` da seção {sid!r} deve ser uma lista.")
    _require(
        len(items) <= MAX_ITENS_SECAO,
        f"A seção {sid!r} tem mais de {MAX_ITENS_SECAO} itens.",
    )
    for posicao, item in enumerate(items):
        _require(
            isinstance(item, dict),
            f"Item {posicao} da seção {sid!r} deve ser um objeto.",
        )
        _require(
            isinstance(item.get("text", ""), str),
            f"`text` do item {posicao} da seção {sid!r} deve ser texto.",
        )
        # O id só serve para o React reconciliar a lista; faltando, o
        # editor reconcilia por posição e apagar um item do meio faz o
        # texto dos de baixo saltar de linha. Preencher aqui é o mesmo
        # remendo já aplicado ao id da seção.
        if not item.get("id"):
            item["id"] = f"i{posicao}-{uuid.uuid4().hex[:8]}"
        item["done"] = bool(item.get("done"))


def _validate_table_section(section, sid):
    """`rows: [[célula, ...], ...]`, a primeira linha é o cabeçalho.

    Sem declaração de colunas: o número delas é o da linha mais larga, e
    o editor completa as curtas. Uma lista de colunas separada seria um
    segundo lugar para a mesma verdade, e os dois sairiam do ar assim que
    alguém colasse uma linha maior.
    """
    rows = section.get("rows")
    if rows is None:
        section["rows"] = []
        return
    _require(isinstance(rows, list), f"`rows` da seção {sid!r} deve ser uma lista.")
    _require(
        len(rows) <= MAX_ITENS_SECAO,
        f"A seção {sid!r} tem mais de {MAX_ITENS_SECAO} linhas.",
    )
    for posicao, row in enumerate(rows):
        _require(
            isinstance(row, list),
            f"Linha {posicao} da seção {sid!r} deve ser uma lista de células.",
        )
        _require(
            len(row) <= MAX_COLUNAS_TABELA,
            f"Linha {posicao} da seção {sid!r} passa de {MAX_COLUNAS_TABELA} colunas.",
        )
        for coluna, celula in enumerate(row):
            _require(
                isinstance(celula, str),
                f"Célula {coluna} da linha {posicao} na seção {sid!r} deve ser texto.",
            )


def _validate_note(data):
    sections = data.get("sections")
    if sections is None:
        data["sections"] = []
        return
    _require(isinstance(sections, list), "`data.sections` deve ser uma lista.")

    seen = set()
    for index, section in enumerate(sections):
        if not isinstance(section, dict):
            continue
        sid = section.get("id")
        if not sid:
            # O `continue` que morava aqui pulava a validação INTEIRA da
            # seção, não só o id — tipo desconhecido e `html` não-texto
            # passavam direto.
            #
            # E o id ausente não era inofensivo: o editor endereçava seção
            # por id, então duas seções sem id eram indistinguíveis entre
            # si e escrever numa apagava a outra. Preencher aqui conserta
            # a nota na primeira gravação.
            sid = f"s{index}-{uuid.uuid4().hex[:8]}"
            section["id"] = sid
        _require(sid not in seen, f"`id` de seção duplicado: {sid!r}.")
        seen.add(sid)

        kind = section.get("type")
        _require(
            kind in SECTION_TYPES,
            f"Tipo de seção desconhecido: {kind!r}.",
        )

        if kind == "text":
            _require(
                isinstance(section.get("html", ""), str),
                f"`html` da seção {sid!r} deve ser texto.",
            )
        elif kind == "checklist":
            _validate_checklist_section(section, sid)
        elif kind == "table":
            _validate_table_section(section, sid)
        else:
            _require(
                isinstance(section.get("code", ""), str),
                f"`code` da seção {sid!r} deve ser texto.",
            )
            # A linguagem escolhe o dicionário do realce de sintaxe. Uma
            # desconhecida não colore nada e some silenciosamente — recusar
            # aqui é o que faz o erro aparecer enquanto ainda dá para
            # corrigir.
            language = section.get("language", "plaintext")
            _require(
                language in CODE_LANGUAGES,
                f"Linguagem desconhecida na seção {sid!r}: {language!r}.",
            )


# --------------------------------------------------------------------------
# Planilha
# --------------------------------------------------------------------------

def _validate_spreadsheet(data):
    columns = data.get("columns")
    rows = data.get("rows")
    if columns is None:
        data["columns"] = []
    if rows is None:
        data["rows"] = []

    _require(isinstance(data["columns"], list), "`data.columns` deve ser uma lista.")
    _require(isinstance(data["rows"], list), "`data.rows` deve ser uma lista.")

    seen = set()
    for index, column in enumerate(data["columns"]):
        _require(isinstance(column, dict), f"`columns[{index}]` deve ser um objeto.")
        cid = column.get("id")
        _require(bool(cid), f"`columns[{index}]` precisa de um `id`.")
        # As células de cada linha são indexadas pelo id da coluna. Dois ids
        # iguais fazem uma coluna sobrescrever a outra na leitura — o dado
        # não some do JSON, mas some da tela.
        _require(cid not in seen, f"`id` de coluna duplicado: {cid!r}.")
        seen.add(cid)

        tipo = column.get("type", "text")
        _require(tipo in COLUMN_TYPES, f"Tipo de coluna desconhecido: {tipo!r}.")

        agregado = column.get("aggregate")
        _require(
            agregado is None or agregado in AGGREGATE_TYPES,
            f"Resumo de coluna desconhecido: {agregado!r}.",
        )

    for index, row in enumerate(data["rows"]):
        _require(isinstance(row, dict), f"`rows[{index}]` deve ser um objeto.")
        _require(bool(row.get("id")), f"`rows[{index}]` precisa de um `id`.")
        cells = row.get("cells", {})
        _require(isinstance(cells, dict), f"`cells` da linha {row.get('id')!r} deve ser um objeto.")

    # Ordenação e filtros guardam o id da coluna. Apontar para uma coluna que
    # não existe mais (renomeada, removida) deixa a planilha abrindo vazia
    # sem dizer por quê.
    sort = data.get("sort")
    if isinstance(sort, dict) and sort.get("column"):
        _require(
            sort["column"] in seen,
            f"`sort.column` aponta para uma coluna inexistente: {sort['column']!r}.",
        )

    filtros = data.get("filters")
    if filtros is not None:
        _require(isinstance(filtros, list), "`data.filters` deve ser uma lista.")
        for index, filtro in enumerate(filtros):
            _require(isinstance(filtro, dict), f"`filters[{index}]` deve ser um objeto.")
            coluna = filtro.get("column")
            _require(
                coluna in seen,
                f"`filters[{index}].column` aponta para uma coluna inexistente: {coluna!r}.",
            )


# --------------------------------------------------------------------------
# Grafos (diagrama e canvas)
# --------------------------------------------------------------------------

def _validate_graph(data, node_types, edge_types, *, allow_strokes=False):
    # Blindagem total: se vier nulo ou omitido, converte para lista vazia
    if data.get("nodes") is None:
        data["nodes"] = []
    if data.get("edges") is None:
        data["edges"] = []
    if allow_strokes and data.get("strokes") is None:
        data["strokes"] = []

    nodes = data.get("nodes")
    edges = data.get("edges")
    _require(isinstance(nodes, list), "`data.nodes` deve ser uma lista.")
    _require(isinstance(edges, list), "`data.edges` deve ser uma lista.")

    ids = set()
    for index, node in enumerate(nodes):
        _require(isinstance(node, dict), f"`nodes[{index}]` deve ser um objeto.")
        nid = node.get("id")
        _require(bool(nid), f"`nodes[{index}]` precisa de um `id`.")
        _require(nid not in ids, f"`id` de nó duplicado: {nid!r}.")
        ids.add(nid)

        # Cada vocabulário desenha o seu: `GraphNode` escolhe a forma pelo
        # `type`, e um tipo do canvas caindo num diagrama (ou vice-versa)
        # cai no `default` e vira um retângulo genérico sem aviso.
        tipo = node.get("type")
        _require(tipo in node_types, f"Tipo de nó desconhecido: {tipo!r}.")

    for index, edge in enumerate(edges):
        _require(isinstance(edge, dict), f"`edges[{index}]` deve ser um objeto.")
        _require(bool(edge.get("id")), f"`edges[{index}]` precisa de um `id`.")

        tipo = edge.get("type")
        _require(tipo in edge_types, f"Tipo de conector desconhecido: {tipo!r}.")

        # Aresta órfã não tem de onde nem para onde ser desenhada: o editor
        # calcula os pontos a partir do retângulo dos dois nós.
        for ponta in ("from", "to"):
            alvo = edge.get(ponta)
            _require(
                alvo in ids,
                f"`edges[{index}].{ponta}` aponta para um nó inexistente: {alvo!r}.",
            )

        # Pontos intermediários do conector, quando a pessoa curva a linha.
        pontos = edge.get("waypoints")
        if pontos is not None:
            _require(isinstance(pontos, list), f"`edges[{index}].waypoints` deve ser uma lista.")
            for p, ponto in enumerate(pontos):
                _require(
                    isinstance(ponto, dict)
                    and isinstance(ponto.get("x"), (int, float))
                    and not isinstance(ponto.get("x"), bool)
                    and isinstance(ponto.get("y"), (int, float))
                    and not isinstance(ponto.get("y"), bool),
                    f"`edges[{index}].waypoints[{p}]` precisa de `x` e `y` numéricos.",
                )

    if allow_strokes:
        for index, stroke in enumerate(data.get("strokes") or []):
            _require(isinstance(stroke, dict), f"`strokes[{index}]` deve ser um objeto.")

            ferramenta = stroke.get("tool")
            _require(ferramenta in STROKE_TOOLS, f"Ferramenta desconhecida: {ferramenta!r}.")

            pontos = stroke.get("points")
            _require(isinstance(pontos, list), f"`strokes[{index}].points` deve ser uma lista.")
            # Um ponto só não é um traço: não há segmento para desenhar.
            _require(
                len(pontos) >= 2,
                f"`strokes[{index}]` precisa de pelo menos dois pontos.",
            )
            for p, ponto in enumerate(pontos):
                _require(
                    isinstance(ponto, (list, tuple))
                    and len(ponto) == 2
                    and all(isinstance(c, (int, float)) and not isinstance(c, bool) for c in ponto),
                    f"`strokes[{index}].points[{p}]` deve ser um par [x, y] numérico.",
                )


def validate_data(kind, data):
    """Valida o payload conforme o tipo. Levanta ValidationError."""
    if data is None:
        return
    if isinstance(data, str):
        return
    if not isinstance(data, dict):
        raise ValidationError({"data": "`data` deve ser um objeto."})

    if not data:
        return

    if kind == "note":
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

def extract_text(kind, data, content=""):
    """Texto pesquisável de dentro do payload."""
    if not isinstance(data, dict):
        # Arquivos guardam o texto extraído em `content`, não em `data`.
        return content or ""

    parts = []
    if kind == "note":
        for section in data.get("sections") or []:
            if not isinstance(section, dict):
                continue
            tipo = section.get("type")
            if tipo == "code":
                if section.get("title"):
                    parts.append(str(section["title"]))
                parts.append(str(section.get("code", "")))
            elif tipo == "checklist":
                # O texto do item entra na busca; o `done` não. Procurar
                # por "comprar" tem que achar a lista tendo ela sido
                # concluída ou não.
                for item in section.get("items") or []:
                    if isinstance(item, dict):
                        parts.append(str(item.get("text", "")))
            elif tipo == "table":
                for row in section.get("rows") or []:
                    if isinstance(row, list):
                        parts.extend(str(c) for c in row)
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
                elif isinstance(value, list):
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
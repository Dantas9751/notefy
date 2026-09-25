"""Consulta ao índice de texto completo dos documentos.

O índice e os gatilhos que o mantêm estão em
`content/migrations/0007_document_fts.py`.
"""

import re
import unicodedata

from django.db import connection

#: Quanto o título pesa em relação ao corpo no bm25.
#:
#: Quem procura "prova" quer a nota CHAMADA "Prova" antes da que só cita a
#: palavra no meio do texto. Era o que o CASE WHEN de antes fazia à mão,
#: em quatro degraus fixos; o bm25 faz com a frequência real do termo.
#: `doc_id` é UNINDEXED, mas o bm25 CONTA a coluna na ordem dos pesos —
#: medido, não deduzido. Com dois pesos só, o "10" caía no doc_id, o
#: título ficava com 1 e o ranking saía invertido: a nota que mencionava
#: o termo no meio do texto vinha antes da nota com aquele nome.
PESO_DOC_ID = 0.0
PESO_TITULO = 10.0
PESO_CORPO = 1.0

#: Teto de ids trazidos do índice numa consulta. Existe para o caso
#: patológico (alguém busca "a" com 50 000 documentos): sem ele o
#: `IN (...)` do passo seguinte receberia a tabela inteira.
#: ponytail: teto fixo; se a paginação passar disso, trocar por consulta
#: paginada dentro do próprio FTS.
TETO = 2000

#: Quebra em palavras. Qualquer coisa que não seja letra ou dígito separa —
#: é o que impede aspas, parênteses e hífen de virarem sintaxe do FTS5.
_PALAVRAS = re.compile(r"[^0-9A-Za-zÀ-ÿ]+")


def para_match(termo):
    """Texto digitado -> expressão MATCH do FTS5.

    O usuário digita `bellman-ford`, `O(VE)` ou `a"b`. Cru, isso é
    sintaxe do FTS5: hífen é operador, aspas abrem frase, parêntese
    agrupa — e a consulta estoura com erro em vez de não achar nada.
    Cada palavra vai entre aspas (vira literal) e a última ganha `*`,
    para o resultado aparecer enquanto se digita.

    Devolve `None` quando não sobra nenhuma palavra (`***`, `?`, um
    emoji sozinho). Quem chama trata isso como busca sem resultado — é o
    que pasta e tarefa já respondem para o mesmo termo, e prometer a
    biblioteca inteira a quem digitou `***` seria mais estranho do que
    dizer que não achou nada.
    """
    palavras = [p for p in _PALAVRAS.split(termo or "") if p]
    if not palavras:
        return None
    return " ".join([f'"{p}"' for p in palavras[:-1]] + [f'"{palavras[-1]}"*'])


def ids_por_relevancia(termo, limite=TETO):
    """Ids de documento que casam com o termo, do mais relevante ao menos.

    Devolve `None` quando não há termo utilizável. Ver `para_match`: o
    chamador transforma isso em "nenhum resultado".
    """
    match = para_match(termo)
    if match is None:
        return None

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT doc_id
            FROM content_document_fts
            WHERE content_document_fts MATCH %s
            ORDER BY bm25(content_document_fts, %s, %s, %s)
            LIMIT %s
            """,
            [match, PESO_DOC_ID, PESO_TITULO, PESO_CORPO, limite],
        )
        return [linha[0] for linha in cursor.fetchall()]


# --------------------------------------------------------------------------
# Pasta e tarefa
#
# Estas duas não têm índice FTS. O LIKE do SQLite não ignora acento, então
# elas ficavam fora do que o índice dos documentos passou a fazer: buscar
# "calculo" achava a NOTA "Cálculo III" e não achava a PASTA de mesmo nome.
#
# ponytail: filtra em Python sobre o conjunto já cortado por dono, data e
# categoria. São itens que o usuário cria à mão — dezenas, não milhões. Se
# um dia crescer, o caminho é o mesmo dos documentos: tabela FTS5 com
# gatilho, e este bloco sai inteiro.
# --------------------------------------------------------------------------


def sem_acento(texto):
    """Minúsculas e sem diacrítico: "Cálculo" e "calculo" viram a mesma coisa.

    `casefold` em vez de `lower` porque ele trata casos que o `lower` não
    normaliza (o ß do alemão, por exemplo).
    """
    decomposto = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in decomposto if unicodedata.category(c) != "Mn").casefold()


def filtrar_e_ordenar(registros, termo, campo_nome, campos_extras=()):
    """Registros que contêm o termo, com quem bate no NOME primeiro.

    Mesma regra de peso do índice dos documentos: quem procura "prova"
    quer a pasta CHAMADA "Prova" antes da que só cita a palavra na
    descrição.
    """
    alvo = sem_acento(termo)
    if not alvo:
        return list(registros)

    achados = []
    for registro in registros:
        nome = sem_acento(getattr(registro, campo_nome, ""))
        no_nome = alvo in nome
        no_resto = any(alvo in sem_acento(getattr(registro, c, "")) for c in campos_extras)
        if no_nome or no_resto:
            # Ordena por: bate no nome, depois começa com o termo.
            achados.append((0 if no_nome else 1, 0 if nome.startswith(alvo) else 1, registro))

    achados.sort(key=lambda t: (t[0], t[1]))
    return [t[2] for t in achados]

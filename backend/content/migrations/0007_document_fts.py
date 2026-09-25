"""Índice de texto completo (FTS5) para documentos.

A busca fazia `LIKE '%termo%'` sobre `search_text`, que guarda até 20 000
caracteres por documento. Curinga à esquerda nenhum índice atende: era
varredura da tabela inteira a cada busca.

Desenho, e por que assim:

- **Tabela autônoma, não `content=`.** O modo external-content do FTS5
  exige que a tabela de origem tenha `rowid` INTEGER como chave. Aqui a
  chave é UUID; guardar `doc_id` como coluna UNINDEXED custa alguns bytes
  e evita a ponte rowid→UUID em toda consulta.

- **Gatilhos, não sinais do Django.** O índice acompanha o INSERT, o
  UPDATE e o DELETE dentro do próprio banco. Sinal em Python não vê
  `queryset.update()` nem o DELETE em cascata do coletor, e é assim que
  índice de busca silenciosamente desanda.

- **`remove_diacritics 2`.** Sem isto, "calculo" não acha "Cálculo" — o
  que, num app em português, é a busca não funcionando.
"""

from django.db import migrations

CRIAR = """
CREATE VIRTUAL TABLE IF NOT EXISTS content_document_fts USING fts5(
    doc_id UNINDEXED,
    title,
    search_text,
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS content_document_fts_ai
AFTER INSERT ON content_document BEGIN
    INSERT INTO content_document_fts(doc_id, title, search_text)
    VALUES (new.id, new.title, new.search_text);
END;

CREATE TRIGGER IF NOT EXISTS content_document_fts_ad
AFTER DELETE ON content_document BEGIN
    DELETE FROM content_document_fts WHERE doc_id = old.id;
END;

-- Apaga e reinsere em vez de UPDATE: a tabela virtual não aceita UPDATE
-- parcial por coluna indexada sem reescrever a linha de qualquer forma.
CREATE TRIGGER IF NOT EXISTS content_document_fts_au
AFTER UPDATE ON content_document BEGIN
    DELETE FROM content_document_fts WHERE doc_id = old.id;
    INSERT INTO content_document_fts(doc_id, title, search_text)
    VALUES (new.id, new.title, new.search_text);
END;

-- Carga inicial: o que já existe no banco precisa entrar no índice, senão
-- só documentos criados a partir de agora seriam encontrados.
INSERT INTO content_document_fts(doc_id, title, search_text)
SELECT id, title, search_text FROM content_document;
"""

DESFAZER = """
DROP TRIGGER IF EXISTS content_document_fts_au;
DROP TRIGGER IF EXISTS content_document_fts_ad;
DROP TRIGGER IF EXISTS content_document_fts_ai;
DROP TABLE IF EXISTS content_document_fts;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0006_alter_document_options_remove_document_is_pinned"),
    ]

    operations = [migrations.RunSQL(CRIAR, DESFAZER)]

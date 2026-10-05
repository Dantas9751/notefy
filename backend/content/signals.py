"""Limpeza dos arquivos em disco quando o documento deixa de existir.

Apagar a linha da tabela não apaga o PDF, a imagem ou o áudio que ela
aponta. Num app que roda na máquina do usuário isso é pior do que
desperdício de espaço: o arquivo continua lá depois de o usuário ter
mandado excluir, o que não é o que "excluir" significa para ele.

Fica num `post_delete` — e não no `delete()` do modelo — porque a maior
parte das exclusões não passa pelo `delete()` de uma instância: apagar uma
pasta, uma categoria ou a conta inteira cascateia pelo coletor do Django,
que percorre os objetos e dispara este signal para cada um. Um lugar só
cobre todos os caminhos.
"""

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Document


@receiver(post_delete, sender=Document)
def delete_file_from_storage(sender, instance, **kwargs):
    """Remove o arquivo do disco depois que a exclusão for confirmada."""
    if not instance.file:
        return

    name = instance.file.name
    storage = instance.file.storage

    def _remove():
        # Outra linha ainda aponta para o mesmo arquivo: duplicar um item
        # (ou os anexos de uma nota duplicada) compartilha o arquivo em vez
        # de copiar os bytes. Apagar aqui sem perguntar levava junto o
        # arquivo da cópia. Conta também o que está na lixeira, que ainda
        # pode ser restaurado.
        if Document.objects.filter(file=name).exists():
            return
        if storage.exists(name):
            storage.delete(name)

    # Só depois do commit: se a transação voltar atrás, a linha continua
    # existindo e apontando para um arquivo que teríamos apagado.
    transaction.on_commit(_remove)


def garantir_indice_de_busca(sender, using="default", **kwargs):
    """Recria os gatilhos da busca (`0007_document_fts`) se o `migrate` os apagou.

    No SQLite, `AddField` com default (o `is_read_only`, por exemplo) recria
    a tabela `content_document`, e gatilho não sobrevive à troca de tabela:
    a busca deixava de ver tudo que mudasse depois. Roda no fim de todo
    `migrate`; faltando gatilho, recria e refaz o índice do zero.
    """
    import importlib

    from django.db import connections

    conexao = connections[using]
    if conexao.vendor != "sqlite":
        return
    with conexao.cursor() as cursor:
        cursor.execute("SELECT name FROM sqlite_master WHERE name LIKE 'content_document_fts%'")
        nomes = {linha[0] for linha in cursor.fetchall()}
        gatilhos = {"content_document_fts_ai", "content_document_fts_ad", "content_document_fts_au"}
        if "content_document_fts" not in nomes or gatilhos <= nomes:
            return
        fts = importlib.import_module("content.migrations.0007_document_fts")
        cursor.execute("DELETE FROM content_document_fts")
        # O script da 0007 já recria os três gatilhos e recarrega o índice.
        cursor.executescript(fts.CRIAR)

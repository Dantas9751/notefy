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
        # `save=False`: o objeto já não existe, não há linha para atualizar.
        if storage.exists(name):
            storage.delete(name)

    # Só depois do commit: se a transação voltar atrás, a linha continua
    # existindo e apontando para um arquivo que teríamos apagado.
    transaction.on_commit(_remove)

"""Manutenção do índice de busca dos documentos."""

from django.conf import settings
from django.contrib.postgres.search import SearchVector
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Document


@receiver(post_save, sender=Document)
def update_document_search_vector(sender, instance, **kwargs):
    """Recalcula o tsvector do documento após cada gravação.

    Roda como UPDATE separado (e não dentro do save) porque SearchVector é
    uma expressão SQL: precisa ser avaliada pelo banco. O título tem peso
    'A' e o corpo peso 'B', então um termo no título ranqueia acima do
    mesmo termo no meio do conteúdo.

    `search_text` já traz o texto extraído do payload de planilhas e
    diagramas, então esses tipos são indexados pelo próprio conteúdo, não
    só pelo título.

    `on_commit` evita indexar algo que a transação venha a desfazer, e
    `update()` não dispara post_save de novo — sem recursão.
    """
    if kwargs.get("raw"):  # carga de fixtures
        return

    def _reindex():
        config = settings.SEARCH_CONFIG
        Document.objects.filter(pk=instance.pk).update(
            search_vector=SearchVector("title", weight="A", config=config)
            + SearchVector("search_text", weight="B", config=config)
        )

    transaction.on_commit(_reindex)

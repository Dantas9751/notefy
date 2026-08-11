"""Modelos abstratos compartilhados por todos os módulos do Notefy.

Centralizar PK, timestamps e posse (ownership) aqui garante que todo o
ecossistema siga as mesmas regras de isolamento por usuário e ordenação,
evitando divergências entre os apps.
"""

import uuid

from django.conf import settings
from django.db import models


class UUIDModel(models.Model):
    """PK em UUID.

    Usamos UUID em vez de inteiro sequencial porque o frontend é um SPA que
    expõe os IDs na URL: sequenciais permitiriam enumerar registros de outros
    usuários por tentativa e erro. O default é gerado em Python, então o ID
    já existe antes do INSERT — isso é o que permite calcular o `path`
    materializado de Folder dentro do próprio save().
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    """Timestamps de auditoria."""

    created_at = models.DateTimeField("criado em", auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        abstract = True


class OwnedModel(models.Model):
    """Vincula o registro a um usuário.

    Todo queryset da API filtra por `owner`; nenhum endpoint devolve dados
    sem esse filtro (ver `core.views.OwnedModelViewSet`).
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="%(class)ss",
        verbose_name="dono",
        db_index=True,
    )

    class Meta:
        abstract = True


class BaseModel(UUIDModel, TimeStampedModel, OwnedModel):
    """Combinação usada pela maioria das entidades do domínio."""

    class Meta:
        abstract = True

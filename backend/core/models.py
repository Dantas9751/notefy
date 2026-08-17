"""Modelos abstratos compartilhados por todos os módulos do Notefy.

Centralizar PK, timestamps e posse (ownership) aqui garante que todo o
ecossistema siga as mesmas regras de isolamento por usuário e ordenação,
evitando divergências entre os apps.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


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


class SoftDeleteQuerySet(models.QuerySet):
    """Queryset que sabe distinguir o que está na lixeira."""

    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def trashed(self):
        return self.filter(deleted_at__isnull=False)

    def delete(self):
        """Exclusão em massa também vai para a lixeira.

        Sem isto, `qs.delete()` apagaria de verdade e a lixeira teria
        buracos: o mesmo gesto na interface levaria a resultados diferentes
        conforme o caminho de código que o atendeu.
        """
        return self.update(deleted_at=timezone.now())

    def hard_delete(self):
        return super().delete()


class SoftDeleteModel(models.Model):
    """Exclusão que pode ser desfeita.

    `deleted_at` nulo é o estado normal; preenchido, o registro está na
    lixeira. Guardar a data em vez de um booleano é o que permite esvaziar
    a lixeira por idade depois, sem migração nova.

    O manager padrão continua enxergando tudo — trocar isso por um manager
    filtrado esconderia os itens da lixeira até do próprio código que
    precisa restaurá-los, e faria `objects.get(pk=...)` falhar de um jeito
    difícil de entender. Quem lista para o usuário chama `.alive()`.
    """

    deleted_at = models.DateTimeField(
        "excluído em", null=True, blank=True, default=None, db_index=True
    )

    objects = SoftDeleteQuerySet.as_manager()

    class Meta:
        abstract = True

    @property
    def is_trashed(self):
        return self.deleted_at is not None

    def delete(self, *args, **kwargs):
        """Manda para a lixeira em vez de apagar."""
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])

    def hard_delete(self, *args, **kwargs):
        """Apaga de verdade — usado ao esvaziar a lixeira."""
        return super().delete(*args, **kwargs)

    def restore(self):
        self.deleted_at = None
        self.save(update_fields=["deleted_at"])


class BaseModel(UUIDModel, TimeStampedModel, OwnedModel, SoftDeleteModel):
    """Combinação usada pela maioria das entidades do domínio."""

    class Meta:
        abstract = True

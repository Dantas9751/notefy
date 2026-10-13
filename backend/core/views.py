from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import status, viewsets
from rest_framework.exceptions import APIException
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated

from .idioma import texto
from .permissions import IsOwner


class NaLixeira(APIException):
    """410: o item é da pessoa e está na lixeira (o 404 fica para o que não existe para ela)."""

    status_code = status.HTTP_410_GONE
    default_code = "na_lixeira"

    def __init__(self):
        super().__init__(texto("Este item está na lixeira.", "This item is in the trash."))


class OwnedModelViewSet(viewsets.ModelViewSet):
    """Base de todo CRUD do Notefy.

    Garante três coisas de uma vez, para que nenhum app precise repetir:
    o queryset só enxerga registros do usuário logado, o `owner` é
    carimbado na criação (nunca aceito do cliente), e os `clean()` dos
    models viram erro 400 em vez de 500.
    """

    # IsAuthenticated precisa vir junto: declarar `permission_classes`
    # SUBSTITUI o default global do DRF, e IsOwner só implementa
    # has_object_permission — sozinho, ele deixaria requisições anônimas
    # passarem direto para o queryset.
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        # Necessário para o drf-spectacular, que instancia a view sem
        # request para gerar o schema.
        if getattr(self, "swagger_fake_view", False) or not self.request:
            return super().get_queryset().none()
        qs = super().get_queryset().filter(owner=self.request.user)
        # A lixeira fica fora de TODA listagem por padrão. Filtrar aqui, e
        # não em cada view, é o que garante que nenhum endpoint novo esqueça
        # e volte a mostrar item excluído na busca, na pasta ou no quadro.
        if hasattr(qs, "alive"):
            qs = qs.alive()
        return qs

    def get_object(self):
        """O item vivo; na lixeira da própria conta, 410 em vez de 404.

        O app dizia "foi para a lixeira" a qualquer 404 — também para o item
        de outra conta, que sobrava no navegador depois de trocar de conta, e
        para o apagado de vez. Só a dona fica sabendo da lixeira: para os
        outros, o item não existe.
        """
        try:
            return super().get_object()
        except Http404:
            modelo = self.queryset.model if self.queryset is not None else None
            chave = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
            if modelo is not None and hasattr(modelo.objects.none(), "trashed"):
                try:
                    na_lixeira = modelo.objects.trashed().filter(owner=self.request.user, pk=chave).exists()
                except (ValueError, DjangoValidationError):
                    na_lixeira = False  # id malformado: segue o 404
                if na_lixeira:
                    raise NaLixeira() from None
            raise

    def perform_create(self, serializer):
        self._save(serializer, owner=self.request.user)

    def perform_update(self, serializer):
        self._save(serializer)

    @staticmethod
    def _save(serializer, **kwargs):
        try:
            serializer.save(**kwargs)
        except DjangoValidationError as exc:
            # Traduz ValidationError do Django (levantado pelos clean() dos
            # models, como a trava anti-ciclo de Folder) para o formato de
            # erro do DRF.
            raise DRFValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else exc.messages
            ) from exc

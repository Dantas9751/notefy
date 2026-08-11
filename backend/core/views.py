from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated

from .permissions import IsOwner


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
        return super().get_queryset().filter(owner=self.request.user)

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

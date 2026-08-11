from rest_framework.permissions import BasePermission


class IsOwner(BasePermission):
    """Segunda camada de isolamento.

    O filtro por `owner` no queryset já esconde o objeto (produzindo 404),
    mas essa permissão fica como rede de segurança caso algum viewset
    futuro sobrescreva `get_queryset` sem o filtro.
    """

    message = "Você não tem acesso a este item."

    def has_object_permission(self, request, view, obj):
        owner_id = getattr(obj, "owner_id", None)
        if owner_id is None:
            owner_id = getattr(obj, "id", None)  # o próprio User
        return owner_id == request.user.id

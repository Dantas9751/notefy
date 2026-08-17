"""A lixeira.

Excluir no Notefy marca `deleted_at` em vez de apagar (ver
`core.models.SoftDeleteModel`). Esta view é o único lugar que enxerga o que
está marcado: lista, restaura e — só aqui — apaga de verdade.

A lixeira é transversal aos apps de propósito. O usuário não pensa "excluí
um Document e uma Folder"; ele pensa "excluí umas coisas". Uma rota por
app obrigaria a interface a juntar três listas e ordená-las na mão.
"""

from django.db import transaction
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from content.models import Document
from organization.models import Category, Folder
from planner.models import Board, Task

#: Por quantos dias um item fica recuperável antes da faxina automática.
#: Mora aqui, e não no comando, porque a tela precisa anunciar o mesmo
#: número que o comando aplica — se cada lado tivesse o seu, a interface
#: prometeria um prazo que a limpeza não cumpre.
TRASH_RETENTION_DAYS = 30

#: O que a lixeira conhece. A ordem define a ordem dos grupos na tela.
TIPOS = {
    "category": (Category, "name"),
    "folder": (Folder, "name"),
    "document": (Document, "title"),
    "task": (Task, "title"),
    "board": (Board, "name"),
}


def _serialize(tipo, obj, campo_nome):
    return {
        "id": str(obj.id),
        "type": tipo,
        "name": getattr(obj, campo_nome, "") or "(sem nome)",
        "deleted_at": obj.deleted_at.isoformat() if obj.deleted_at else None,
        # `kind` só existe em Document; a interface usa para escolher o ícone.
        "kind": getattr(obj, "kind", None),
    }


def _buscar(user, tipo, item_id):
    modelo, campo = TIPOS[tipo]
    return modelo.objects.filter(pk=item_id, owner=user).first(), campo


class TrashView(APIView):
    """GET lista a lixeira; DELETE esvazia."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        itens = []
        for tipo, (modelo, campo) in TIPOS.items():
            for obj in modelo.objects.filter(owner=request.user).trashed():
                itens.append(_serialize(tipo, obj, campo))
        # Mais recente primeiro: o que acabou de ser excluído é o que a
        # pessoa mais provavelmente veio desfazer.
        itens.sort(key=lambda i: i["deleted_at"] or "", reverse=True)
        # `retention_days` vai na resposta para a tela anunciar o prazo real
        # em vez de repetir um número que pode divergir do backend.
        return Response(
            {
                "count": len(itens),
                "retention_days": TRASH_RETENTION_DAYS,
                "results": itens,
            }
        )

    @extend_schema(responses={204: None})
    def delete(self, request):
        """Esvazia a lixeira — aqui sim os registros somem do banco."""
        with transaction.atomic():
            for modelo, _ in TIPOS.values():
                modelo.objects.filter(owner=request.user).trashed().hard_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrashItemView(APIView):
    """POST restaura um item; DELETE apaga só ele, definitivamente."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def post(self, request, tipo, item_id):
        if tipo not in TIPOS:
            return Response({"detail": "Tipo desconhecido."}, status=400)

        obj, campo = _buscar(request.user, tipo, item_id)
        if obj is None or not obj.is_trashed:
            return Response({"detail": "Item não está na lixeira."}, status=404)

        # Restaurar um item cujo pai continua na lixeira o devolveria para
        # um lugar invisível. Restauramos a cadeia até a raiz — é o que faz
        # "desfazer" realmente desfazer.
        for ancestral in _ancestrais(obj):
            if ancestral.is_trashed:
                ancestral.restore()

        obj.restore()
        return Response(_serialize(tipo, obj, campo))

    @extend_schema(responses={204: None})
    def delete(self, request, tipo, item_id):
        if tipo not in TIPOS:
            return Response({"detail": "Tipo desconhecido."}, status=400)
        obj, _ = _buscar(request.user, tipo, item_id)
        if obj is None or not obj.is_trashed:
            return Response({"detail": "Item não está na lixeira."}, status=404)
        obj.hard_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _ancestrais(obj):
    """Sobe a hierarquia: item → pasta → pastas pai → categoria."""
    vistos = []
    if isinstance(obj, Document):
        pasta = obj.folder
        while pasta is not None:
            vistos.append(pasta)
            pasta = pasta.parent
        if obj.folder and obj.folder.category:
            vistos.append(obj.folder.category)
    elif isinstance(obj, Folder):
        pai = obj.parent
        while pai is not None:
            vistos.append(pai)
            pai = pai.parent
        if obj.category:
            vistos.append(obj.category)
    elif isinstance(obj, Task):
        if obj.board:
            vistos.append(obj.board)
    return vistos

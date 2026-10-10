"""Caixa de entrada do código que roda na nota: `input()` e `prompt()`.

O código roda num Web Worker, e o worker só consegue PARAR e esperar a
tela com uma requisição síncrona (permitida dentro de workers). Ele pede
o valor aqui e fica bloqueado até a tela responder. A alternativa sem
servidor, SharedArrayBuffer, exige isolamento de origem (COOP/COEP), que
quebraria imagens e iframes de fora no app inteiro.

O canal é um token aleatório e serve de senha para ESPERAR: o worker não
tem o token de login, e o que trafega por ali é só o que a própria pessoa
digitou. Abrir, responder e fechar pedem login e o dono do canal.

ponytail: as caixas vivem na memória de UM processo. Vale para o app de
desktop e o runserver; com vários processos (gunicorn com workers) o
pedido e a resposta podem cair em processos diferentes. Aí: Redis.
"""

import queue
import secrets
import threading

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.excecoes import JSONParserSeguro
from core.idioma import texto

#: Quanto um pedido espera antes de devolver 204; o worker pergunta de
#: novo. Curto o bastante para nenhum proxy no caminho derrubar a conexão.
ESPERA_POR_PEDIDO = 25
#: Cada espera prende uma thread do servidor (o app de desktop tem 8).
#: Passar disto fecha o canal mais antigo da pessoa: é o que sobra de uma
#: aba fechada no meio de um `input()`.
MAX_CANAIS_POR_PESSOA = 3
MAX_CARACTERES = 10_000

_canais = {}  # canal -> (id do dono, fila com as respostas, trava de quem espera)
_trava = threading.Lock()


class CanalOcupado(Exception):
    """Já há um pedido esperando neste canal."""


def abrir(dono_id):
    canal = secrets.token_urlsafe(24)
    with _trava:
        do_dono = [c for c, (dono, *_) in _canais.items() if dono == dono_id]
        excesso = len(do_dono) - MAX_CANAIS_POR_PESSOA + 1
        for antigo in do_dono[: max(excesso, 0)]:  # o dict guarda a ordem: mais antigo primeiro
            _fechar(antigo)
        _canais[canal] = (dono_id, queue.Queue(), threading.Lock())
    return canal


def esperar(canal, segundos):
    """O valor digitado; `None` se o canal foi fechado. Levanta `KeyError`
    para canal que não existe, `CanalOcupado` se outro pedido já espera
    nele e `queue.Empty` se a espera acabou."""
    _, fila, espera = _canais[canal]
    # Um pedido esperando por canal: a mesma URL repetida em paralelo
    # prenderia todas as threads do servidor.
    if not espera.acquire(blocking=False):
        raise CanalOcupado
    try:
        return fila.get(timeout=segundos)
    finally:
        espera.release()


def responder(canal, dono_id, valor):
    with _trava:
        dono, fila, _ = _canais.get(canal, (None, None, None))
        if dono != dono_id:
            return False
        fila.put(valor)
        return True


def fechar(canal, dono_id):
    with _trava:
        if _canais.get(canal, (None,))[0] == dono_id:
            _fechar(canal)


def _fechar(canal):
    # `None` acorda quem está esperando: vira EOFError no Python e
    # `null` no prompt() do JavaScript, como um "Cancelar".
    _canais.pop(canal)[1].put(None)


# Só para o schema: a validação do valor é feita à mão (um número não
# pode virar texto, que é o que o CharField do DRF faria).
_CANAL = inline_serializer("CanalDeEntrada", {"canal": serializers.CharField()})
_VALOR = inline_serializer("ValorDeEntrada", {"valor": serializers.CharField(allow_null=True)})


class AbrirCanalView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={201: _CANAL}, operation_id="entrada_abrir")
    def post(self, request):
        return Response({"canal": abrir(request.user.id)}, status=status.HTTP_201_CREATED)


class CanalView(APIView):
    parser_classes = [JSONParserSeguro]

    def get_permissions(self):
        return [AllowAny()] if self.request.method == "GET" else [IsAuthenticated()]

    @extend_schema(
        responses={200: _VALOR, 204: None, 404: None, 409: None},
        operation_id="entrada_esperar",
        description="Espera a resposta (sem login: o canal é a senha). 204 = pergunte de novo.",
    )
    def get(self, request, canal):
        try:
            valor = esperar(canal, ESPERA_POR_PEDIDO)
        except KeyError:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except queue.Empty:
            return Response(status=status.HTTP_204_NO_CONTENT)
        except CanalOcupado:
            return Response(status=status.HTTP_409_CONFLICT)
        return Response({"valor": valor})

    @extend_schema(request=_VALOR, responses={204: None, 404: None}, operation_id="entrada_responder")
    def post(self, request, canal):
        valor = request.data.get("valor") if isinstance(request.data, dict) else None
        if not isinstance(valor, str) or len(valor) > MAX_CARACTERES:
            return Response(
                {"detail": texto(
                    f"Mande um texto de até {MAX_CARACTERES} caracteres.",
                    f"Send text of up to {MAX_CARACTERES} characters.",
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not responder(canal, request.user.id, valor):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={204: None}, operation_id="entrada_fechar")
    def delete(self, request, canal):
        fechar(canal, request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

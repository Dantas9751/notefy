"""Como a API responde quando algo dá errado fora do serializer.

Dois tipos de erro escapavam do DRF e viravam 500, com a página de
depuração do Django no lugar da mensagem:

- `django.core.exceptions.ValidationError`. `Document.save()` chama
  `full_clean()`, e a validação do modelo roda também em caminhos que não
  passam por serializer nenhum: upload em lote, duplicar, importar backup.
  Um nome de arquivo com 255 caracteres (o título aceita 250) derrubava o
  upload inteiro.
- `IntegrityError`. A restrição do banco é a última linha; quando ela é a
  ÚNICA linha (a validação acima dela falhou ou nem existe), o usuário
  recebia 500 em vez de "esse nome já existe".

O tratador converte os dois para respostas que a tela sabe mostrar, e
deixa todo o resto com o tratador padrão.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import exceptions, status
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.views import exception_handler, set_rollback


def tratar_excecao(exc, context):
    if isinstance(exc, DjangoValidationError):
        detalhe = exc.message_dict if hasattr(exc, "error_dict") else exc.messages
        exc = exceptions.ValidationError(detalhe)

    elif isinstance(exc, IntegrityError):
        set_rollback()
        # O texto do SQLite é técnico ("UNIQUE constraint failed: index
        # 'unique_...'"). O caso de longe mais comum é nome repetido.
        if "UNIQUE" in str(exc).upper():
            mensagem = "Já existe um item com esse nome aqui."
        else:
            mensagem = "Não deu para salvar: um item ligado a este não existe mais."
        return Response({"detail": mensagem}, status=status.HTTP_409_CONFLICT)

    return exception_handler(exc, context)


class JSONParserSeguro(JSONParser):
    """O JSONParser do DRF, sem cair com JSON aninhado demais.

    O `json.loads` do Python lança `RecursionError` a partir de uns mil
    níveis de `{"x":{"x":...}}`, e o DRF só converte `ValueError` em 400:
    o resto subia como 500. Nenhum payload do app chega perto desse
    aninhamento, então isso só acontece com entrada fabricada.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        try:
            return super().parse(stream, media_type, parser_context)
        except RecursionError as exc:
            raise exceptions.ParseError("JSON aninhado demais.") from exc

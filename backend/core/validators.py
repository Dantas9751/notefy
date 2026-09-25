"""Validadores reutilizáveis."""

import ipaddress
import uuid
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator

hex_color_validator = RegexValidator(
    regex=r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
    message="Informe uma cor hexadecimal válida (ex.: #4F46E5).",
)

icon_name_validator = RegexValidator(
    regex=r"^[a-z0-9-]{1,64}$",
    message="Ícone deve ser um identificador kebab-case (ex.: 'book-open').",
)


def e_uuid(valor):
    """O texto é um UUID?

    Serve para perguntar ANTES de levar o valor ao banco. Um id
    malformado num `filter(pk=...)` não devolve vazio: ele derruba a
    consulta com `ValueError`, e a resposta que deveria ser "pasta não
    encontrada" vira 500. Isso não é hipotético — chega assim de um link
    velho, de um id copiado pela metade ou de um arraste que ficou na
    memória depois de o item ter sumido.
    """
    try:
        uuid.UUID(str(valor))
    except (ValueError, AttributeError, TypeError):
        return False
    return True


def uuids_validos(valores):
    """Só os ids aproveitáveis de uma lista vinda da query string.

    Descartar é o comportamento certo aqui: um id inválido não casaria
    com nada de qualquer forma, então a busca acontece sem aquele filtro
    em vez de explodir na cara de quem só clicou num link antigo.
    """
    return [v for v in valores or () if e_uuid(v)]


#: Faixa que os provedores de nuvem usam para servir credenciais da
#: instância (AWS, GCP, Azure e Oracle, todos em 169.254.169.254).
_METADADOS_DA_NUVEM = ipaddress.ip_network("169.254.0.0/16")


def validar_endereco_de_ia(valor):
    """Endereço do provedor de IA: só http(s), e não a rede de metadados.

    O campo é escolhido pelo usuário e o backend faz a requisição por
    ele, levando junto a chave de IA no `Authorization`. Isso é uma
    requisição feita pelo servidor com destino escolhido de fora — o que
    dá para restringir sem tirar recurso de ninguém, restringimos:

    - **Esquema.** `URLField` do Django aceita `ftp` e `ftps` por padrão.
      Nenhum gateway de IA fala nisso.
    - **169.254.0.0/16.** É onde AWS, GCP e Azure entregam as credenciais
      da máquina. Nenhum modelo roda ali.

    O que NÃO bloqueamos, de propósito: `localhost` e a rede local. O
    app existe para poder apontar a IA para um modelo rodando na própria
    máquina — `BASE_PADRAO["ollama"]` é `http://localhost:11434/v1`.
    Barrar isso fecharia a porta que o recurso veio abrir.
    """
    texto = (valor or "").strip()
    if not texto:
        return

    partes = urlsplit(texto)
    if partes.scheme not in ("http", "https"):
        raise ValidationError("O endereço precisa começar com http:// ou https://.")

    hospedeiro = (partes.hostname or "").strip("[]")
    try:
        ip = ipaddress.ip_address(hospedeiro)
    except ValueError:
        return  # é um nome, não um IP literal — nada a conferir aqui
    if ip in _METADADOS_DA_NUVEM or ip.is_link_local:
        raise ValidationError("Esse endereço não pode ser usado como provedor de IA.")

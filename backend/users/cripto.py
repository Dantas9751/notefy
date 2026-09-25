"""Cifragem da chave de IA guardada no banco.

A `ai_key` é credencial de terceiro: quem a tem gasta o dinheiro do
usuário na conta dele. Estava em texto puro numa `CharField` — quem
abrisse o `db.sqlite3` (backup, sincronia de pasta, outra pessoa na
mesma máquina) lia a chave direto.

O serializer já a expunha só como write-only, mas isso protege a API,
não o arquivo.

Derivada do `SECRET_KEY`, e não de uma chave própria:

- No desktop o `SECRET_KEY` é único por instalação (`desktop_server.py`
  gera e guarda `secret.key` ao lado dos dados), então a cifra já é por
  máquina sem inventar um segundo segredo para o usuário perder.
- Um segundo segredo precisaria de um lugar para morar, e esse lugar
  seria o mesmo disco — sem ganho real.

`cryptography` já vem instalado como dependência do pyhanko (assinatura
de PDF): nada novo entrou no projeto.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

#: Marca o que já passou por aqui. Sem ela não há como distinguir um
#: texto cifrado de uma chave gravada antes desta mudança — e decifrar
#: texto puro devolveria lixo.
PREFIXO = "fernet:"


def _fernet():
    """Fernet exige 32 bytes em base64url; o SECRET_KEY é texto livre."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def cifrar(texto):
    """Texto puro -> `fernet:...`. Vazio continua vazio.

    Já cifrado passa direto: `save()` roda em todo PATCH das
    preferências, e cifrar duas vezes tornaria a chave irrecuperável.
    """
    if not texto or texto.startswith(PREFIXO):
        return texto
    return PREFIXO + _fernet().encrypt(texto.encode("utf-8")).decode("ascii")


def decifrar(texto):
    """`fernet:...` -> texto puro.

    Sem o prefixo, devolve como veio: é uma chave gravada antes desta
    mudança, e recusá-la desligaria a IA de quem já tinha configurado.

    Token inválido também volta como veio — acontece se o `SECRET_KEY`
    mudar. Aí a chave está perdida de qualquer forma, e devolver vazio
    esconderia o motivo; o provedor responde 401 e o usuário reconfigura.
    """
    if not texto or not texto.startswith(PREFIXO):
        return texto
    try:
        return _fernet().decrypt(texto[len(PREFIXO):].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""

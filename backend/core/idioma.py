"""O idioma da requisição, para os poucos textos que o SERVIDOR gera.

A maior parte do que o usuário lê é escrita pelo app e traduzida lá. Mas
alguns textos nascem no servidor e ficam gravados: o "(cópia)" que uma
duplicata leva no título, o quadro padrão de uma conta nova, o cabeçalho
do PDF. Para esses o servidor precisa saber em que idioma a pessoa usa o
Notefy, e ele descobre pelo cabeçalho `Accept-Language` que o app manda
(o `LocaleMiddleware` ativa o idioma da requisição).

Fora de uma requisição (testes, comandos de manutenção) vale o idioma
padrão do projeto, o português.
"""

from django.utils.translation import get_language


def em_ingles():
    return (get_language() or "").lower().startswith("en")


def texto(pt, en):
    """O texto no idioma da requisição."""
    return en if em_ingles() else pt


def data_hora(momento):
    """`25/09/2026 14:30` em português, `09/25/2026 2:30 PM` em inglês."""
    if em_ingles():
        return momento.strftime("%m/%d/%Y %I:%M %p").replace(" 0", " ", 1)
    return momento.strftime("%d/%m/%Y %H:%M")

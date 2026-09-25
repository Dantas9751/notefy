"""Quando é a próxima vez de uma tarefa que se repete.

`Task.recurrence_rule` guarda uma RRULE do RFC 5545 desde a primeira
migração — e nada no app jamais a leu. A pessoa marcava "toda segunda",
a tarefa era concluída e nunca mais voltava: o campo era gravado, era
serializado, entrava no backup e não fazia nada.

Este módulo é a parte que faltava. Ele responde UMA pergunta — dada uma
data e uma regra, qual é a próxima ocorrência — e é quem `Task.save()`
consulta para criar a repetição quando a anterior é concluída.

Subconjunto da RRULE, não a norma inteira
-----------------------------------------
Suporta `FREQ` (DAILY/WEEKLY/MONTHLY/YEARLY), `INTERVAL`, `BYDAY` e
`UNTIL`. É o que o formulário oferece, e o formulário é o único lugar
que escreve aqui.

`python-dateutil` faria o caso geral, mas ela é um motor de EXPANSÃO de
séries — devolve todas as ocorrências de um intervalo — e aqui se quer
sempre a próxima, uma só. Pagar uma dependência nova (que ainda teria de
entrar no pacote do PyInstaller) por 5% dela não se paga. O que não é
suportado é RECUSADO na validação, em vez de aceito e ignorado: aceitar
`COUNT=10` e repetir para sempre seria pior do que dizer que não dá.
"""

import calendar
import re
from datetime import date, timedelta

from django.core.exceptions import ValidationError

FREQUENCIAS = ("DAILY", "WEEKLY", "MONTHLY", "YEARLY")

#: Código do dia na RRULE -> `weekday()` do Python (segunda = 0).
DIAS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}

#: Atalhos que o formulário manda e que viram RRULE de verdade. Ficam
#: aqui, e não no frontend, para o backup e a API falarem uma língua só.
ATALHOS = {
    "diaria": "FREQ=DAILY",
    "semanal": "FREQ=WEEKLY",
    "quinzenal": "FREQ=WEEKLY;INTERVAL=2",
    "mensal": "FREQ=MONTHLY",
    "anual": "FREQ=YEARLY",
    "uteis": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
}

_UNTIL_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})")


def _partes(regra):
    """`"FREQ=WEEKLY;INTERVAL=2"` -> `{"FREQ": "WEEKLY", "INTERVAL": "2"}`."""
    saida = {}
    for pedaco in (regra or "").split(";"):
        if not pedaco.strip():
            continue
        chave, _, valor = pedaco.partition("=")
        saida[chave.strip().upper()] = valor.strip()
    return saida


def normalizar(regra):
    """Atalho do formulário -> RRULE. O que já é RRULE passa direto."""
    texto = (regra or "").strip()
    return ATALHOS.get(texto.lower(), texto)


def validar(regra):
    """Confere a regra e devolve a forma canônica dela.

    Levanta `ValidationError` no que não sabemos executar. Recusar na
    entrada é o que impede o campo voltar a ser decorativo: uma regra que
    ninguém consegue expandir é uma repetição que nunca acontece, e o
    usuário só descobriria isso semanas depois, pela ausência.

    O que volta é REMONTADO a partir das partes aprovadas, e não o texto
    como veio. Assim o que fica gravado descreve o que de fato vai
    acontecer: `INTERVAL=1` e `BYDAY=` vazio somem, a ordem é sempre a
    mesma, e duas regras equivalentes viram a mesma linha no banco e no
    backup.
    """
    texto = normalizar(regra)
    if not texto:
        return ""

    partes = _partes(texto)
    freq = partes.pop("FREQ", "").upper()
    if freq not in FREQUENCIAS:
        raise ValidationError(
            {"recurrence_rule": f"Frequência inválida. Use uma de: {', '.join(FREQUENCIAS)}."}
        )

    intervalo = partes.pop("INTERVAL", "1").strip() or "1"
    if not intervalo.isdigit() or not 1 <= int(intervalo) <= 365:
        raise ValidationError({"recurrence_rule": "`INTERVAL` deve ser um número de 1 a 365."})

    byday = partes.pop("BYDAY", "").strip()
    dias = []
    if byday:
        if freq != "WEEKLY":
            raise ValidationError(
                {"recurrence_rule": "`BYDAY` só vale com `FREQ=WEEKLY`."}
            )
        for dia in byday.split(","):
            codigo = dia.strip().upper()
            if codigo not in DIAS:
                raise ValidationError(
                    {"recurrence_rule": f"Dia da semana desconhecido: {dia!r}."}
                )
            if codigo not in dias:
                dias.append(codigo)

    until = partes.pop("UNTIL", "").strip()
    if until and not _ate_quando(until):
        raise ValidationError({"recurrence_rule": "`UNTIL` deve estar no formato AAAAMMDD."})

    if partes:
        desconhecidas = ", ".join(sorted(partes))
        raise ValidationError(
            {"recurrence_rule": f"Parte da regra que ainda não executamos: {desconhecidas}."}
        )

    saida = [f"FREQ={freq}"]
    if int(intervalo) > 1:
        saida.append(f"INTERVAL={int(intervalo)}")
    if dias:
        # Na ordem da semana, não na ordem digitada: `BYDAY=WE,MO` e
        # `BYDAY=MO,WE` são a mesma regra e viram a mesma linha.
        saida.append("BYDAY=" + ",".join(sorted(dias, key=DIAS.get)))
    if until:
        saida.append(f"UNTIL={until}")
    return ";".join(saida)


def _ate_quando(valor):
    """`"20261231"` (ou `"20261231T000000Z"`) -> `date`. Inválido -> None."""
    casou = _UNTIL_RE.match(valor or "")
    if not casou:
        return None
    try:
        return date(*(int(g) for g in casou.groups()))
    except ValueError:
        return None


def _somar_meses(quando, meses):
    """Soma meses grudando no último dia quando o mês de destino é curto.

    31 de janeiro + 1 mês é 28 de fevereiro, e não 3 de março: uma tarefa
    marcada para o fim do mês tem que continuar no fim do mês.
    """
    total = quando.month - 1 + meses
    ano = quando.year + total // 12
    mes = total % 12 + 1
    dia = min(quando.day, calendar.monthrange(ano, mes)[1])
    return quando.replace(year=ano, month=mes, day=dia)


def _proxima_semanal(quando, intervalo, dias):
    """Próximo dia marcado; passando da semana, salta `intervalo` semanas.

    `dias` são `weekday()` do Python. Sem `BYDAY` a regra cai no caso
    simples (mesmo dia da semana, N semanas depois) antes de chegar aqui.
    """
    atual = quando.weekday()
    adiante = sorted(d for d in dias if d > atual)
    if adiante:
        return quando + timedelta(days=adiante[0] - atual)
    # Acabaram os dias desta semana: volta para a segunda-feira da semana
    # de destino e anda até o primeiro dia marcado.
    inicio_da_semana = quando - timedelta(days=atual)
    destino = inicio_da_semana + timedelta(weeks=intervalo)
    return destino + timedelta(days=min(dias))


def proxima(quando, regra):
    """A primeira ocorrência DEPOIS de `quando`, ou `None` se a série acabou.

    `quando` é um `date` ou `datetime`; a hora, quando existe, é
    preservada — "toda terça às 19h" continua às 19h.
    """
    texto = normalizar(regra)
    if not texto or quando is None:
        return None

    partes = _partes(texto)
    freq = partes.get("FREQ", "").upper()
    if freq not in FREQUENCIAS:
        return None
    intervalo = int(partes.get("INTERVAL", "1") or 1)

    if freq == "DAILY":
        seguinte = quando + timedelta(days=intervalo)
    elif freq == "WEEKLY":
        dias = sorted(
            DIAS[d.strip().upper()]
            for d in (partes.get("BYDAY") or "").split(",")
            if d.strip().upper() in DIAS
        )
        seguinte = (
            _proxima_semanal(quando, intervalo, dias)
            if dias
            else quando + timedelta(weeks=intervalo)
        )
    elif freq == "MONTHLY":
        seguinte = _somar_meses(quando, intervalo)
    else:
        seguinte = _somar_meses(quando, 12 * intervalo)

    limite = _ate_quando(partes.get("UNTIL", ""))
    if limite:
        # `date()` porque UNTIL não carrega hora: comparar um datetime com
        # um date lançaria, e o dia é a granularidade que a regra declara.
        dia = seguinte.date() if hasattr(seguinte, "date") else seguinte
        if dia > limite:
            return None
    return seguinte


def descrever(regra):
    """Texto curto para a interface. Regra vazia -> string vazia."""
    texto = normalizar(regra)
    if not texto:
        return ""
    partes = _partes(texto)
    freq = partes.get("FREQ", "").upper()
    intervalo = int(partes.get("INTERVAL", "1") or 1)
    byday = (partes.get("BYDAY") or "").upper()

    if freq == "WEEKLY" and byday == "MO,TU,WE,TH,FR":
        return "Dias úteis"

    nomes = {
        "DAILY": ("Todo dia", "A cada {n} dias"),
        "WEEKLY": ("Toda semana", "A cada {n} semanas"),
        "MONTHLY": ("Todo mês", "A cada {n} meses"),
        "YEARLY": ("Todo ano", "A cada {n} anos"),
    }
    if freq not in nomes:
        return texto
    simples, repetido = nomes[freq]
    return simples if intervalo == 1 else repetido.format(n=intervalo)

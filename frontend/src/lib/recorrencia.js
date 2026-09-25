/**
 * Recorrência de tarefa, do lado da interface.
 *
 * As opções SÃO as RRULE que o backend grava, e não apelidos traduzidos
 * na ida e na volta: assim o `<select>` de uma tarefa já existente acha
 * o próprio valor sem nenhuma conversão, e não existe o caso clássico de
 * abrir uma tarefa "toda semana" e ver o campo em branco.
 *
 * Quem executa a regra é `planner/recorrencia.py`; aqui só se escolhe e
 * se lê. A lista curta é de propósito — é a mesma do Todoist e do Things,
 * e cobre o que alguém marca de verdade num app de estudo. Um construtor
 * completo de RRULE seria uma tela inteira para um caso que não aparece.
 */

export const OPCOES = [
  { valor: '', rotulo: 'Não se repete' },
  { valor: 'FREQ=DAILY', rotulo: 'Todo dia' },
  { valor: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', rotulo: 'Dias úteis' },
  { valor: 'FREQ=WEEKLY', rotulo: 'Toda semana' },
  { valor: 'FREQ=WEEKLY;INTERVAL=2', rotulo: 'A cada 2 semanas' },
  { valor: 'FREQ=MONTHLY', rotulo: 'Todo mês' },
  { valor: 'FREQ=YEARLY', rotulo: 'Todo ano' },
]

const PORVALOR = new Map(OPCOES.map((o) => [o.valor, o.rotulo]))

const NOMES = {
  DAILY: ['Todo dia', 'A cada {n} dias'],
  WEEKLY: ['Toda semana', 'A cada {n} semanas'],
  MONTHLY: ['Todo mês', 'A cada {n} meses'],
  YEARLY: ['Todo ano', 'A cada {n} anos'],
}

/**
 * RRULE -> texto curto para o cartão.
 *
 * Uma regra fora da lista (vinda de um backup, ou escrita à mão) ainda
 * assim é descrita pelo `FREQ`; só o que não dá para ler vira a própria
 * string, que é mais útil na tela do que um espaço em branco.
 */
export function descrever(regra) {
  const texto = String(regra || '').trim()
  if (!texto) return ''
  if (PORVALOR.has(texto)) return PORVALOR.get(texto)

  const partes = Object.fromEntries(
    texto
      .split(';')
      .filter(Boolean)
      .map((p) => {
        const [chave, ...resto] = p.split('=')
        return [chave.trim().toUpperCase(), resto.join('=').trim()]
      }),
  )
  const nome = NOMES[(partes.FREQ || '').toUpperCase()]
  if (!nome) return texto
  const intervalo = Number(partes.INTERVAL || 1)
  return intervalo === 1 ? nome[0] : nome[1].replace('{n}', intervalo)
}

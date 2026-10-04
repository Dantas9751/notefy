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

import { t } from './i18n.js'

export const OPCOES = [
  { valor: '', get rotulo() { return t('Não se repete') } },
  { valor: 'FREQ=DAILY', get rotulo() { return t('Todo dia') } },
  { valor: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', get rotulo() { return t('Dias úteis') } },
  { valor: 'FREQ=WEEKLY', get rotulo() { return t('Toda semana') } },
  { valor: 'FREQ=WEEKLY;INTERVAL=2', get rotulo() { return t('A cada 2 semanas') } },
  { valor: 'FREQ=MONTHLY', get rotulo() { return t('Todo mês') } },
  { valor: 'FREQ=YEARLY', get rotulo() { return t('Todo ano') } },
]

// Procurado na hora: o rótulo é traduzido, e o idioma pode mudar com o app aberto.
const rotuloPorValor = (valor) => OPCOES.find((o) => o.valor === valor)?.rotulo

const NOMES = {
  get DAILY() { return [t('Todo dia'), 'A cada {n} dias'] },
  get WEEKLY() { return [t('Toda semana'), 'A cada {n} semanas'] },
  get MONTHLY() { return [t('Todo mês'), 'A cada {n} meses'] },
  get YEARLY() { return [t('Todo ano'), 'A cada {n} anos'] },
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
  const rotulo = rotuloPorValor(texto)
  if (rotulo) return rotulo

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
  // O plural fica fora de `t()` literal porque a forma vem da tabela;
  // as quatro estão no dicionário do mesmo jeito.
  return intervalo === 1 ? nome[0] : t(nome[1], { n: intervalo })
}

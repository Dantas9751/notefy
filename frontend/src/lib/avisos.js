import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * Quando uma tarefa merece aviso, e o que o aviso diz.
 *
 * Tudo aqui é função pura, sem React e sem rede: recebe as tarefas e a
 * hora, devolve os avisos. É o pedaço que tem regra de calendário (dia
 * inteiro, virada do dia, aviso perdido com o app fechado), e é onde os
 * erros moram.
 */

const MINUTO = 60_000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

/**
 * Os momentos de aviso, do mais distante para o mais próximo.
 *
 * `antes` é quanto antes do prazo a etapa começa a valer. A ordem importa:
 * `etapaAtual` percorre a lista e fica com a última que já começou.
 */
export const ETAPAS = [
  { id: '1d', antes: DIA, rotulo: '1 dia antes' },
  { id: '1h', antes: HORA, rotulo: '1 hora antes' },
  { id: '10m', antes: 10 * MINUTO, rotulo: '10 minutos antes' },
  { id: 'prazo', antes: 0, rotulo: 'Quando o prazo chegar' },
]

export const TODAS_AS_ETAPAS = new Set(ETAPAS.map((e) => e.id))

/**
 * Por quanto tempo, depois do prazo, o aviso de "venceu" ainda sai.
 *
 * Quem abre o app de manhã precisa saber do que venceu ontem à noite. Quem
 * volta de uma semana fora não precisa de quarenta avisos de uma vez: o
 * que venceu há mais tempo já está nas telas de atrasadas.
 */
export const TOLERANCIA_APOS_PRAZO = DIA

/**
 * A janela que vale a pena pedir ao servidor.
 *
 * Para trás, a tolerância. Para frente, DOIS dias e não um: tarefa de dia
 * inteiro tem o prazo puxado para o começo do dia (ver `prazoDe`), e uma
 * marcada para depois de amanhã às 14h só entra na conta do "1 dia antes"
 * se vier na busca de hoje.
 */
export function janelaDeBusca(agora) {
  return {
    due_after: new Date(agora - TOLERANCIA_APOS_PRAZO).toISOString(),
    due_before: new Date(agora + 2 * DIA).toISOString(),
  }
}

/**
 * O prazo de uma tarefa: o fim, ou o início quando não há fim.
 *
 * É a mesma regra do backend (`TaskQuerySet.filtrar_prazo`), e tem que
 * ser: é ela que decide o que o servidor manda para cá.
 *
 * Dia inteiro não tem hora que valha, então o prazo vira o COMEÇO do
 * dia. Com a hora crua, uma tarefa criada clicando no calendário (meia-
 * noite) recebia "venceu" na primeira hora do próprio dia, e uma digitada
 * às 14h avisava "vence em 10 minutos" às 13h50 de um compromisso que
 * não tem horário.
 */
export function prazoDe(tarefa) {
  const bruto = tarefa.ends_at ?? tarefa.starts_at
  if (!bruto) return null
  const data = new Date(bruto)
  if (Number.isNaN(data.getTime())) return null
  return tarefa.all_day ? startOfDay(data) : data
}

/**
 * Em que etapa a tarefa está agora, ou `null` se nenhuma vale.
 *
 * Antes do prazo, é a etapa LIGADA mais recente que já começou. Isso cobre
 * o app que abre tarde: com 40 minutos para o prazo, o "1 dia" e o "1
 * hora" já passaram, mas só o "1 hora" é o momento presente. Disparar os
 * dois juntos seria avisar duas vezes a mesma coisa.
 *
 * Quem desligou o "10 minutos" e abre o app a 5 do prazo ainda recebe o
 * "1 hora": ele pediu para ser avisado, só não tão em cima.
 *
 * Dia inteiro só tem "1 dia" e "prazo" (véspera e o próprio dia): "vence
 * em 10 minutos" não faz sentido para o que não tem horário.
 */
export function etapaAtual(prazo, agora, { diaInteiro = false, ligadas = TODAS_AS_ETAPAS } = {}) {
  const falta = prazo.getTime() - agora

  if (falta <= 0) {
    return falta >= -TOLERANCIA_APOS_PRAZO && ligadas.has('prazo') ? 'prazo' : null
  }

  let atual = null
  for (const { id, antes } of ETAPAS) {
    if (id === 'prazo' || !ligadas.has(id)) continue
    if (diaInteiro && id !== '1d') continue
    if (falta <= antes) atual = id
  }
  return atual
}

/** "hoje", "amanhã", "ontem" ou o dia por extenso, relativo a `agora`. */
function nomeDoDia(data, agora) {
  if (isSameDay(data, agora)) return 'hoje'
  if (isSameDay(data, addDays(agora, 1))) return 'amanhã'
  if (isSameDay(data, addDays(agora, -1))) return 'ontem'
  return format(data, "EEEE, d 'de' MMM", { locale: ptBR })
}

/**
 * O que o aviso diz.
 *
 * Calculado na hora do disparo e guardado assim. Numa lista de
 * notificações a frase é a do momento em que ela chegou ("vence em 1
 * hora", recebida há 50 minutos), e por isso ela sempre carrega o
 * horário: sem ele, a frase velha não diria mais nada.
 */
export function textoDoAviso(prazo, agora, { diaInteiro = false } = {}) {
  const falta = prazo.getTime() - agora
  const dia = nomeDoDia(prazo, agora)
  const hora = format(prazo, 'HH:mm')

  if (diaInteiro) return `Vence ${dia}`

  if (falta <= 0) return dia === 'hoje' ? `Venceu às ${hora}` : `Venceu ${dia} às ${hora}`

  const minutos = Math.ceil(falta / MINUTO)
  if (minutos < 60) return `Vence em ${minutos} min, às ${hora}`
  if (minutos === 60) return `Vence em 1 hora, às ${hora}`

  return `Vence ${dia} às ${hora}`
}

/**
 * A identidade de um aviso.
 *
 * O prazo entra na chave de propósito: remarcar a tarefa é outro prazo, e
 * os avisos dele têm que poder sair de novo. Sem isso, adiar a entrega
 * para amanhã deixava a pessoa sem aviso nenhum, porque o "1 dia" já
 * tinha disparado para a data velha.
 */
export function chaveDoAviso(tarefaId, etapa, prazo) {
  return `${tarefaId}|${etapa}|${prazo.toISOString()}`
}

/**
 * Os avisos que ainda não saíram, para as tarefas dadas.
 *
 * `disparados` é o mapa `chave -> quando`, e é ele que impede o mesmo
 * aviso de sair duas vezes, inclusive entre duas janelas do app e depois
 * de fechar e abrir.
 */
export function avisosNovos(tarefas, { agora, disparados = {}, ligadas = TODAS_AS_ETAPAS }) {
  const novos = []
  for (const tarefa of tarefas) {
    const prazo = prazoDe(tarefa)
    if (!prazo) continue

    const diaInteiro = Boolean(tarefa.all_day)
    const etapa = etapaAtual(prazo, agora, { diaInteiro, ligadas })
    if (!etapa) continue

    const chave = chaveDoAviso(tarefa.id, etapa, prazo)
    if (disparados[chave]) continue

    novos.push({
      chave,
      tarefaId: tarefa.id,
      titulo: tarefa.title || 'Tarefa sem título',
      etapa,
      texto: textoDoAviso(prazo, agora, { diaInteiro }),
      criadoEm: agora,
    })
  }
  return novos
}

/**
 * Esquece os disparos velhos.
 *
 * Um disparo só serve enquanto o prazo dele pode voltar na busca, e a
 * busca não olha mais de um dia para trás. Três dias é folga; sem poda, o
 * mapa crescia a cada tarefa para sempre.
 */
export function podarDisparados(disparados, agora, retencao = 3 * DIA) {
  return Object.fromEntries(
    Object.entries(disparados).filter(([, quando]) => agora - quando < retencao),
  )
}

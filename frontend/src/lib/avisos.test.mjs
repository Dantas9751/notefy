import test from 'node:test'
import assert from 'node:assert/strict'

import {
  avisosNovos,
  chaveDoAviso,
  etapaAtual,
  janelaDeBusca,
  podarDisparados,
  prazoDe,
  textoDoAviso,
} from './avisos.js'

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

// Quinta, 24 de setembro de 2026, 14h no horário local.
const AGORA = new Date(2026, 8, 24, 14, 0).getTime()
const daqui = (ms) => new Date(AGORA + ms)

// ---------------------------------------------------------------- prazo

test('o prazo é o fim quando existe, e o início quando não', () => {
  assert.equal(
    prazoDe({ starts_at: '2026-09-24T10:00:00Z', ends_at: '2026-09-25T10:00:00Z' }).toISOString(),
    '2026-09-25T10:00:00.000Z',
  )
  assert.equal(prazoDe({ starts_at: '2026-09-24T10:00:00Z' }).toISOString(), '2026-09-24T10:00:00.000Z')
})

test('sem data nenhuma não há prazo', () => {
  assert.equal(prazoDe({}), null)
  assert.equal(prazoDe({ starts_at: null, ends_at: null }), null)
  assert.equal(prazoDe({ starts_at: 'lixo' }), null)
})

test('dia inteiro vence no começo do dia, qualquer que seja a hora gravada', () => {
  const prazo = prazoDe({ starts_at: new Date(2026, 8, 26, 14, 30).toISOString(), all_day: true })
  assert.equal(prazo.getHours(), 0)
  assert.equal(prazo.getMinutes(), 0)
  assert.equal(prazo.getDate(), 26)
})

// ---------------------------------------------------------------- etapa

test('cada etapa começa no seu momento', () => {
  assert.equal(etapaAtual(daqui(2 * DIA), AGORA), null)
  assert.equal(etapaAtual(daqui(DIA), AGORA), '1d')
  assert.equal(etapaAtual(daqui(5 * HORA), AGORA), '1d')
  assert.equal(etapaAtual(daqui(HORA), AGORA), '1h')
  assert.equal(etapaAtual(daqui(30 * MIN), AGORA), '1h')
  assert.equal(etapaAtual(daqui(10 * MIN), AGORA), '10m')
  assert.equal(etapaAtual(daqui(MIN), AGORA), '10m')
  assert.equal(etapaAtual(daqui(0), AGORA), 'prazo')
})

test('depois do prazo o aviso ainda sai por um dia, e depois não', () => {
  assert.equal(etapaAtual(daqui(-3 * HORA), AGORA), 'prazo')
  assert.equal(etapaAtual(daqui(-DIA), AGORA), 'prazo')
  assert.equal(etapaAtual(daqui(-DIA - MIN), AGORA), null)
})

test('app aberto tarde dispara só a etapa do momento, não as que passaram', () => {
  // 40 minutos antes: "1 dia" e "1 hora" já começaram, só "1 hora" vale.
  const tarefas = [{ id: 't1', title: 'Relatório', starts_at: daqui(40 * MIN).toISOString() }]
  const novos = avisosNovos(tarefas, { agora: AGORA })
  assert.deepEqual(novos.map((n) => n.etapa), ['1h'])
})

test('etapa desligada cede a vez para a ligada anterior', () => {
  // Desligou o "10 minutos" e abriu o app a 5 do prazo: pediu para ser
  // avisado, só não tão em cima. O "1 hora" ainda não saiu, então sai.
  const ligadas = new Set(['1d', '1h', 'prazo'])
  assert.equal(etapaAtual(daqui(5 * MIN), AGORA, { ligadas }), '1h')
})

test('prazo desligado não vira outro aviso depois que venceu', () => {
  const ligadas = new Set(['1d', '1h', '10m'])
  assert.equal(etapaAtual(daqui(-MIN), AGORA, { ligadas }), null)
})

test('tudo desligado, nada sai', () => {
  assert.equal(etapaAtual(daqui(5 * MIN), AGORA, { ligadas: new Set() }), null)
})

test('dia inteiro só tem véspera e o próprio dia', () => {
  const amanha = new Date(2026, 8, 25)
  // Às 14h da véspera faltam 10 horas para a meia-noite: é "1 dia".
  assert.equal(etapaAtual(amanha, AGORA, { diaInteiro: true }), '1d')
  // Às 23h55 da véspera seria "10 minutos" num compromisso com hora.
  const quaseMeiaNoite = new Date(2026, 8, 24, 23, 55).getTime()
  assert.equal(etapaAtual(amanha, quaseMeiaNoite, { diaInteiro: true }), '1d')
  // No próprio dia, de manhã, é o dia.
  const manhaDoDia = new Date(2026, 8, 25, 9, 0).getTime()
  assert.equal(etapaAtual(amanha, manhaDoDia, { diaInteiro: true }), 'prazo')
})

// ---------------------------------------------------------------- texto

test('texto com hora marcada', () => {
  assert.equal(textoDoAviso(daqui(10 * MIN), AGORA), 'Vence em 10 min, às 14:10')
  assert.equal(textoDoAviso(daqui(HORA), AGORA), 'Vence em 1 hora, às 15:00')
  assert.equal(textoDoAviso(daqui(3 * HORA), AGORA), 'Vence hoje às 17:00')
  assert.equal(textoDoAviso(daqui(DIA), AGORA), 'Vence amanhã às 14:00')
})

test('minutos quebrados arredondam para cima, nunca para zero', () => {
  // 30 segundos antes do prazo não é "vence em 0 min".
  assert.equal(textoDoAviso(daqui(30_000), AGORA), 'Vence em 1 min, às 14:00')
})

test('texto depois do prazo', () => {
  assert.equal(textoDoAviso(daqui(-2 * HORA), AGORA), 'Venceu às 12:00')
  assert.equal(textoDoAviso(daqui(-20 * HORA), AGORA), 'Venceu ontem às 18:00')
})

test('dia inteiro não fala de hora', () => {
  assert.equal(textoDoAviso(new Date(2026, 8, 25), AGORA, { diaInteiro: true }), 'Vence amanhã')
  assert.equal(textoDoAviso(new Date(2026, 8, 24), AGORA, { diaInteiro: true }), 'Vence hoje')
})

// ---------------------------------------------------------------- disparos

test('o mesmo aviso não sai duas vezes', () => {
  const tarefas = [{ id: 't1', title: 'Prova', starts_at: daqui(5 * MIN).toISOString() }]
  const primeira = avisosNovos(tarefas, { agora: AGORA })
  assert.equal(primeira.length, 1)

  const disparados = { [primeira[0].chave]: AGORA }
  assert.deepEqual(avisosNovos(tarefas, { agora: AGORA + MIN, disparados }), [])
})

test('a etapa seguinte sai mesmo com a anterior já disparada', () => {
  const inicio = daqui(15 * MIN).toISOString()
  const tarefas = [{ id: 't1', title: 'Prova', starts_at: inicio }]
  const hora = avisosNovos(tarefas, { agora: AGORA })
  assert.equal(hora[0].etapa, '1h')

  const disparados = { [hora[0].chave]: AGORA }
  const depois = avisosNovos(tarefas, { agora: AGORA + 6 * MIN, disparados })
  assert.equal(depois[0].etapa, '10m')
})

test('remarcar a tarefa rearma os avisos', () => {
  const prazoVelho = daqui(5 * MIN)
  const disparados = { [chaveDoAviso('t1', '10m', prazoVelho)]: AGORA }
  // Adiou em uma hora: o prazo é outro, então o aviso é outro.
  const tarefas = [{ id: 't1', title: 'Prova', starts_at: daqui(HORA + 5 * MIN).toISOString() }]
  const novos = avisosNovos(tarefas, { agora: AGORA + 10 * MIN, disparados })
  assert.equal(novos.length, 1)
  assert.equal(novos[0].etapa, '1h')
})

test('tarefa sem título ainda avisa, com um nome que se lê', () => {
  const tarefas = [{ id: 't1', title: '', starts_at: daqui(5 * MIN).toISOString() }]
  assert.equal(avisosNovos(tarefas, { agora: AGORA })[0].titulo, 'Tarefa sem título')
})

test('a poda esquece só o que é velho', () => {
  const podado = podarDisparados({ velho: AGORA - 4 * DIA, novo: AGORA - HORA }, AGORA)
  assert.deepEqual(Object.keys(podado), ['novo'])
})

test('a janela de busca cobre a tolerância para trás e dois dias à frente', () => {
  const { due_after, due_before } = janelaDeBusca(AGORA)
  assert.equal(new Date(due_after).getTime(), AGORA - DIA)
  assert.equal(new Date(due_before).getTime(), AGORA + 2 * DIA)
})

test('dia inteiro de depois de amanhã já avisa na véspera', () => {
  // A razão da janela de dois dias: marcada para o dia 26 às 14h, com o
  // prazo puxado para a meia-noite do 26, o "1 dia" começa na meia-noite
  // do 25. Uma busca de só um dia à frente, feita no 25 à 00h01, não a
  // traria (14h do 26 está a mais de 24h).
  const naVespera = new Date(2026, 8, 25, 0, 1).getTime()
  const tarefa = {
    id: 't1',
    title: 'Entrega',
    starts_at: new Date(2026, 8, 26, 14, 0).toISOString(),
    all_day: true,
  }
  const { due_before } = janelaDeBusca(naVespera)
  assert.ok(new Date(tarefa.starts_at) <= new Date(due_before))
  assert.equal(avisosNovos([tarefa], { agora: naVespera })[0].texto, 'Vence amanhã')
})

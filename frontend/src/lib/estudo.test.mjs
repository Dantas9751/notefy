import test from 'node:test'
import assert from 'node:assert/strict'

import {
  OCIOSO_MS,
  chaveDoDia,
  chaveDosDocumentos,
  deveContar,
  documentoAberto,
  formatarDuracao,
  marcarDocumentoAberto,
  rankingDoDia,
  somarSegundo,
} from './estudo.js'

test('a chave do dia usa a data local, não UTC', () => {
  // 22h em Brasília (UTC-3) já é o dia seguinte em UTC. O tempo tem que
  // cair no dia que a pessoa viveu, não no do meridiano.
  const noite = new Date(2026, 8, 19, 22, 30)
  assert.equal(chaveDoDia(noite), 'notefy.estudo.2026-09-19')
})

test('mês e dia vêm com dois dígitos', () => {
  assert.equal(chaveDoDia(new Date(2026, 0, 5)), 'notefy.estudo.2026-01-05')
})

test('conta com o app visível e atividade recente', () => {
  const agora = 1_000_000
  assert.equal(deveContar({ visivel: true, ultimaAtividade: agora - 5_000, agora }), true)
})

test('para quando o app sai da frente', () => {
  const agora = 1_000_000
  assert.equal(deveContar({ visivel: false, ultimaAtividade: agora, agora }), false)
})

test('para depois do limite de ociosidade', () => {
  const agora = 1_000_000
  assert.equal(
    deveContar({ visivel: true, ultimaAtividade: agora - OCIOSO_MS - 1, agora }),
    false,
  )
})

test('pausa manual vence tudo', () => {
  const agora = 1_000_000
  assert.equal(
    deveContar({ visivel: true, ultimaAtividade: agora, agora, pausado: true }),
    false,
  )
})

test('duração: segundos só abaixo de um minuto', () => {
  assert.equal(formatarDuracao(0), '0s')
  assert.equal(formatarDuracao(45), '45s')
  assert.equal(formatarDuracao(60), '1m')
  assert.equal(formatarDuracao(59 * 60 + 59), '59m')
})

test('duração: a partir de uma hora os minutos vêm com dois dígitos', () => {
  assert.equal(formatarDuracao(3600), '1h 00m')
  assert.equal(formatarDuracao(2 * 3600 + 14 * 60 + 30), '2h 14m')
})

test('duração: valor negativo ou quebrado não quebra a tela', () => {
  assert.equal(formatarDuracao(-5), '0s')
  assert.equal(formatarDuracao(90.9), '1m')
})

// --------------------------------------------------------------------------
// Rateio por documento
// --------------------------------------------------------------------------

test('a chave dos documentos acompanha o dia local', () => {
  const noite = new Date(2026, 8, 19, 22, 30)
  assert.equal(chaveDosDocumentos(noite), 'notefy.estudo.2026-09-19.docs')
})

test('somar um segundo cria a entrada com título e tipo', () => {
  const mapa = somarSegundo({}, { id: 'a', titulo: 'Cálculo III', kind: 'note' })
  assert.deepEqual(mapa, { a: { s: 1, titulo: 'Cálculo III', kind: 'note' } })
})

test('somar acumula no mesmo documento sem tocar nos outros', () => {
  let mapa = somarSegundo({}, { id: 'a', titulo: 'A', kind: 'note' })
  mapa = somarSegundo(mapa, { id: 'b', titulo: 'B', kind: 'file' })
  mapa = somarSegundo(mapa, { id: 'a', titulo: 'A', kind: 'note' })
  assert.equal(mapa.a.s, 2)
  assert.equal(mapa.b.s, 1)
})

test('documento renomeado no meio do dia mantém o tempo já contado', () => {
  let mapa = somarSegundo({}, { id: 'a', titulo: 'Rascunho', kind: 'note' })
  mapa = somarSegundo(mapa, { id: 'a', titulo: 'Cálculo III', kind: 'note' })
  assert.equal(mapa.a.s, 2)
  assert.equal(mapa.a.titulo, 'Cálculo III')
})

test('sem documento aberto o mapa não muda de identidade', () => {
  // Um objeto novo por segundo faria o painel repintar à toa.
  const mapa = { a: { s: 3, titulo: 'A', kind: 'note' } }
  assert.equal(somarSegundo(mapa, null), mapa)
})

test('o ranking vem do maior para o menor e corta no limite', () => {
  const mapa = {
    a: { s: 10, titulo: 'A', kind: 'note' },
    b: { s: 90, titulo: 'B', kind: 'note' },
    c: { s: 50, titulo: 'C', kind: 'note' },
  }
  assert.deepEqual(
    rankingDoDia(mapa, 2).map((i) => i.id),
    ['b', 'c'],
  )
})

test('o ranking ignora documentos com zero segundo', () => {
  const mapa = { a: { s: 0, titulo: 'A', kind: 'note' } }
  assert.deepEqual(rankingDoDia(mapa), [])
})

test('marcar e limpar o documento aberto', () => {
  marcarDocumentoAberto({ id: 'x', title: 'Nota', kind: 'note' })
  assert.deepEqual(documentoAberto(), { id: 'x', titulo: 'Nota', kind: 'note' })
  marcarDocumentoAberto(null)
  assert.equal(documentoAberto(), null)
})

test('documento sem id não vira dono de tempo nenhum', () => {
  // O editor de um documento NOVO ainda não tem id: creditar segundos a
  // `undefined` juntaria numa entrada fantasma o tempo de todo rascunho.
  marcarDocumentoAberto({ title: 'Sem id ainda', kind: 'note' })
  assert.equal(documentoAberto(), null)
})

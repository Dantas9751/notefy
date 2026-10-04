/**
 * Os modelos que vêm com o app passariam na validação do servidor?
 *
 * As regras abaixo são o ESPELHO das de `backend/content/schemas.py` que
 * um modelo pode quebrar (tipo de seção, id repetido, aresta órfã, coluna
 * repetida). Quem mexer num modelo e errar o formato descobre aqui, e não
 * quando o "Criar" voltar 400 na mão de alguém.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODELOS_PRONTOS, modeloPronto, resumoDoModelo } from './modelos.js'

const SECOES = new Set(['text', 'code', 'checklist', 'table'])
const repetidos = (lista) => lista.filter((x, i) => lista.indexOf(x) !== i)

test('cada modelo tem id único, nome, descrição e título', () => {
  assert.deepEqual(repetidos(MODELOS_PRONTOS.map((m) => m.id)), [])
  for (const m of MODELOS_PRONTOS) {
    assert.ok(m.id.startsWith('notefy:'), m.id)
    assert.ok(m.nome && m.descricao && m.titulo(), m.id)
    assert.ok(['note', 'spreadsheet', 'diagram', 'canvas'].includes(m.kind), m.id)
  }
})

test('notas: seções conhecidas, ids únicos e checklist com itens', () => {
  for (const m of MODELOS_PRONTOS.filter((x) => x.kind === 'note')) {
    const { sections } = m.dados()
    assert.ok(sections.length > 0, m.id)
    assert.deepEqual(repetidos(sections.map((s) => s.id)), [], m.id)
    for (const s of sections) {
      assert.ok(SECOES.has(s.type), `${m.id}: ${s.type}`)
      if (s.type === 'checklist') assert.ok(s.items.every((i) => i.id && typeof i.text === 'string'), m.id)
      if (s.type === 'table') assert.ok(s.rows.every((r) => r.every((c) => typeof c === 'string')), m.id)
      if (s.type === 'text') assert.equal(typeof s.html, 'string', m.id)
    }
  }
})

test('dois usos do mesmo modelo não dividem id de seção', () => {
  const a = modeloPronto('notefy:reuniao').dados().sections.map((s) => s.id)
  const b = modeloPronto('notefy:reuniao').dados().sections.map((s) => s.id)
  assert.deepEqual(a.filter((id) => b.includes(id)), [])
})

test('planilhas: colunas com id único e linhas com id', () => {
  for (const m of MODELOS_PRONTOS.filter((x) => x.kind === 'spreadsheet')) {
    const { columns, rows } = m.dados()
    assert.deepEqual(repetidos(columns.map((c) => c.id)), [], m.id)
    assert.ok(rows.every((r) => r.id && typeof r.cells === 'object'), m.id)
    const ids = new Set(columns.map((c) => c.id))
    assert.ok(rows.every((r) => Object.keys(r.cells).every((k) => ids.has(k))), m.id)
  }
})

test('quadros: toda aresta liga dois nós que existem', () => {
  for (const m of MODELOS_PRONTOS.filter((x) => x.kind === 'diagram' || x.kind === 'canvas')) {
    const { nodes, edges } = m.dados()
    const ids = new Set(nodes.map((n) => n.id))
    assert.equal(ids.size, nodes.length, m.id)
    assert.ok(edges.every((e) => ids.has(e.from) && ids.has(e.to)), m.id)
  }
})

test('o resumo do cartão sai do conteúdo', () => {
  assert.match(resumoDoModelo('note', modeloPronto('notefy:aula').dados()), /\S/)
  assert.match(resumoDoModelo('spreadsheet', modeloPronto('notefy:notas').dados()), /·/)
  assert.equal(modeloPronto('nao-existe'), null)
})

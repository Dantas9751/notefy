import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeDocumento, mergeGrafo, mergeNotaTexto, mergePlanilha } from './merge.js'

/* ------------------------------------------------------------------ */
/* mergeGrafo — canvas e diagrama                                     */
/* ------------------------------------------------------------------ */

test('canvas vazio recebe todo o conteúdo novo', () => {
  const atual = { nodes: [], edges: [] }
  const novo = {
    nodes: [
      { id: 'n1', type: 'sticky', text: 'Pizza', x: 0, y: 0 },
      { id: 'n2', type: 'sticky', text: 'Origem', x: 200, y: 0 },
    ],
    edges: [{ id: 'e1', type: 'default', from: 'n1', to: 'n2' }],
  }
  const r = mergeGrafo(atual, novo)
  assert.equal(r.nodes.length, 2)
  assert.equal(r.edges.length, 1)
})

test('ids que colidem são renumerados, não descartados', () => {
  // O caso real: IA sempre devolve "n1", "n2"... Numa segunda geração
  // colide com o que já está no quadro. O merge por id simples
  // DESCARTAVA os novos — "Quadro criado" e nada aparecendo.
  const atual = {
    nodes: [{ id: 'n1', type: 'sticky', text: 'antigo' }],
    edges: [],
  }
  const novo = {
    nodes: [
      { id: 'n1', type: 'sticky', text: 'Pizza' },
      { id: 'n2', type: 'sticky', text: 'História' },
    ],
    edges: [],
  }
  const r = mergeGrafo(atual, novo)
  assert.equal(r.nodes.length, 3, 'os dois novos devem entrar')
  assert.ok(r.nodes.some((n) => n.text === 'antigo'), 'o antigo permanece')
  assert.ok(r.nodes.some((n) => n.text === 'Pizza'), 'o novo entra')
})

test('edges seguem os nodes renumerados', () => {
  const atual = {
    nodes: [{ id: 'n1', type: 'sticky', text: 'antigo' }],
    edges: [],
  }
  const novo = {
    nodes: [
      { id: 'n1', type: 'sticky', text: 'Pizza' },
      { id: 'n2', type: 'sticky', text: 'História' },
    ],
    // A aresta aponta de "n1"(colidiu->renumerado) para "n2"
    edges: [{ id: 'e1', type: 'default', from: 'n1', to: 'n2' }],
  }
  const r = mergeGrafo(atual, novo)
  const pizza = r.nodes.find((n) => n.text === 'Pizza')
  const historia = r.nodes.find((n) => n.text === 'História')
  const edge = r.edges[0]
  assert.equal(edge.from, pizza.id, 'aresta aponta para o id renumerado')
  assert.equal(edge.to, historia.id)
  // E a aresta não pode ficar órfã
  const ids = new Set(r.nodes.map((n) => n.id))
  assert.ok(ids.has(edge.from) && ids.has(edge.to))
})

test('merge repetido não cresce sem limite (sem duplicar)', () => {
  const node = { id: 'n1', type: 'sticky', text: 'Pizza' }
  let doc = { nodes: [], edges: [] }
  for (let i = 0; i < 3; i += 1) {
    doc = mergeGrafo(doc, { nodes: [structuredClone(node)], edges: [] })
  }
  assert.equal(doc.nodes.length, 3, 'cada geração entra uma vez, com id próprio')
  assert.equal(new Set(doc.nodes.map((n) => n.id)).size, 3, 'ids únicos')
})

test('strokes do canvas sobrevivem ao merge', () => {
  const atual = {
    nodes: [],
    edges: [],
    strokes: [{ id: 's1', points: [[0, 0]] }],
  }
  const r = mergeGrafo(atual, { nodes: [{ id: 'n1', text: 'x' }], edges: [] })
  assert.deepEqual(r.strokes, atual.strokes)
})

test('bloco novo nasce AO LADO do existente, nunca por cima', () => {
  // O caso do log: "crie um mapa mental sobre paes" num canvas que já
  // tinha o mapa de pizza — a IA gera tudo perto de (0,0) e sem o
  // deslocamento os dois mapas se embaralham.
  const atual = {
    nodes: [
      { id: 'a1', type: 'sticky', x: 0, y: 0, w: 180, h: 90, text: 'Pizza' },
      { id: 'a2', type: 'sticky', x: 240, y: 140, w: 180, h: 90, text: 'Origem' },
    ],
    edges: [],
  }
  const novo = {
    nodes: [
      { id: 'n1', type: 'sticky', x: 0, y: 0, w: 180, h: 90, text: 'Paes' },
      { id: 'n2', type: 'sticky', x: 240, y: 140, w: 180, h: 90, text: 'Fermento' },
    ],
    edges: [],
  }
  const r = mergeGrafo(atual, novo)
  assert.equal(r.nodes.length, 4)

  const paes = r.nodes.find((n) => n.text === 'Paes')
  const pizza = r.nodes.find((n) => n.text === 'Pizza')
  const origem = r.nodes.find((n) => n.text === 'Origem')

  // O novo começa DEPOIS da borda direita do existente (Pizza termina em x=180).
  assert.ok(
    paes.x >= 180,
    `Paes em x=${paes.x} sobrepõe o bloco antigo que vai até x=180`,
  )
  // E alinhado pelo topo do bloco existente.
  assert.equal(paes.y, 0)
  // Deslocamento relativo dentro do bloco novo preservado.
  const fermento = r.nodes.find((n) => n.text === 'Fermento')
  assert.equal(fermento.x - paes.x, 240)
  assert.equal(fermento.y - paes.y, 140)
  // Antigos intactos.
  assert.equal(pizza.x, 0)
  assert.equal(origem.x, 240)
})

test('canvas vazio não aplica deslocamento', () => {
  const r = mergeGrafo({ nodes: [], edges: [] }, {
    nodes: [{ id: 'n1', type: 'sticky', x: 40, y: 60, text: 'x' }],
    edges: [],
  })
  assert.equal(r.nodes[0].x, 40)
  assert.equal(r.nodes[0].y, 60)
})

test('edge órfã não entra no resultado', () => {
  const atual = { nodes: [], edges: [] }
  const novo = {
    nodes: [{ id: 'n1', text: 'sozinho' }],
    edges: [{ id: 'e1', from: 'n1', to: 'fantasma' }],
  }
  const r = mergeGrafo(atual, novo)
  assert.equal(r.edges.length, 0)
})

/* ------------------------------------------------------------------ */
/* mergePlanilha                                                      */
/* ------------------------------------------------------------------ */

test('planilha soma linhas novas mantendo as antigas', () => {
  const atual = {
    columns: [{ id: 'c1', name: 'Nome', type: 'text' }],
    rows: [{ id: 'r1', cells: { c1: 'Ana' } }],
  }
  const novo = {
    columns: [{ id: 'c1', name: 'Nome', type: 'text' }],
    rows: [{ id: 'r1', cells: { c1: 'Ana' } }, { id: 'r2', cells: { c1: 'Bia' } }],
  }
  const r = mergePlanilha(atual, novo)
  assert.equal(r.rows.length, 2)
  assert.ok(r.rows.some((row) => row.cells.c1 === 'Bia'))
})

test('planilha: coluna nova com id colidido é renumerada e as células a seguem', () => {
  const atual = {
    columns: [{ id: 'c1', name: 'Nome', type: 'text' }],
    rows: [{ id: 'r1', cells: { c1: 'Ana' } }],
  }
  const novo = {
    columns: [{ id: 'c1', name: 'Nota', type: 'number' }],
    rows: [{ id: 'r9', cells: { c1: 9 } }],
  }
  const r = mergePlanilha(atual, novo)
  assert.equal(r.columns.length, 2)
  const nota = r.columns.find((c) => c.name === 'Nota')
  const linhaNova = r.rows.find((row) => row.id === 'r9')
  assert.equal(linhaNova.cells[nota.id], 9, 'célula aponta para o id renumerado')
  // Linha antiga intacta
  assert.equal(r.rows.find((row) => row.id === 'r1').cells.c1, 'Ana')
})

/* ------------------------------------------------------------------ */
/* mergeDocumento                                                     */
/* ------------------------------------------------------------------ */

test('substituir: true troca tudo (regenerar)', () => {
  const atual = { nodes: [{ id: 'n1', text: 'velho' }], edges: [] }
  const novo = { nodes: [{ id: 'n1', text: 'novo' }], edges: [] }
  const r = mergeDocumento('canvas', atual, novo, { substituir: true })
  assert.equal(r.nodes.length, 1)
  assert.equal(r.nodes[0].text, 'novo')
})

test('nota substitui (não faz sentido somar texto solto)', () => {
  const atual = { sections: [{ id: 's1', html: '<p>velho</p>' }] }
  const novo = { sections: [{ id: 's1', html: '<p>novo</p>' }] }
  const r = mergeDocumento('note', atual, novo)
  assert.equal(r.sections[0].html, '<p>novo</p>')
})

/* ------------------------------------------------------------------ */
/* mergeNotaTexto                                                     */
/* ------------------------------------------------------------------ */

test('texto da IA entra como seção nova no fim da nota', () => {
  const atual = { sections: [{ id: 's1', type: 'text', html: '<p>original</p>' }] }
  const r = mergeNotaTexto(atual, 'Conteúdo gerado.')
  assert.equal(r.sections.length, 2)
  assert.equal(r.sections[0].html, '<p>original</p>')
  assert.match(r.sections[1].html, /Conteúdo gerado\./)
})

test('parágrafos separados por linha em branco viram blocos próprios', () => {
  const r = mergeNotaTexto({ sections: [] }, 'Parágrafo um.\n\nParágrafo dois.')
  const html = r.sections[0].html
  assert.match(html, /^<p>Parágrafo um\.<\/p><p>Parágrafo dois\.<\/p>$/)
})

test('HTML do texto é escapado (o conteúdo é dado, não marcação)', () => {
  const r = mergeNotaTexto({ sections: [] }, 'Use <b> e & aqui.')
  assert.ok(r.sections[0].html.includes('&lt;b&gt;'))
  assert.ok(r.sections[0].html.includes('&amp;'))
})

test('texto vazio não cria seção', () => {
  const atual = { sections: [{ id: 's1', html: '<p>x</p>' }] }
  assert.equal(mergeNotaTexto(atual, '').sections.length, 1)
})

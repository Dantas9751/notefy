/**
 * A página da nota: a regra "sempre há texto entre blocos" e as operações
 * que a mantêm. Sem navegador, porque tudo aqui é dado.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  atalhoMarkdown,
  consultaDaBarra,
  duplicarBloco,
  ehDivisor,
  filtrarComandos,
  htmlVazio,
  inserirBloco,
  juntarHtml,
  moverBloco,
  normalizar,
  removerSecao,
} from './nota.js'

const txt = (id, html = '') => ({ id, type: 'text', html })
const lista = (id) => ({ id, type: 'checklist', items: [{ id: `${id}i`, text: 'a', done: false }] })
const tabela = (id) => ({ id, type: 'table', rows: [['a', 'b'], ['', '']] })
// X texto com conteúdo, _ texto vazio, C checklist, B tabela.
const tipos = (pagina) =>
  pagina.map((s) => ({ checklist: 'C', table: 'B', code: 'K' })[s.type] ?? (s.html ? 'X' : '_'))

test('nota vazia vira uma página com um texto', () => {
  assert.deepEqual(normalizar([]), [{ id: 's1', type: 'text', html: '' }])
  assert.deepEqual(normalizar(null), [{ id: 's1', type: 'text', html: '' }])
})

test('sempre há texto antes, entre e depois dos blocos', () => {
  const pagina = normalizar([lista('c1'), tabela('b1')])
  assert.deepEqual(tipos(pagina), ['_', 'C', '_', 'B', '_'])
})

test('os textos criados têm id estável entre renders', () => {
  const secoes = [lista('c1')]
  assert.deepEqual(
    normalizar(secoes).map((s) => s.id),
    normalizar(secoes).map((s) => s.id),
  )
})

test('o id criado não repete um que já existe', () => {
  const pagina = normalizar([txt('t-c1', 'x'), lista('c2'), lista('c1')])
  const ids = pagina.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('textos vizinhos viram um só, sem linha em branco no meio', () => {
  const pagina = normalizar([txt('a', '<p>um</p>'), txt('b', ''), txt('c', '<p>dois</p>')])
  assert.deepEqual(pagina, [{ id: 'a', type: 'text', html: '<p>um</p><p>dois</p>' }])
})

test('seção sem id ganha um, e sempre o mesmo', () => {
  const secoes = [{ type: 'checklist', items: [] }]
  const [, bloco] = normalizar(secoes)
  assert.ok(bloco.id)
  assert.equal(normalizar(secoes)[1].id, bloco.id)
})

test('inserir no cursor divide o texto em antes, bloco e depois', () => {
  const pagina = normalizar([txt('a', '<p>um</p><p>dois</p>')])
  const proxima = inserirBloco(pagina, 0, { antes: '<p>um</p>', depois: '<p>dois</p>' }, lista('c1'))
  assert.deepEqual(tipos(proxima), ['X', 'C', 'X'])
  assert.equal(proxima[0].id, 'a', 'o texto de antes continua sendo o mesmo editor')
  assert.equal(proxima[2].html, '<p>dois</p>')
})

test('remover um bloco junta o texto de cima com o de baixo', () => {
  const pagina = normalizar([txt('a', '<p>um</p>'), lista('c1'), txt('b', '<p>dois</p>')])
  const proxima = removerSecao(pagina, 1)
  assert.deepEqual(proxima, [{ id: 'a', type: 'text', html: '<p>um</p><p>dois</p>' }])
})

test('subir um bloco passa por cima do texto e não fica preso em linha vazia', () => {
  let pagina = normalizar([txt('a', '<p>um</p>'), lista('c1'), txt('b', '<p>dois</p>'), tabela('t1')])
  assert.deepEqual(tipos(pagina), ['X', 'C', 'X', 'B', '_'])
  pagina = moverBloco(pagina, 3, -1)
  assert.deepEqual(tipos(pagina), ['X', 'C', '_', 'B', 'X'])
  pagina = moverBloco(pagina, 3, -1)
  assert.deepEqual(tipos(pagina), ['X', 'B', '_', 'C', 'X'])
  assert.deepEqual(pagina.filter((s) => s.type !== 'text').map((s) => s.id), ['t1', 'c1'])
})

test('descer um bloco passa por baixo do texto seguinte', () => {
  const pagina = normalizar([lista('c1'), txt('b', '<p>dois</p>')])
  const proxima = moverBloco(pagina, 1, 1)
  assert.deepEqual(proxima.map((s) => s.type), ['text', 'checklist', 'text'])
  assert.equal(proxima[0].html, '<p>dois</p>')
})

test('no topo ou no fim, mover não faz nada', () => {
  const pagina = normalizar([lista('c1')])
  assert.equal(moverBloco(pagina, 1, -1), pagina)
  assert.equal(moverBloco(pagina, 1, 1), pagina)
})

test('duplicar copia com ids novos', () => {
  const pagina = normalizar([lista('c1')])
  const proxima = duplicarBloco(pagina, 1)
  const blocos = proxima.filter((s) => s.type === 'checklist')
  assert.equal(blocos.length, 2)
  assert.notEqual(blocos[0].id, blocos[1].id)
  assert.notEqual(blocos[0].items[0].id, blocos[1].items[0].id)
  assert.equal(blocos[1].items[0].text, 'a')
})

test('html vazio e junção', () => {
  assert.equal(htmlVazio('<p><br></p>'), true)
  assert.equal(htmlVazio('<p>&nbsp;</p>'), true)
  assert.equal(htmlVazio('<p><img src="x"></p>'), false)
  assert.equal(htmlVazio('<hr>'), false)
  assert.equal(juntarHtml('<p><br></p>', '<p>b</p>'), '<p>b</p>')
  assert.equal(juntarHtml('<p>a</p>', ''), '<p>a</p>')
  // Texto solto embaixo ganha um bloco: senão as duas linhas grudam.
  assert.equal(juntarHtml('antes', 'depois'), 'antes<div>depois</div>')
  assert.equal(juntarHtml('antes', '<p>depois</p>'), 'antes<p>depois</p>')
})

test('atalhos de Markdown só valem no começo da linha', () => {
  assert.deepEqual(atalhoMarkdown('[] '), { bloco: 'checklist' })
  assert.deepEqual(atalhoMarkdown('[ ] '), { bloco: 'checklist' })
  assert.deepEqual(atalhoMarkdown('[x] '), { bloco: 'checklist', feito: true })
  assert.deepEqual(atalhoMarkdown('```'), { bloco: 'code' })
  assert.deepEqual(atalhoMarkdown('## '), { formato: 'h2' })
  assert.deepEqual(atalhoMarkdown('- '), { lista: 'insertUnorderedList' })
  assert.deepEqual(atalhoMarkdown('1. '), { lista: 'insertOrderedList' })
  assert.deepEqual(atalhoMarkdown('>\u00a0'), { formato: 'blockquote' })
  assert.equal(atalhoMarkdown('comprar [] '), null)
  assert.equal(atalhoMarkdown('#### '), null)
  assert.equal(atalhoMarkdown('-'), null)
})

test('divisor no Enter', () => {
  assert.equal(ehDivisor('---'), true)
  assert.equal(ehDivisor(' *** '), true)
  assert.equal(ehDivisor('--'), false)
  assert.equal(ehDivisor('a---'), false)
})

test('a barra abre no começo ou depois de espaço, e lê o que vem depois', () => {
  assert.equal(consultaDaBarra('/'), '')
  assert.equal(consultaDaBarra('texto /tab'), 'tab')
  assert.equal(consultaDaBarra('/lista n'), 'lista n')
  assert.equal(consultaDaBarra('e/ou'), null)
  assert.equal(consultaDaBarra('https://exemplo'), null)
})

test('filtro do menu: começo do nome, depois sinônimo, sem acento', () => {
  assert.equal(filtrarComandos('tab')[0].id, 'table')
  assert.equal(filtrarComandos('codigo')[0].id, 'code')
  assert.equal(filtrarComandos('todo')[0].id, 'checklist')
  assert.equal(filtrarComandos('titulo').length >= 3, true)
  assert.deepEqual(filtrarComandos('zzz'), [])
  assert.equal(filtrarComandos('  ').length, 14)
})

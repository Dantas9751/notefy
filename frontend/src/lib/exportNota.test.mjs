import test from 'node:test'
import assert from 'node:assert/strict'

import { buildNoteHtml, buildNoteMarkdown, larguraDaTabela } from './exportNota.js'

const nota = (...sections) => ({ title: 'Aula', data: { sections } })

// --------------------------------------------------------------------------
// Checklist
// --------------------------------------------------------------------------

test('checklist vira a sintaxe de tarefa do Markdown', () => {
  // `- [x]` é o que o GitHub e o Obsidian reconhecem: colado lá, o item
  // continua sendo uma caixinha em vez de virar um traço de texto.
  const md = buildNoteMarkdown(
    nota({
      id: 's1',
      type: 'checklist',
      items: [
        { id: 'i1', text: 'Ler o capítulo', done: true },
        { id: 'i2', text: 'Fazer a lista', done: false },
      ],
    }),
  )
  assert.equal(md, '- [x] Ler o capítulo\n- [ ] Fazer a lista')
})

test('checklist em HTML sai com caixas marcadas e desmarcadas', () => {
  const html = buildNoteHtml(
    nota({
      id: 's1',
      type: 'checklist',
      items: [{ id: 'i1', text: 'Revisar', done: true }],
    }),
  )
  assert.ok(html.includes('checked'))
  assert.ok(html.includes('Revisar'))
})

// --------------------------------------------------------------------------
// Tabela
// --------------------------------------------------------------------------

test('a largura é a da linha mais larga', () => {
  assert.equal(larguraDaTabela([['a'], ['b', 'c', 'd'], ['e', 'f']]), 3)
  assert.equal(larguraDaTabela([]), 0)
})

test('tabela em Markdown tem separador do tamanho do cabeçalho', () => {
  // Separador com um número de colunas diferente do cabeçalho faz o
  // renderizador desistir e imprimir os pipes como texto.
  const md = buildNoteMarkdown(
    nota({ id: 's1', type: 'table', rows: [['Autor', 'Obra'], ['Machado', 'Dom Casmurro']] }),
  )
  const linhas = md.split('\n')
  assert.equal(linhas[0], '| Autor | Obra |')
  assert.equal(linhas[1], '| --- | --- |')
  assert.equal(linhas[2], '| Machado | Dom Casmurro |')
})

test('linha curta ganha célula vazia em vez de desalinhar a tabela', () => {
  const md = buildNoteMarkdown(
    nota({ id: 's1', type: 'table', rows: [['a', 'b', 'c'], ['só uma']] }),
  )
  assert.equal(md.split('\n')[2], '| só uma |  |  |')
})

test('pipe dentro da célula é escapado', () => {
  // Sem escape ele fecharia a coluna no meio, e a linha inteira sairia
  // deslocada uma coluna para a direita.
  const md = buildNoteMarkdown(
    nota({ id: 's1', type: 'table', rows: [['a|b', 'c']] }),
  )
  assert.ok(md.startsWith('| a\\|b | c |'))
})

test('tabela vazia não vira um separador solto', () => {
  assert.equal(buildNoteMarkdown(nota({ id: 's1', type: 'table', rows: [] })), '')
  assert.ok(!buildNoteHtml(nota({ id: 's1', type: 'table', rows: [] })).includes('<table>'))
})

test('a primeira linha vira cabeçalho no HTML', () => {
  const html = buildNoteHtml(
    nota({ id: 's1', type: 'table', rows: [['Termo'], ['BFS']] }),
  )
  assert.ok(html.includes('<th>Termo</th>'))
  assert.ok(html.includes('<td>BFS</td>'))
})

test('conteúdo de célula é escapado no HTML', () => {
  const html = buildNoteHtml(
    nota({ id: 's1', type: 'table', rows: [['<script>x</script>'], ['ok']] }),
  )
  assert.ok(!html.includes('<script>'))
})

// --------------------------------------------------------------------------
// Convivência dos quatro tipos
// --------------------------------------------------------------------------

test('os quatro tipos saem na ordem em que estão na nota', () => {
  const md = buildNoteMarkdown(
    nota(
      { id: 's1', type: 'text', html: '<p>Resumo</p>' },
      { id: 's2', type: 'code', language: 'python', code: 'print(1)' },
      { id: 's3', type: 'checklist', items: [{ id: 'i1', text: 'Revisar' }] },
      { id: 's4', type: 'table', rows: [['x', 'y']] },
    ),
  )
  const posicoes = ['Resumo', 'print(1)', '- [ ] Revisar', '| x | y |'].map((t) =>
    md.indexOf(t),
  )
  assert.ok(posicoes.every((p) => p >= 0), md)
  assert.deepEqual(posicoes, [...posicoes].sort((a, b) => a - b))
})

test('seção de tipo desconhecido não derruba a exportação', () => {
  // Vinda de uma versão futura, ou de um backup: cai no ramo de texto e
  // sai vazia, em vez de lançar e cancelar o arquivo inteiro.
  const md = buildNoteMarkdown(nota({ id: 's1', type: 'video', src: 'x' }))
  assert.equal(md, '')
})

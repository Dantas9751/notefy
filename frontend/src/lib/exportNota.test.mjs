import test from 'node:test'
import assert from 'node:assert/strict'

import { buildNoteHtml, buildNoteMarkdown, decodificarEntidades, embutirImagens, embutirImagensDaNota, htmlToMarkdown, larguraDaTabela } from './exportNota.js'

// Sem título: os testes de cada seção olham só o corpo (o título tem teste próprio).
const nota = (...sections) => ({ title: '', data: { sections } })

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

// --------------------------------------------------------------------------
// Título e texto rico
// --------------------------------------------------------------------------

test('o título da nota abre o .md e o .html, como no PDF', () => {
  const doc = { title: 'Aula 3', data: { sections: [{ id: 's1', type: 'text', html: 'oi' }] } }
  assert.equal(buildNoteMarkdown(doc), '# Aula 3\n\noi')
  assert.ok(buildNoteHtml(doc).includes('<h1 class="titulo">Aula 3</h1>'))
  assert.equal(buildNoteMarkdown({ title: '  ', data: { sections: [] } }), '')
})

test('o HTML do editor (linhas em div) vira parágrafos, e o título fica em linha própria', () => {
  // Exatamente o que o contenteditable do Chromium grava: a primeira linha
  // solta e as seguintes em <div>, aninhadas.
  const html = 'Primeira linha.<div>Segunda linha.</div><h1>Título</h1><div><ul><li>a</li><li>b</li></ul><div><ol><li>um</li><li>dois</li></ol><div><b>forte</b> fim</div></div></div>'
  assert.equal(htmlToMarkdown(html), 'Primeira linha.\n\nSegunda linha.\n\n# Título\n\n- a\n- b\n\n1. um\n2. dois\n\n**forte** fim')
})

test('lista aninhada recua sob o item; citação, link e imagem no formato do Markdown', () => {
  assert.equal(htmlToMarkdown('<ol><li>x<ul><li>y</li></ul></li></ol>'), '1. x\n   - y')
  // O <br> vira quebra forçada (dois espaços no fim): sem ela, "uma" e "duas" se juntariam.
  assert.equal(htmlToMarkdown('<blockquote>uma<br>duas</blockquote>depois'), '> uma  \n> duas\n\ndepois')
  assert.equal(htmlToMarkdown('ver <a href="https://a.b">o site</a> e <a href="https://c.d">https://c.d</a>'), 'ver [o site](https://a.b) e <https://c.d>')
  assert.equal(htmlToMarkdown('<div><img src="http://x/m/a.png" alt="foto"></div>'), '![foto](http://x/m/a.png)')
})

test('marca vazia some, espaço sai da marca, linha vazia do editor não sobra', () => {
  assert.equal(htmlToMarkdown('a<b></b>b<div><b><br></b></div><div>c</div>'), 'ab\n\nc')
  assert.equal(htmlToMarkdown('<b>negrito </b>depois'), '**negrito** depois')
})

test('entidades viram o caractere; o espaço duro, espaço comum', () => {
  assert.equal(decodificarEntidades('a&nbsp;b &amp; &lt;c&gt; &#231; &#xE9; &quot;'), 'a b & <c> ç é "')
  assert.equal(htmlToMarkdown('Texto &amp; &lt;tag&gt; e espaço&nbsp;duro.'), 'Texto & <tag> e espaço duro.')
})

test('as imagens vão para dentro do .html; a que não deu para ler fica como estava', async () => {
  const html = '<img src="http://x/a.png" alt="a"><img src="http://x/b.png"><img src="data:image/png;base64,AA">'
  const saida = await embutirImagens(html, async (url) => (url.endsWith('a.png') ? 'data:image/png;base64,QQ==' : null))
  assert.ok(saida.includes('<img src="data:image/png;base64,QQ==" alt="a">'))
  assert.ok(saida.includes('src="http://x/b.png"'))
  assert.ok(saida.includes('src="data:image/png;base64,AA"'))
})

test('o .md também leva a imagem dentro, e não o endereço do servidor do app', async () => {
  const doc = nota(
    { id: 's1', type: 'text', html: '<p><img src="http://127.0.0.1:8756/media/a.png" alt="a"></p>' },
    { id: 's2', type: 'code', language: 'js', code: '<img src="http://x/b.png">' },
  )
  const comImagens = await embutirImagensDaNota(doc, async () => 'data:image/png;base64,QQ==')
  assert.equal(buildNoteMarkdown(comImagens), '![a](data:image/png;base64,QQ==)\n\n```js\n<img src="http://x/b.png">\n```')
  // A nota aberta no editor não muda.
  assert.ok(doc.data.sections[0].html.includes('127.0.0.1'))
})

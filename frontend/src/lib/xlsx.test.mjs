/**
 * Testes do gerador de .xlsx.
 *
 * O zip em si depende do JSZip e do browser; o que é testável sem eles —
 * e onde os erros de verdade moram — é a conversão de índice para letra
 * e o escape do XML, que corrompe o arquivo inteiro quando erra.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { celulaXml, colunaParaLetra, escaparXml } from './xlsx.js'

test('colunaParaLetra segue a numeração do Excel', () => {
  assert.equal(colunaParaLetra(0), 'A')
  assert.equal(colunaParaLetra(25), 'Z')
  // A virada de Z para AA é onde a base 26 sem zero costuma quebrar.
  assert.equal(colunaParaLetra(26), 'AA')
  assert.equal(colunaParaLetra(27), 'AB')
  assert.equal(colunaParaLetra(51), 'AZ')
  assert.equal(colunaParaLetra(52), 'BA')
  assert.equal(colunaParaLetra(701), 'ZZ')
  assert.equal(colunaParaLetra(702), 'AAA')
})

test('escaparXml neutraliza o que quebraria o documento', () => {
  assert.equal(escaparXml('a & b'), 'a &amp; b')
  assert.equal(escaparXml('<tag>'), '&lt;tag&gt;')
  assert.equal(escaparXml('as "aspas"'), 'as &quot;aspas&quot;')
  // Escapar o & primeiro: na ordem errada o &lt; viraria &amp;lt;.
  assert.equal(escaparXml('&lt;'), '&amp;lt;')
})

test('escaparXml remove caracteres de controle inválidos em XML', () => {
  // Um \u0000 no meio faz o Excel recusar o arquivo sem explicar.
  assert.equal(escaparXml('a\u0000b'), 'ab')
  assert.equal(escaparXml('a\u001Fb'), 'ab')
  // Tab e quebra de linha são válidos e devem sobreviver.
  assert.equal(escaparXml('a\tb\nc'), 'a\tb\nc')
})

test('número vira <v>, texto vira string inline', () => {
  assert.equal(celulaXml('A1', 42), '<c r="A1"><v>42</v></c>')
  assert.equal(celulaXml('A1', -3.5), '<c r="A1"><v>-3.5</v></c>')
  assert.ok(celulaXml('B2', 'texto').includes('t="inlineStr"'))
  assert.ok(celulaXml('B2', 'texto').includes('<t xml:space="preserve">texto</t>'))
})

test('vazio não gera célula', () => {
  assert.equal(celulaXml('A1', null), '')
  assert.equal(celulaXml('A1', undefined), '')
  assert.equal(celulaXml('A1', ''), '')
  // Zero é um valor: some se for tratado como vazio.
  assert.equal(celulaXml('A1', 0), '<c r="A1"><v>0</v></c>')
})

test('NaN e Infinity não entram como número', () => {
  // Passariam por `typeof === number` e virariam #VALUE! na planilha.
  assert.ok(celulaXml('A1', NaN).includes('inlineStr'))
  assert.ok(celulaXml('A1', Infinity).includes('inlineStr'))
})

test('conteúdo da célula é escapado', () => {
  const saida = celulaXml('A1', '<script>&')
  assert.ok(saida.includes('&lt;script&gt;&amp;'))
  assert.ok(!saida.includes('<script>'))
})

test('a planilha sai com formato de número, estilo da célula e colunas congeladas', async () => {
  const { montarXlsx, conteudoDoExcel } = await import('./xlsx.js')
  const columns = [
    { id: 'a', name: 'Item', type: 'text', width: 140 },
    { id: 'b', name: 'Valor', type: 'currency', currency: 'BRL', decimals: 2 },
    { id: 'c', name: 'Taxa', type: 'percent' },
    { id: 'd', name: 'Data', type: 'date' },
    { id: 'e', name: 'Feito', type: 'checkbox' },
  ]
  const rows = [
    {
      id: 'r1',
      cells: { a: 'Aluguel', b: '1200', c: '15', d: '2026-03-12', e: true },
      styles: { a: { bold: true, fill: '#FEF08A', align: 'center' }, b: { color: '#C00000' } },
    },
    { id: 'r2', cells: { a: 'R$ 10,50', b: '', c: '', d: '', e: false }, styles: { c: { fill: '#BBF7D0' } } },
    { id: 'r3', cells: { a: '12/03/2026', b: '5' } },
  ]

  // Cada tipo vira o valor e o formato que o Excel entende.
  assert.deepEqual(conteudoDoExcel(columns[1], rows[0], columns, rows), { valor: 1200, formato: '"R$ "#,##0.00' })
  assert.deepEqual(conteudoDoExcel(columns[2], rows[0], columns, rows), { valor: 0.15, formato: '0%' })
  assert.deepEqual(conteudoDoExcel(columns[3], rows[0], columns, rows), { valor: 46093, formato: 14 })
  assert.deepEqual(conteudoDoExcel(columns[4], rows[0], columns, rows), { valor: true })
  // No Geral: "R$ 10,50" é dinheiro e uma data digitada é data.
  assert.deepEqual(conteudoDoExcel(columns[0], rows[1], columns, rows), { valor: 10.5, formato: '"R$ "#,##0.00' })
  assert.deepEqual(conteudoDoExcel(columns[0], rows[2], columns, rows), { valor: 46093, formato: 14 })

  const { folha, estilos } = montarXlsx(columns, rows, { congeladas: 1 })
  assert.match(folha, /<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"\/>/)
  assert.match(folha, /<col min="1" max="1" width="20" customWidth="1"\/>/)
  assert.match(folha, /<c r="E2" t="b"><v>1<\/v><\/c>/)
  // Célula vazia com fundo continua no arquivo, só com o estilo.
  assert.match(folha, /<c r="C3" s="\d+"\/>/)
  assert.match(estilos, /<numFmt numFmtId="164" formatCode="&quot;R\$ &quot;#,##0.00"\/>/)
  assert.match(estilos, /<font><b\/><sz val="11"\/><name val="Calibri"\/><family val="2"\/><\/font>/)
  assert.match(estilos, /<fgColor rgb="FFFEF08A"\/>/)
  assert.match(estilos, /<alignment horizontal="center"\/>/)
  assert.match(estilos, /<color rgb="FFC00000"\/>/)
  // Estilo repetido não duplica: a contagem de xfs bate com os distintos.
  const xfs = estilos.match(/<cellXfs count="(\d+)">/)[1]
  assert.equal(Number(xfs), (estilos.match(/<cellXfs[^>]*>([\s\S]*)<\/cellXfs>/)[1].match(/<xf /g) ?? []).length)
})

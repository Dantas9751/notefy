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

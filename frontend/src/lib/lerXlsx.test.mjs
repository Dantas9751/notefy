/**
 * Testes do leitor de .xlsx da pré-visualização.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { blocos, desescapar, formatarNumero, lerXlsx } from './lerXlsx.js'
import { buildXlsx } from './xlsx.js'

test('o que o Notefy exporta volta igual na prévia', async () => {
  const columns = [
    { id: 'a', name: 'Item', type: 'text' },
    { id: 'b', name: 'Valor', type: 'currency', currency: 'BRL' },
    { id: 'c', name: 'Taxa', type: 'percent' },
    { id: 'd', name: 'Data', type: 'date' },
    { id: 'e', name: 'Feito', type: 'checkbox' },
  ]
  const rows = [
    { id: 'r1', cells: { a: 'Aluguel & cia <ok>', b: '1200', c: '15', d: '2026-03-12', e: true } },
    { id: 'r2', cells: { a: '=A1', b: '' } },
  ]
  const bytes = await buildXlsx(columns, rows, 'Contas', { tipo: 'uint8array' })
  const { nome, linhas, truncado } = await lerXlsx(bytes)

  assert.equal(nome, 'Contas')
  assert.equal(truncado, false)
  assert.deepEqual(linhas[0].map((c) => c?.texto), ['Item', 'Valor', 'Taxa', 'Data', 'Feito'])
  assert.equal(linhas[1][0].texto, 'Aluguel & cia <ok>')
  assert.match(linhas[1][1].texto, /^R\$\s1\.200,00$/)
  assert.equal(linhas[1][1].numero, true)
  assert.equal(linhas[1][2].texto, '15%')
  assert.equal(linhas[1][3].texto, '12/03/2026')
  assert.equal(linhas[1][4].texto, 'VERDADEIRO')
  // Fórmula sai pelo valor; célula vazia é null.
  assert.equal(linhas[2][0].texto, 'Aluguel & cia <ok>')
  assert.equal(linhas[2][1], null)
})

test('arquivo malformado de propósito não trava a leitura', () => {
  // Milhares de <row> sem fechar: com regex preguiçosa isto levava minutos.
  const xml = '<sheetData>' + '<row r="1"><c r="A1"><v>1</v></c>'.repeat(50000)
  const inicio = Date.now()
  const lidos = [...blocos(xml, 'row')]
  assert.ok(Date.now() - inicio < 1000)
  assert.equal(lidos.length, 0)

  // `<row` não casa com `<rowBreaks`.
  assert.deepEqual([...blocos('<rowBreaks/><row r="2"/>', 'row')], [[' r="2"', '']])
})

test('entidades e formatos de número', () => {
  assert.equal(desescapar('a &amp; b &lt;c&gt; &#233; &#xE9;'), 'a & b <c> é é')
  assert.equal(desescapar('&#99999999;'), '&#99999999;')
  assert.equal(formatarNumero(0.125, 10), '12,50%')
  assert.equal(formatarNumero(1234.5, 0, '#,##0.00'), '1.234,50')
  assert.equal(formatarNumero(46093, 14), '12/03/2026')
  assert.equal(formatarNumero(5, 0, '[$€-x-euro2] #,##0.00'), '€ 5,00')
})

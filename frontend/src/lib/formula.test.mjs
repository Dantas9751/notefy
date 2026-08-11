/**
 * Testes do avaliador de fórmulas.
 *
 * Rodam com o runner nativo do Node (`node --test`), sem framework: o
 * módulo é JavaScript puro, sem React nem DOM, e trazer Vitest só para
 * isto adicionaria dezenas de dependências ao frontend.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { aggregate, evaluateFormula, visibleRows } from './formula.js'

/** Planilha de apoio:  A=nome, B=nota1, C=nota2, D=média, E=situação */
const columns = [
  { id: 'a', name: 'Aluno', type: 'text' },
  { id: 'b', name: 'N1', type: 'number', aggregate: 'sum' },
  { id: 'c', name: 'N2', type: 'number' },
  { id: 'd', name: 'Média', type: 'formula' },
  { id: 'e', name: 'Situação', type: 'text' },
]

const rows = [
  { id: 'r1', cells: { a: 'Ana', b: 8, c: 10, d: '=MEDIA(B1:C1)', e: 'ok' } },
  { id: 'r2', cells: { a: 'Bruno', b: 4, c: 6, d: '=MEDIA(B2:C2)', e: 'revisar' } },
  { id: 'r3', cells: { a: 'Carla', b: 9, c: 9, d: '=MEDIA(B3:C3)', e: 'ok' } },
]

const evalIn = (expr) => evaluateFormula(expr, { columns, rows })

test('aritmética e precedência', () => {
  assert.equal(evalIn('=2+3*4').value, 14)
  assert.equal(evalIn('=(2+3)*4').value, 20)
  assert.equal(evalIn('=2^3^2').value, 512) // associa à direita
  assert.equal(evalIn('=-5+2').value, -3)
})

test('divisão por zero vira erro, não Infinity', () => {
  const { error } = evalIn('=1/0')
  assert.match(error, /zero/i)
})

test('referências e intervalos', () => {
  assert.equal(evalIn('=B1').value, 8)
  assert.equal(evalIn('=SOMA(B1:B3)').value, 21)
  assert.equal(evalIn('=MEDIA(B1:C1)').value, 9)
  assert.equal(evalIn('=MAX(B1:C3)').value, 10)
})

test('intervalo solto fora de função é recusado', () => {
  assert.ok(evalIn('=B1:B3').error)
})

test('referência a coluna de fórmula resolve em cadeia', () => {
  // D1 é ele próprio uma fórmula; somar a coluna D exige avaliá-la.
  assert.equal(evalIn('=SOMA(D1:D3)').value, 9 + 5 + 9)
})

test('referência circular é detectada em vez de estourar a pilha', () => {
  // Coluna única → letra A. O endereçamento é posicional, não por id.
  const circular = [{ id: 'r1', cells: { d: '=A1+1' } }]
  const { error } = evaluateFormula('=A1', {
    columns: [{ id: 'd', name: 'X', type: 'formula' }],
    rows: circular,
  })
  assert.match(error, /circular/i)
})

test('referência a coluna inexistente resolve em vazio, não em erro', () => {
  // Só existe a coluna A; Z1 está fora da planilha.
  const { value, error } = evaluateFormula('=SOMA(Z1:Z9)', {
    columns: [{ id: 'a', name: 'X', type: 'number' }],
    rows: [{ id: 'r1', cells: { a: 5 } }],
  })
  assert.equal(error, null)
  assert.equal(value, 0)
})

test('condicional com texto', () => {
  assert.equal(evalIn('=SE(B1>7; "passou"; "reprovou")').value, 'passou')
  assert.equal(evalIn('=SE(B2>7; "passou"; "reprovou")').value, 'reprovou')
})

test('lógica booleana', () => {
  assert.equal(evalIn('=E(B1>5; C1>5)').value, true)
  assert.equal(evalIn('=OU(B2>8; C2>8)').value, false)
  assert.equal(evalIn('=NAO(B2>8)').value, true)
})

test('agregação condicional', () => {
  assert.equal(evalIn('=SOMASE(B1:B3; ">5")').value, 17)
  assert.equal(evalIn('=CONT_SE(E1:E3; "ok")').value, 2)
})

test('texto: concatenação e caixa', () => {
  assert.equal(evalIn('=CONCAT(A1; " e "; A2)').value, 'Ana e Bruno')
  assert.equal(evalIn('="a" & "b"').value, 'ab')
  assert.equal(evalIn('=MAIUSC(A1)').value, 'ANA')
  assert.equal(evalIn('=NUM_CARACT(A2)').value, 5)
})

test('comparações devolvem booleano', () => {
  assert.equal(evalIn('=B1>B2').value, true)
  assert.equal(evalIn('=A1="Ana"').value, true)
  assert.equal(evalIn('=A1<>"Ana"').value, false)
})

test('arredondamento', () => {
  assert.equal(evalIn('=ARRED(3.14159; 2)').value, 3.14)
  assert.equal(evalIn('=TETO(2.1)').value, 3)
  assert.equal(evalIn('=PISO(2.9)').value, 2)
})

test('ponto flutuante não vaza para a célula', () => {
  assert.equal(evalIn('=0.1+0.2').value, 0.3)
})

test('separador ; e , são intercambiáveis', () => {
  assert.equal(evalIn('=ARRED(3.14159, 2)').value, 3.14)
  assert.equal(evalIn('=ARRED(3.14159; 2)').value, 3.14)
})

test('função desconhecida é erro legível', () => {
  const { error } = evalIn('=INVENTADA(1)')
  assert.match(error, /desconhecida/i)
})

test('fórmula vazia não é erro', () => {
  assert.deepEqual(evalIn(''), { value: '', error: null })
})

test('número no formato brasileiro é lido', () => {
  const withComma = [{ id: 'b', cells: { b: '1.234,5' } }]
  const result = evaluateFormula('=A1*2', {
    columns: [{ id: 'b', name: 'N', type: 'number' }],
    rows: withComma,
  })
  assert.equal(result.value, 2469)
})

test('resumo de coluna', () => {
  assert.equal(aggregate(columns[1], rows, columns).text, '21')
  assert.equal(
    aggregate({ ...columns[1], aggregate: 'avg' }, rows, columns).text,
    '7',
  )
  assert.equal(
    aggregate({ ...columns[0], aggregate: 'filled' }, rows, columns).text,
    '3',
  )
})

test('filtro e ordenação são visão, não reordenam o payload', () => {
  const data = {
    columns,
    rows,
    filters: [{ column: 'e', operator: 'equals', value: 'ok' }],
    sort: { column: 'b', direction: 'desc' },
  }
  const shown = visibleRows(data)
  assert.deepEqual(shown.map((r) => r.cells.a), ['Carla', 'Ana'])
  // O array original segue intacto — é ele que as referências endereçam.
  assert.deepEqual(rows.map((r) => r.cells.a), ['Ana', 'Bruno', 'Carla'])
})

test('ordenação joga as células vazias para o fim', () => {
  const withBlank = [
    { id: 'r1', cells: { b: 5 } },
    { id: 'r2', cells: {} },
    { id: 'r3', cells: { b: 9 } },
  ]
  const shown = visibleRows({
    columns: [{ id: 'b', name: 'N', type: 'number' }],
    rows: withBlank,
    sort: { column: 'b', direction: 'asc' },
  })
  assert.deepEqual(shown.map((r) => r.id), ['r1', 'r3', 'r2'])
})

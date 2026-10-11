/**
 * O CSV da planilha no formato que o Excel de cada idioma lê sem ajuda.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatoDoCsv, planilhaEmCsv } from './csv.js'

const colunas = [
  { id: 'c1', name: 'Disciplina', type: 'text' },
  { id: 'c2', name: 'Nota', type: 'number' },
]
const linhas = [
  { id: 'r1', cells: { c1: 'Cálculo; III', c2: 7.5 } },
  { id: 'r2', cells: { c1: 'Física "1"', c2: 8 } },
]

test('em português: ponto e vírgula e vírgula decimal, como o Excel daqui espera', () => {
  assert.deepEqual(formatoDoCsv('pt-BR'), { separador: ';', decimal: ',' })
  assert.equal(planilhaEmCsv(colunas, linhas, formatoDoCsv('pt-BR')), 'Disciplina;Nota\r\n"Cálculo; III";7,5\r\n"Física ""1""";8')
})

test('em inglês: vírgula e ponto decimal', () => {
  assert.deepEqual(formatoDoCsv('en-US'), { separador: ',', decimal: '.' })
  assert.equal(planilhaEmCsv(colunas, linhas, formatoDoCsv('en-US')), 'Disciplina,Nota\r\nCálculo; III,7.5\r\n"Física ""1""",8')
})

test('texto que o Excel leria como fórmula ganha apóstrofo; número e número em texto, não', () => {
  const cols = [{ id: 'c1', name: '=nome', type: 'text' }, { id: 'c2', name: 'N', type: 'number' }]
  const rows = [
    { id: 'r1', cells: { c1: '-cmd|calc', c2: -5 } },
    { id: 'r2', cells: { c1: '+cmd', c2: 1 } },
    { id: 'r3', cells: { c1: '-5,5', c2: 2 } },
    { id: 'r4', cells: { c1: '@SUM(A1)', c2: 3 } },
  ]
  const saida = planilhaEmCsv(cols, rows, formatoDoCsv('pt-BR')).split('\r\n')
  assert.equal(saida[0], "'=nome;N")
  assert.equal(saida[1], "'-cmd|calc;-5")
  assert.equal(saida[2], "'+cmd;1")
  assert.equal(saida[3], '-5,5;2')
  assert.equal(saida[4], "'@SUM(A1);3")
})

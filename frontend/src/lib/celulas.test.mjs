import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bordasDaSelecao,
  colar,
  dentro,
  dentroDeAlguma,
  deTSV,
  limpar,
  paraTSV,
  retangulo,
  uniao,
  valorDaCelula,
} from './celulas.js'

const columns = [
  { id: 'c1', name: 'Nome' },
  { id: 'c2', name: 'Nota' },
  { id: 'c3', name: 'Turma' },
]
const rows = () => [
  { id: 'r1', cells: { c1: 'Ana', c2: '8', c3: 'A' } },
  { id: 'r2', cells: { c1: 'Bia', c2: '9', c3: 'B' } },
  { id: 'r3', cells: { c1: 'Caio', c2: '7', c3: 'A' } },
]

/* -------------------------------------------------------------------- */
/* retÃ¢ngulo                                                            */
/* -------------------------------------------------------------------- */

test('retangulo ordena os cantos, arrastando para trÃ¡s', () => {
  const r = retangulo({ linha: 2, coluna: 2 }, { linha: 0, coluna: 1 })
  assert.deepEqual(r, { linhaInicio: 0, linhaFim: 2, colunaInicio: 1, colunaFim: 2 })
})

test('retangulo de uma cÃ©lula sÃ³ quando nÃ£o hÃ¡ segunda ponta', () => {
  assert.deepEqual(retangulo({ linha: 1, coluna: 1 }), {
    linhaInicio: 1,
    linhaFim: 1,
    colunaInicio: 1,
    colunaFim: 1,
  })
})

test('dentro reconhece bordas e recusa fora', () => {
  const area = retangulo({ linha: 0, coluna: 0 }, { linha: 1, coluna: 1 })
  assert.equal(dentro(area, 0, 0), true)
  assert.equal(dentro(area, 1, 1), true)
  assert.equal(dentro(area, 2, 1), false)
  assert.equal(dentro(null, 0, 0), false)
})

/* -------------------------------------------------------------------- */
/* cÃ³pia                                                                */
/* -------------------------------------------------------------------- */

test('paraTSV copia o bloco com tabs e quebras', () => {
  const area = retangulo({ linha: 0, coluna: 0 }, { linha: 1, coluna: 1 })
  assert.equal(paraTSV(area, rows(), columns), 'Ana\t8\nBia\t9')
})

test('paraTSV protege valor que contÃ©m tab ou aspas', () => {
  const linhas = [{ id: 'r1', cells: { c1: 'a\tb', c2: 'diz "oi"' } }]
  const area = retangulo({ linha: 0, coluna: 0 }, { linha: 0, coluna: 1 })
  assert.equal(paraTSV(area, linhas, columns), '"a\tb"\t"diz ""oi"""')
})

test('paraTSV trata cÃ©lula vazia como string vazia', () => {
  const linhas = [{ id: 'r1', cells: {} }]
  const area = retangulo({ linha: 0, coluna: 0 }, { linha: 0, coluna: 1 })
  assert.equal(paraTSV(area, linhas, columns), '\t')
})

/* -------------------------------------------------------------------- */
/* colagem                                                              */
/* -------------------------------------------------------------------- */

test('deTSV lÃª matriz simples', () => {
  assert.deepEqual(deTSV('a\tb\nc\td'), [
    ['a', 'b'],
    ['c', 'd'],
  ])
})

test('deTSV entende aspas com tab e quebra dentro (formato do Excel)', () => {
  assert.deepEqual(deTSV('"a\tb"\tc\n"linha\n2"\td'), [
    ['a\tb', 'c'],
    ['linha\n2', 'd'],
  ])
})

test('deTSV ignora a linha vazia final do \\r\\n', () => {
  assert.deepEqual(deTSV('a\tb\r\n'), [['a', 'b']])
})

test('colar escreve a partir da cÃ©lula alvo', () => {
  const r = colar([['X', 'Y']], rows(), columns, { linha: 1, coluna: 1 })
  assert.equal(r[1].cells.c2, 'X')
  assert.equal(r[1].cells.c3, 'Y')
  // Nada fora do alvo Ã© tocado.
  assert.equal(r[0].cells.c2, '8')
  assert.equal(r[1].cells.c1, 'Bia')
})

test('colar descarta o que passa da borda em vez de criar linha/coluna', () => {
  const r = colar(
    [
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
    ],
    rows(),
    columns,
    { linha: 2, coluna: 2 },
  )
  assert.equal(r.length, 3)
  assert.equal(r[2].cells.c3, '1')
  assert.equal(Object.keys(r[2].cells).length, 3)
})

test('colar nÃ£o muta as linhas originais', () => {
  const originais = rows()
  colar([['Z']], originais, columns, { linha: 0, coluna: 0 })
  assert.equal(originais[0].cells.c1, 'Ana')
})

/* -------------------------------------------------------------------- */
/* limpeza                                                              */
/* -------------------------------------------------------------------- */

test('limpar esvazia sÃ³ o retÃ¢ngulo', () => {
  const area = retangulo({ linha: 0, coluna: 1 }, { linha: 1, coluna: 2 })
  const r = limpar(area, rows(), columns)
  assert.equal(r[0].cells.c2, '')
  assert.equal(r[1].cells.c3, '')
  assert.equal(r[0].cells.c1, 'Ana')
  assert.equal(r[2].cells.c2, '7')
})

test('limpar sem Ã¡rea devolve as linhas como estÃ£o', () => {
  const originais = rows()
  assert.equal(limpar(null, originais, columns), originais)
})

/* -------------------------------------------------------------------- */
/* Blocos soltos (Ctrl+clique)                                          */
/* -------------------------------------------------------------------- */

test('dentroDeAlguma aceita a cÃ©lula que estÃ¡ em qualquer bloco', () => {
  const a = retangulo({ linha: 0, coluna: 0 })
  const b = retangulo({ linha: 2, coluna: 2 })
  assert.equal(dentroDeAlguma([a, b], 0, 0), true)
  assert.equal(dentroDeAlguma([a, b], 2, 2), true)
  // O buraco entre os dois blocos nÃ£o estÃ¡ selecionado.
  assert.equal(dentroDeAlguma([a, b], 1, 1), false)
})

test('dentroDeAlguma sem blocos nÃ£o seleciona nada', () => {
  assert.equal(dentroDeAlguma([], 0, 0), false)
  assert.equal(dentroDeAlguma(undefined, 0, 0), false)
})

test('uniao devolve a caixa que envolve os blocos', () => {
  const a = retangulo({ linha: 0, coluna: 0 })
  const b = retangulo({ linha: 2, coluna: 3 })
  assert.deepEqual(uniao([a, b]), {
    linhaInicio: 0,
    linhaFim: 2,
    colunaInicio: 0,
    colunaFim: 3,
  })
})

test('uniao de lista vazia Ã© nula', () => {
  assert.equal(uniao([]), null)
  assert.equal(uniao(null), null)
})

test('limpar aplicado bloco a bloco preserva o buraco', () => {
  // Ã‰ assim que Delete e Ctrl+X tratam seleÃ§Ã£o solta.
  const a = retangulo({ linha: 0, coluna: 0 })
  const b = retangulo({ linha: 2, coluna: 2 })
  let linhas = rows()
  for (const bloco of [a, b]) linhas = limpar(bloco, linhas, columns)
  assert.equal(linhas[0].cells.c1, '')
  assert.equal(linhas[2].cells.c3, '')
  // O meio continua intacto.
  assert.equal(linhas[1].cells.c2, '9')
})


/* -------------------------------------------------------------------- */
/* Contorno da seleção                                                  */
/* -------------------------------------------------------------------- */

test('célula sozinha desenha os quatro lados', () => {
  const area = retangulo({ linha: 1, coluna: 1 })
  assert.deepEqual(bordasDaSelecao([area], 1, 1), {
    topo: true, base: true, esquerda: true, direita: true,
  })
})

test('célula fora da seleção não tem contorno', () => {
  const area = retangulo({ linha: 0, coluna: 0 })
  assert.equal(bordasDaSelecao([area], 5, 5), null)
})

test('no meio de um bloco 3x3 nenhum lado é externo', () => {
  // É isso que faz o contorno sair contínuo em volta do bloco em vez de
  // uma caixinha desenhada por célula.
  const area = retangulo({ linha: 0, coluna: 0 }, { linha: 2, coluna: 2 })
  assert.deepEqual(bordasDaSelecao([area], 1, 1), {
    topo: false, base: false, esquerda: false, direita: false,
  })
})

test('quina de bloco desenha só os dois lados de fora', () => {
  const area = retangulo({ linha: 0, coluna: 0 }, { linha: 2, coluna: 2 })
  assert.deepEqual(bordasDaSelecao([area], 0, 0), {
    topo: true, base: false, esquerda: true, direita: false,
  })
  assert.deepEqual(bordasDaSelecao([area], 2, 2), {
    topo: false, base: true, esquerda: false, direita: true,
  })
})

test('blocos encostados viram um contorno só', () => {
  // Dois retângulos vizinhos: a divisa entre eles não é borda externa.
  const a = retangulo({ linha: 0, coluna: 0 }, { linha: 0, coluna: 1 })
  const b = retangulo({ linha: 0, coluna: 2 }, { linha: 0, coluna: 3 })
  assert.equal(bordasDaSelecao([a, b], 0, 1).direita, false)
  assert.equal(bordasDaSelecao([a, b], 0, 2).esquerda, false)
  // As pontas de fora continuam desenhadas.
  assert.equal(bordasDaSelecao([a, b], 0, 0).esquerda, true)
  assert.equal(bordasDaSelecao([a, b], 0, 3).direita, true)
})

test('blocos separados mantêm contorno próprio', () => {
  const a = retangulo({ linha: 0, coluna: 0 })
  const b = retangulo({ linha: 0, coluna: 2 })
  assert.equal(bordasDaSelecao([a, b], 0, 0).direita, true)
  assert.equal(bordasDaSelecao([a, b], 0, 2).esquerda, true)
})


/* ------------------------------------------------------------------ */
/* valorDaCelula                                                      */
/*                                                                    */
/* A exportação para CSV e .xlsx lia `linha[coluna.id]` em vez de     */
/* `linha.cells[coluna.id]`: saía só o cabeçalho, com todas as        */
/* células vazias, e ninguém percebeu porque nada testava a leitura.  */
/* ------------------------------------------------------------------ */

test('valorDaCelula lê pelo id da coluna, dentro de cells', () => {
  const [linha] = rows()
  assert.equal(valorDaCelula(linha, columns[0]), 'Ana')
  assert.equal(valorDaCelula(linha, columns[1]), '8')
})

test('valorDaCelula não se deixa enganar por valor solto na linha', () => {
  // Formato ANTIGO e errado: valor direto na linha, fora de `cells`.
  const linha = { id: 'r1', c1: 'nao deve sair', cells: { c1: 'Ana' } }
  assert.equal(valorDaCelula(linha, columns[0]), 'Ana')
})

test('valorDaCelula devolve undefined para célula vazia ou ausente', () => {
  assert.equal(valorDaCelula({ id: 'r1', cells: {} }, columns[0]), undefined)
  assert.equal(valorDaCelula({ id: 'r1' }, columns[0]), undefined)
  assert.equal(valorDaCelula(null, columns[0]), undefined)
  assert.equal(valorDaCelula(rows()[0], null), undefined)
})

test('valorDaCelula preserva número e booleano sem virar texto', () => {
  const linha = { id: 'r1', cells: { c1: 0, c2: false } }
  assert.equal(valorDaCelula(linha, columns[0]), 0)
  assert.equal(valorDaCelula(linha, columns[1]), false)
})

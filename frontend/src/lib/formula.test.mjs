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

import {
  aggregate,
  ajustarAoExcluir,
  ajustarAoInserir,
  ajustarAoMover,
  comparableValue,
  contextoDoCursor,
  deslocarFormula,
  displayValue,
  evaluateFormula,
  numeroOuNulo,
  referenciasDaFormula,
  serialDeData,
  reescreverFormulas,
  sugerirFuncoes,
  valorParaExportar,
  visibleRows,
} from './formula.js'

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
  assert.deepEqual(evalIn(''), { value: '', error: null, codigo: null })
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

// ------------------------------------------------ travas (ataque ao app)

test('fórmula que cita a linha de cima duas vezes não explode', () => {
  // Sem cache, cada linha dobrava o trabalho: 22 linhas levavam 7 s para
  // UMA célula, e 30 travavam a aba.
  const columns = [{ id: 'f', type: 'formula' }]
  const rows = Array.from({ length: 60 }, (_, i) => ({ cells: { f: i === 0 ? '=1' : `=A${i}+A${i}` } }))
  const inicio = performance.now()
  const { value, error } = evaluateFormula(rows[59].cells.f, { columns, rows })
  assert.equal(error, null)
  assert.equal(value, 2 ** 59)
  assert.ok(performance.now() - inicio < 500)
})

test('intervalo maior que a planilha é recortado, não percorrido', () => {
  const columns = [{ id: 'a', type: 'number' }]
  const rows = [{ cells: { a: 2 } }, { cells: { a: 3 } }]
  const inicio = performance.now()
  const { value } = evaluateFormula('=SOMA(A1:ZZZ9999999)', { columns, rows })
  assert.equal(value, 5)
  assert.ok(performance.now() - inicio < 500)
})

test('o cache não responde por uma versão nova da planilha', () => {
  const columns = [{ id: 'a', type: 'number' }, { id: 'f', type: 'formula' }]
  const antes = [{ cells: { a: 1, f: '=A1*10' } }, { cells: { f: '=B1' } }]
  assert.equal(evaluateFormula('=B1', { columns, rows: antes }).value, 10)
  // Editar troca o array (estado imutável): o resultado tem que acompanhar.
  const depois = [{ cells: { a: 7, f: '=A1*10' } }, antes[1]]
  assert.equal(evaluateFormula('=B1', { columns, rows: depois }).value, 70)
})

test('ciclo continua sendo pego com o cache ligado', () => {
  const columns = [{ id: 'f', type: 'formula' }]
  const rows = [{ cells: { f: '=A2' } }, { cells: { f: '=A1' } }, { cells: { f: '=A1+1' } }]
  assert.match(evaluateFormula(rows[2].cells.f, { columns, rows }).error, /circular/i)
  assert.match(evaluateFormula(rows[0].cells.f, { columns, rows }).error, /circular/i)
})

// ------------------------------------------------ fórmula em qualquer coluna

test('=A1+B1 numa coluna de TEXTO calcula, e acompanha as células citadas', () => {
  const cols = [
    { id: 'a', type: 'text' },
    { id: 'b', type: 'text' },
    { id: 'c', type: 'text' },
  ]
  const antes = [{ id: 'r1', cells: { a: '5', b: '7', c: '=A1+B1' } }]
  assert.equal(displayValue(cols[2], antes[0], cols, antes).text, '12')
  // Editar A1 troca o array (estado imutável): o resultado muda sozinho.
  const depois = [{ id: 'r1', cells: { a: '10', b: '7', c: '=A1+B1' } }]
  assert.equal(displayValue(cols[2], depois[0], cols, depois).text, '17')
})

test('quem cita uma célula com fórmula recebe o resultado, não o texto', () => {
  const cols = [{ id: 'a', type: 'text' }, { id: 'b', type: 'number' }]
  const linhas = [{ id: 'r1', cells: { a: '=2*3', b: '=A1+1' } }]
  assert.equal(comparableValue(cols[1], linhas[0], cols, linhas), 7)
})

test('fórmula numa coluna Moeda sai formatada como dinheiro, alinhada como número', () => {
  const cols = [{ id: 'a', type: 'number' }, { id: 'b', type: 'currency', currency: 'BRL' }]
  const linhas = [{ id: 'r1', cells: { a: '10', b: '=A1*2' } }]
  const { text, numerico, formula } = displayValue(cols[1], linhas[0], cols, linhas)
  assert.match(text, /20/)
  assert.match(text, /R\$/)
  assert.equal(numerico, true)
  assert.equal(formula, true)
})

test('texto numa coluna Número aparece como foi escrito, não como 0', () => {
  const col = { id: 'a', type: 'number' }
  assert.equal(displayValue(col, { id: 'r', cells: { a: 'abc' } }, [col], []).text, 'abc')
})

test('apóstrofo na frente é texto: não calcula', () => {
  const col = { id: 'a', type: 'text' }
  assert.equal(displayValue(col, { id: 'r', cells: { a: "'=1+1" } }, [col], []).text, '=1+1')
})

test('erro mostra o código curto na célula e a explicação à parte', () => {
  const col = { id: 'a', type: 'text' }
  const linha = { id: 'r', cells: { a: '=1/0' } }
  const { text, error } = displayValue(col, linha, [col], [linha])
  assert.equal(text, '#DIV/0!')
  assert.match(error, /zero/i)
  assert.equal(evalIn('=FUNCAOX(1)').codigo, '#NOME?')
})

test('número digitado em vários formatos', () => {
  assert.equal(numeroOuNulo('1.234,56'), 1234.56)
  assert.equal(numeroOuNulo('1,234.56'), 1234.56)
  assert.equal(numeroOuNulo('12,5'), 12.5)
  assert.equal(numeroOuNulo('abc'), null)
  assert.equal(numeroOuNulo('12abc'), null)
  assert.equal(numeroOuNulo(''), null)
})

test('ordenar números numa coluna de texto ordena como número', () => {
  const col = { id: 'a', type: 'text' }
  const linhas = ['10', '9', '100'].map((v, i) => ({ id: `r${i}`, cells: { a: v } }))
  const shown = visibleRows({ columns: [col], rows: linhas, sort: { column: 'a', direction: 'asc' } })
  assert.deepEqual(shown.map((r) => r.cells.a), ['9', '10', '100'])
})

test('resumo de coluna de fórmula usa a planilha inteira, não a visão filtrada', () => {
  const cols = [{ id: 'a', type: 'number' }, { id: 'f', type: 'text', aggregate: 'sum' }]
  const linhas = [
    { id: 'r1', cells: { a: '1', f: '=A2' } },
    { id: 'r2', cells: { a: '5', f: '=A1' } },
  ]
  // Visão só com a 1ª linha: =A2 continua sendo a linha 2 GRAVADA (5).
  assert.equal(aggregate(cols[1], [linhas[0]], cols, linhas).text, '5')
})

// ------------------------------------------------ funções novas e nomes do Excel

test('SEERRO troca o erro, inclusive vindo de dentro de outra função', () => {
  assert.equal(evalIn('=SEERRO(1/0; "x")').value, 'x')
  assert.equal(evalIn('=SEERRO(SOMA(1/0; 2); 0)').value, 0)
  assert.equal(evalIn('=SEERRO(B1*2; 0)').value, 16)
  assert.equal(evalIn('=IFERROR(1/0, 3)').value, 3)
})

test('nomes do Excel com acento e ponto', () => {
  assert.equal(evalIn('=MÉDIA(B1:C1)').value, 9)
  assert.equal(evalIn('=CONT.SE(E1:E3; "ok")').value, 2)
  assert.equal(evalIn('=MÁXIMO(B1:B3)').value, 9)
})

test('MOD, INT e PRODUTO', () => {
  assert.equal(evalIn('=MOD(7; 3)').value, 1)
  assert.equal(evalIn('=MOD(-3; 2)').value, 1)
  assert.equal(evalIn('=INT(2.7)').value, 2)
  assert.equal(evalIn('=INT(-2.5)').value, -3)
  assert.equal(evalIn('=PRODUTO(2; 3; 4)').value, 24)
})

test('espaço no fim da fórmula não é erro', () => {
  assert.equal(evalIn('=B1+1 ').value, 9)
})

// ------------------------------------------------ referências que acompanham o dado

test('copiar a fórmula anda com a célula, menos o que tem $', () => {
  assert.equal(deslocarFormula('=A1+$B$1+B$2+$C3', 1, 1), '=B2+$B$1+C$2+$C4')
  assert.equal(deslocarFormula('=SOMA(A1:A3)', 2, 0), '=SOMA(A3:A5)')
  // Texto entre aspas não é referência.
  assert.equal(deslocarFormula('="A1"&A1', 1, 0), '="A1"&A2')
  // Nome de função com número não é referência.
  assert.equal(deslocarFormula('=LOG10(A1)', 1, 0), '=LOG10(A2)')
  // Sair da planilha por cima vira #REF!
  assert.equal(deslocarFormula('=A1', -1, 0), '=#REF!')
})

test('inserir linha empurra as referências de baixo e alarga o intervalo', () => {
  assert.equal(ajustarAoInserir('=A1+A3+SOMA(A1:A5)', 'linha', 1), '=A1+A4+SOMA(A1:A6)')
  assert.equal(ajustarAoInserir('=B2', 'coluna', 0), '=C2')
})

test('excluir linha puxa as de baixo, encolhe o intervalo e marca a excluída', () => {
  assert.equal(ajustarAoExcluir('=A5', 'linha', 1), '=A4')
  assert.equal(ajustarAoExcluir('=A1', 'linha', 1), '=A1')
  assert.equal(ajustarAoExcluir('=A2', 'linha', 1), '=#REF!')
  assert.equal(ajustarAoExcluir('=SOMA(A1:A5)', 'linha', 2), '=SOMA(A1:A4)')
  assert.equal(ajustarAoExcluir('=SOMA(A3:A3)', 'linha', 2), '=SOMA(#REF!)')
  assert.match(evalIn('=#REF!+1').error, /exclu/i)
  assert.equal(evalIn('=#REF!+1').codigo, '#REF!')
})

test('mover coluna: a referência segue o dado', () => {
  // A vai para a posição de C: quem lia A passa a ler C, e B e C andam para trás.
  assert.equal(ajustarAoMover('=A1+B1+C1', 'coluna', 0, 2), '=C1+A1+B1')
})

test('reescrever só mexe em célula com fórmula e devolve o mesmo array se nada mudou', () => {
  const cols = [{ id: 'a', type: 'text' }, { id: 'b', type: 'text' }]
  const linhas = [{ id: 'r1', cells: { a: 'A1 é texto', b: '=A1' } }]
  const novas = reescreverFormulas(cols, linhas, (f) => deslocarFormula(f, 1, 0))
  assert.equal(novas[0].cells.a, 'A1 é texto')
  assert.equal(novas[0].cells.b, '=A2')
  assert.equal(reescreverFormulas(cols, linhas, (f) => f), linhas)
})

test('referências da fórmula para pintar a grade', () => {
  assert.deepEqual(referenciasDaFormula('=A1+SOMA(B2:C3)'), [
    { colunaInicio: 0, colunaFim: 0, linhaInicio: 0, linhaFim: 0 },
    { colunaInicio: 1, colunaFim: 2, linhaInicio: 1, linhaFim: 2 },
  ])
  assert.deepEqual(referenciasDaFormula('texto A1'), [])
})

// ------------------------------------------------ ajuda ao escrever

test('autocompletar acha função pelo começo, sem acento', () => {
  assert.equal(sugerirFuncoes('SO')[0].pt, 'SOMA')
  assert.ok(sugerirFuncoes('méd').some((f) => f.pt === 'MEDIA'))
  assert.deepEqual(sugerirFuncoes(''), [])
})

test('contexto do cursor: palavra sendo digitada e função aberta', () => {
  assert.equal(contextoDoCursor('=SO', 3).palavra.texto, 'SO')
  assert.equal(contextoDoCursor('=SOMA(A1; ', 10).dentroDe.pt, 'SOMA')
  // Referência não é começo de função; texto entre aspas não conta.
  assert.equal(contextoDoCursor('=A1', 3).palavra, null)
  assert.equal(contextoDoCursor('="SO', 4).palavra, null)
  // Fora de fórmula, nada.
  assert.equal(contextoDoCursor('SO', 2).palavra, null)
})

test('exportar sai com o valor calculado e número como número', () => {
  const cols = [{ id: 'a', type: 'number' }, { id: 'b', type: 'text' }, { id: 'c', type: 'text' }]
  const linhas = [{ id: 'r1', cells: { a: '7', b: '=A1*2', c: '0123' } }]
  assert.equal(valorParaExportar(cols[0], linhas[0], cols, linhas), 7)
  assert.equal(valorParaExportar(cols[1], linhas[0], cols, linhas), 14)
  // Zero na frente numa coluna de texto é código (CEP, matrícula): fica texto.
  assert.equal(valorParaExportar(cols[2], linhas[0], cols, linhas), '0123')
})

test('sem escolher formato: R$, % e data digitados entram na conta', () => {
  assert.equal(numeroOuNulo('R$ 1.234,56'), 1234.56)
  assert.equal(numeroOuNulo('-R$ 5'), -5)
  assert.equal(numeroOuNulo('R$ -5'), -5)
  assert.equal(numeroOuNulo('US$ 1,234.50'), 1234.5)
  assert.equal(numeroOuNulo('15%'), 0.15)
  assert.equal(numeroOuNulo('R$'), null)
  assert.equal(numeroOuNulo('12/03/2026'), null)

  const cols = [{ id: 'a', type: 'text' }, { id: 'b', type: 'text' }]
  const linhas = [
    { id: 'r1', cells: { a: 'R$ 10,50', b: '12/03/2026' } },
    { id: 'r2', cells: { a: '15%', b: '=B1+30' } },
    { id: 'r3', cells: { a: '200', b: '=B2-B1' } },
  ]
  const conta = (f) => evaluateFormula(f, { columns: cols, rows: linhas }).value
  assert.equal(conta('=A1*2'), 21)
  assert.equal(conta('=A2*A3'), 30)
  // Data mais dias é data; data menos data, os dias entre elas.
  assert.equal(conta('=B1+30'), '2026-04-11')
  assert.equal(conta('=B2-B1'), 30)
  assert.equal(conta('=B2>B1'), true)
  assert.equal(conta('=DIAS("12/03/2026"; "10/03/2026")'), 2)
  assert.equal(displayValue(cols[1], linhas[1], cols, linhas).text, '11/04/2026')
  assert.equal(displayValue(cols[0], linhas[0], cols, linhas).numerico, true)

  assert.equal(serialDeData('31/02/2026'), null)
  assert.equal(serialDeData('1/2'), null)
  assert.equal(serialDeData('12/03/26'), serialDeData('2026-03-12'))
})

test('média, mínimo e mediana ignoram célula vazia e texto, como no Excel', () => {
  const cols = [{ id: 'a', type: 'text' }]
  const linhas = [
    { id: 'r1', cells: { a: '10' } },
    { id: 'r2', cells: { a: '' } },
    { id: 'r3', cells: { a: '20' } },
    { id: 'r4', cells: { a: 'abc' } },
    { id: 'r5', cells: {} },
  ]
  const conta = (f) => evaluateFormula(f, { columns: cols, rows: linhas }).value
  assert.equal(conta('=MEDIA(A1:A5)'), 15)
  assert.equal(conta('=MIN(A1:A5)'), 10)
  assert.equal(conta('=MEDIANA(A1:A5)'), 15)
  assert.equal(conta('=SOMA(A1:A5)'), 30)
})

test('data ordena pelo calendário e o resumo sai no formato da coluna', () => {
  const cols = [{ id: 'd', type: 'text' }, { id: 'm', type: 'currency', aggregate: 'sum' }]
  const linhas = [
    { id: 'x', cells: { d: '15/01/2026', m: '10' } },
    { id: 'y', cells: { d: '12/03/2025', m: '5,5' } },
    { id: 'z', cells: { d: '01/02/2026', m: '' } },
  ]
  const ordem = visibleRows({ columns: cols, rows: linhas, sort: { column: 'd', direction: 'asc' } })
  assert.deepEqual(ordem.map((r) => r.id), ['y', 'x', 'z'])
  assert.match(aggregate(cols[1], linhas, cols).text, /R\$\s?15,50/)
})

test('porcentagem digitada com o sinal numa coluna Porcentagem não vira 0,15%', () => {
  const cols = [{ id: 'p', type: 'percent' }]
  const linhas = [{ id: 'r1', cells: { p: '15%' } }, { id: 'r2', cells: { p: '15' } }]
  assert.equal(displayValue(cols[0], linhas[0], cols, linhas).text, '15%')
  assert.equal(displayValue(cols[0], linhas[1], cols, linhas).text, '15%')
  assert.equal(valorParaExportar(cols[0], linhas[0], cols, linhas), 15)
  // Numa coluna Geral, o símbolo continua no arquivo exportado.
  const geral = [{ id: 'g', type: 'text' }]
  assert.equal(valorParaExportar(geral[0], { id: 'r', cells: { g: 'R$ 10' } }, geral, []), 'R$ 10')
})

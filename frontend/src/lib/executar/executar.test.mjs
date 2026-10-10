import { test } from 'node:test'
import assert from 'node:assert/strict'
import { descreverErro, formatar, rodarJavascript } from './javascript.js'
import { limparTraceback, PythonIndisponivel, rodarPython } from './python.js'

async function rodar(codigo, respostas = []) {
  const saida = []
  await rodarJavascript(codigo, {
    escrever: (texto, fluxo = 'saida') => saida.push([fluxo, texto]),
    pedirEntrada: () => respostas.shift() ?? null,
  })
  return saida
}

test('console.log, await no topo e console.error em fluxos separados', async () => {
  const saida = await rodar('console.log("oi", 2, [1, 2], {a: 1})\nawait null\nconsole.error("ops")')
  assert.deepEqual(saida, [['saida', 'oi 2 [1,2] {"a":1}\n'], ['erro', 'ops\n']])
})

test('prompt escreve a pergunta e devolve a resposta; sem resposta é null', async () => {
  const saida = await rodar('const n = prompt("Nome?")\nconsole.log("Oi, " + n)\nconsole.log(prompt())', ['Ana'])
  assert.deepEqual(saida, [['saida', 'Nome? '], ['saida', 'Oi, Ana\n'], ['saida', ''], ['saida', 'null\n']])
})

test('erro aponta a linha do código da nota', async () => {
  const saida = await rodar('const a = 1\n\nnaoExiste()')
  assert.deepEqual(saida, [['erro', 'ReferenceError: naoExiste is not defined (line 3)\n']])
})

test('erro de sintaxe e throw de não-Error viram texto', async () => {
  assert.match((await rodar('const = 1'))[0][1], /^SyntaxError: /)
  assert.equal(descreverErro('falhou'), 'Uncaught falhou')
})

test('formatar aguenta circular, função e undefined', () => {
  const ciclo = {}
  ciclo.eu = ciclo
  assert.equal(formatar(ciclo), '[object Object]')
  assert.equal(formatar(function soma() {}), '[Function soma]')
  assert.equal(formatar(undefined), 'undefined')
})

test('traceback perde os quadros do Pyodide e guarda os do código', () => {
  const bruto = [
    'Traceback (most recent call last):',
    '  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code_async',
    '    await CodeRunner(',
    '  File "<exec>", line 2, in <module>',
    '    1 / 0',
    '    ~~^~~',
    'ZeroDivisionError: division by zero',
  ].join('\n')
  assert.equal(
    limparTraceback(bruto),
    ['Traceback (most recent call last):', '  File "<exec>", line 2, in <module>', '    1 / 0', '    ~~^~~', 'ZeroDivisionError: division by zero'].join('\n'),
  )
})

test('Pyodide que não carrega vira PythonIndisponivel, não erro técnico solto', async () => {
  // Fora do navegador não há `import.meta.env` nem `self.location`: o
  // carregamento falha como falharia sem os arquivos do Pyodide.
  const avisos = []
  await assert.rejects(
    rodarPython('print(1)', { escrever: () => {}, pedirEntrada: () => null, avisar: (e) => avisos.push(e) }),
    PythonIndisponivel,
  )
  assert.deepEqual(avisos, ['carregando'])
})

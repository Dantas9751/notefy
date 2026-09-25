/**
 * Testes da pilha de desfazer/refazer.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LIMITE,
  atalhoDe,
  criar,
  desfazer,
  empilhar,
  podeDesfazer,
  podeRefazer,
  refazer,
} from './history.js'

test('pilha nova não desfaz nem refaz', () => {
  const pilha = criar({ n: 0 })
  assert.equal(podeDesfazer(pilha), false)
  assert.equal(podeRefazer(pilha), false)
  // Sem para onde ir, as operações são no-op — e não um estado undefined.
  assert.deepEqual(desfazer(pilha).presente, { n: 0 })
  assert.deepEqual(refazer(pilha).presente, { n: 0 })
})

test('desfazer e refazer percorrem a sequência', () => {
  let pilha = criar({ n: 0 })
  pilha = empilhar(pilha, { n: 1 })
  pilha = empilhar(pilha, { n: 2 })

  assert.deepEqual(pilha.presente, { n: 2 })
  pilha = desfazer(pilha)
  assert.deepEqual(pilha.presente, { n: 1 })
  pilha = desfazer(pilha)
  assert.deepEqual(pilha.presente, { n: 0 })
  assert.equal(podeDesfazer(pilha), false)

  pilha = refazer(pilha)
  assert.deepEqual(pilha.presente, { n: 1 })
  pilha = refazer(pilha)
  assert.deepEqual(pilha.presente, { n: 2 })
  assert.equal(podeRefazer(pilha), false)
})

test('estado idêntico não gasta um passo', () => {
  const inicial = { n: 0 }
  const pilha = criar(inicial)
  assert.equal(empilhar(pilha, inicial), pilha)
  assert.equal(podeDesfazer(empilhar(pilha, inicial)), false)
})

test('editar depois de desfazer descarta o ramo à frente', () => {
  let pilha = criar({ n: 0 })
  pilha = empilhar(pilha, { n: 1 })
  pilha = empilhar(pilha, { n: 2 })
  pilha = desfazer(pilha)

  assert.equal(podeRefazer(pilha), true)
  pilha = empilhar(pilha, { n: 99 })

  // O `{n:2}` deixou de ser alcançável: a história seguiu outro caminho.
  assert.equal(podeRefazer(pilha), false)
  pilha = desfazer(pilha)
  assert.deepEqual(pilha.presente, { n: 1 })
})

test('o teto derruba o passo mais antigo, não o mais recente', () => {
  let pilha = criar({ n: 0 })
  for (let i = 1; i <= LIMITE + 10; i += 1) pilha = empilhar(pilha, { n: i })

  assert.equal(pilha.passados.length, LIMITE)
  // O passo imediatamente anterior continua lá — é o que Ctrl+Z alcança.
  assert.deepEqual(desfazer(pilha).presente, { n: LIMITE + 9 })
  // E o começo da história já saiu.
  assert.equal(pilha.passados[0].n, 10)
})

test('desfazer até o fim depois do teto não produz estado vazio', () => {
  let pilha = criar({ n: 0 })
  for (let i = 1; i <= LIMITE + 5; i += 1) pilha = empilhar(pilha, { n: i })
  while (podeDesfazer(pilha)) pilha = desfazer(pilha)

  assert.ok(pilha.presente, 'o presente nunca fica indefinido')
  assert.equal(pilha.presente.n, 5)
})

test('comparador próprio decide o que conta como mudança', () => {
  const mesmoN = (a, b) => a.n === b.n
  const pilha = criar({ n: 0, cor: 'azul' })
  // Mudou a cor, mas o comparador só olha `n`: não é passo.
  assert.equal(empilhar(pilha, { n: 0, cor: 'verde' }, mesmoN), pilha)
  assert.equal(podeDesfazer(empilhar(pilha, { n: 1 }, mesmoN)), true)
})

test('atalhoDe reconhece as três combinações e ignora o resto', () => {
  const ev = (extra) => ({ key: 'z', ctrlKey: false, metaKey: false, shiftKey: false, ...extra })

  assert.equal(atalhoDe(ev({ ctrlKey: true })), 'undo')
  assert.equal(atalhoDe(ev({ metaKey: true })), 'undo')
  assert.equal(atalhoDe(ev({ ctrlKey: true, shiftKey: true })), 'redo')
  assert.equal(atalhoDe(ev({ key: 'y', ctrlKey: true })), 'redo')
  // Maiúscula: com Shift o browser entrega 'Z', e comparar cru perderia.
  assert.equal(atalhoDe(ev({ key: 'Z', ctrlKey: true, shiftKey: true })), 'redo')

  assert.equal(atalhoDe(ev({})), null, 'z sozinho não é atalho')
  assert.equal(atalhoDe(ev({ key: 's', ctrlKey: true })), null, 'Ctrl+S é salvar')
})

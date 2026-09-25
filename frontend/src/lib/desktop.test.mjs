import test from 'node:test'
import assert from 'node:assert/strict'

import { idDeInstancia } from './desktop.js'

/**
 * A identidade de uma tela aberta atravessa o `BroadcastChannel` dentro
 * do `detail` do evento. Se ela não for clonável pelo algoritmo de clone
 * estruturado, o `postMessage` lança e a segunda janela nunca fica
 * sabendo da mudança — em silêncio, porque o erro morre no listener.
 *
 * Era um `Symbol`.
 */
test('o id de instância sobrevive ao clone estruturado', () => {
  const detail = { taskIds: ['a'], origem: idDeInstancia() }
  assert.deepEqual(structuredClone(detail), detail)
})

test('duas telas recebem identidades diferentes', () => {
  // Iguais, cada uma ignoraria o aviso da outra achando que era o próprio.
  const ids = new Set(Array.from({ length: 200 }, idDeInstancia))
  assert.equal(ids.size, 200)
})

test('um Symbol NÃO sobrevive — é o defeito que isto substitui', () => {
  assert.throws(() => structuredClone({ origem: Symbol('board') }), { name: 'DataCloneError' })
})

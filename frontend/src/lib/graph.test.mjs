/**
 * A linha do canvas: a caixa e o sentido que saem do arraste, e as pontas
 * que o desenho usa.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linhaEntre, pontasDaLinha } from './graph.js'

test('arrastar para baixo e para a direita (ou o contrário) desce; na diagonal oposta, sobe', () => {
  assert.deepEqual(linhaEntre({ x: 10, y: 20 }, { x: 110, y: 70 }), { x: 10, y: 20, w: 100, h: 50, dir: 'desce' })
  assert.deepEqual(linhaEntre({ x: 110, y: 70 }, { x: 10, y: 20 }), { x: 10, y: 20, w: 100, h: 50, dir: 'desce' })
  assert.deepEqual(linhaEntre({ x: 10, y: 70 }, { x: 110, y: 20 }), { x: 10, y: 20, w: 100, h: 50, dir: 'sobe' })
  assert.deepEqual(linhaEntre({ x: 110, y: 20 }, { x: 10, y: 70 }), { x: 10, y: 20, w: 100, h: 50, dir: 'sobe' })
})

test('horizontal e vertical cabem, com a caixa achatada', () => {
  assert.deepEqual(linhaEntre({ x: 0, y: 40 }, { x: 200, y: 40 }), { x: 0, y: 40, w: 200, h: 0, dir: 'desce' })
  assert.deepEqual(linhaEntre({ x: 30, y: 0 }, { x: 30, y: 90 }), { x: 30, y: 0, w: 0, h: 90, dir: 'desce' })
})

test('as pontas seguem o sentido; a linha antiga (sem sentido) é horizontal, no meio', () => {
  const rect = { w: 100, h: 50 }
  assert.deepEqual(pontasDaLinha({ dir: 'desce' }, rect), [0, 0, 100, 50])
  assert.deepEqual(pontasDaLinha({ dir: 'sobe' }, rect), [0, 50, 100, 0])
  assert.deepEqual(pontasDaLinha({}, { w: 180, h: 10 }), [0, 5, 180, 5])
})

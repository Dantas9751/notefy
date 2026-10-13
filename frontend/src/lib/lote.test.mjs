import test from 'node:test'
import assert from 'node:assert/strict'

import { emLote, ignorarSeJaSaiu } from './lote.js'

const recusa = (status, detail) => Object.assign(new Error('axios'), { response: { status, data: { detail } } })

test('a fila vai até o fim e o resumo traz o motivo da primeira recusa', async () => {
  const feitos = []
  const resumo = await emLote([1, 2, 3, 4], async (n) => {
    if (n === 2) throw recusa(423, 'É favorito.')
    if (n === 3) throw recusa(400, 'Nome repetido.')
    feitos.push(n)
  })
  assert.deepEqual(feitos, [1, 4])
  assert.deepEqual(resumo, { falhas: 2, total: 4, motivo: 'É favorito.' })
})

test('tudo certo devolve null', async () => {
  assert.equal(await emLote(['a', 'b'], async () => {}), null)
})

test('404 e 410 contam como feito; outro erro continua sendo erro', async () => {
  assert.equal(await emLote([1], () => Promise.reject(recusa(404)).catch(ignorarSeJaSaiu)), null)
  assert.equal(await emLote([1], () => Promise.reject(recusa(410)).catch(ignorarSeJaSaiu)), null)
  const resumo = await emLote([1], () => Promise.reject(recusa(500)).catch(ignorarSeJaSaiu))
  assert.equal(resumo.falhas, 1)
})

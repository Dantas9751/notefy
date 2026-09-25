import test from 'node:test'
import assert from 'node:assert/strict'

import { extrairEventosSse } from './sse.js'

test('extrai eventos data de um bloco SSE', () => {
  const eventos = extrairEventosSse(
    'data: {"text": "Ola"}\n\n' + 'data: {"text": " mundo"}\n\n',
  )
  assert.deepEqual(eventos, [{ text: 'Ola' }, { text: ' mundo' }])
})

test('reconhece o evento de fim', () => {
  const eventos = extrairEventosSse('data: {"text": "x"}\n\n' + 'data: [DONE]\n\n')
  assert.equal(eventos[eventos.length - 1].done, true)
})

test('ignora linhas que nao sao data e blocos malformados', () => {
  const eventos = extrairEventosSse(
    ': comentario\n\n' + 'data: {quebrado}\n\n' + 'data: {"text": "ok"}\n\n',
  )
  assert.deepEqual(eventos, [{ text: 'ok' }])
})

test('ignora blocos vazios', () => {
  assert.deepEqual(extrairEventosSse('data: \n\n'), [])
})
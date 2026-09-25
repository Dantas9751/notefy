import test from 'node:test'
import assert from 'node:assert/strict'

import { extractError } from './erros.js'

const erro = (status, data) => ({
  message: `Request failed with status code ${status}`,
  response: { status, data },
})

test('página de erro do Django não vai para a tela', () => {
  // Com `DEBUG=True` o corpo do 500 é o traceback inteiro em HTML. Isso
  // era devolvido como "a mensagem" e despejado na caixa de erro do
  // login — foi o que apareceu quando o backend subiu sem banco.
  const pagina = '<!DOCTYPE html>\n<html><head><title>OperationalError</title></head><body>' +
    'x'.repeat(5000) + '</body></html>'
  const msg = extractError(erro(500, pagina))
  assert.ok(!msg.includes('<'), msg.slice(0, 80))
  assert.ok(msg.length < 200)
})

test('servidor fora do ar não mostra a frase em inglês do axios', () => {
  const msg = extractError({ message: 'Network Error' })
  assert.ok(!/Request failed|Network Error/.test(msg), msg)
  assert.match(msg, /servidor/i)
})

test('500 vira uma frase sobre o servidor', () => {
  assert.match(extractError(erro(500, null)), /servidor/i)
  assert.match(extractError(erro(502, '')), /servidor/i)
})

test('a explicação do DRF vence o status', () => {
  assert.equal(
    extractError(erro(400, { detail: 'A chave de IA não está configurada.' })),
    'A chave de IA não está configurada.',
  )
})

test('primeiro erro de campo, sem o nome do campo junto', () => {
  assert.equal(
    extractError(erro(400, { ends_at: ['O fim não pode ser anterior ao início.'] })),
    'O fim não pode ser anterior ao início.',
  )
})

test('campo com erro aninhado não vira "[object Object]"', () => {
  const msg = extractError(erro(400, { files: { 0: ['O arquivo está vazio.'] } }))
  assert.ok(!msg.includes('[object'), msg)
})

test('status conhecido ganha frase própria', () => {
  assert.match(extractError(erro(404, null)), /encontrad/i)
  assert.match(extractError(erro(403, null)), /permiss/i)
  assert.match(extractError(erro(413, null)), /grande/i)
  assert.match(extractError(erro(429, null)), /tentativas/i)
})

test('texto curto do servidor ainda passa', () => {
  assert.equal(extractError(erro(400, 'Arquivo corrompido.')), 'Arquivo corrompido.')
})

test('download que falhou (blob) não quebra', () => {
  const msg = extractError(erro(500, new Blob(['<html>erro</html>'])))
  assert.ok(!msg.includes('<'), msg)
  assert.match(msg, /servidor/i)
})

test('detail em lista é achatado', () => {
  assert.equal(extractError(erro(400, { detail: ['Primeiro motivo.'] })), 'Primeiro motivo.')
})

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { definirConta } from './conta.js'
import { guardarSessao, janelaDestacada, lerSessao, marcarJanelaDestacada } from './sessao.js'

/** Um storage de mentira: as chaves ficam como propriedades, como no navegador. */
function armazenamento() {
  return Object.create({
    getItem(chave) { return Object.hasOwn(this, chave) ? this[chave] : null },
    setItem(chave, valor) { this[chave] = String(valor) },
    removeItem(chave) { delete this[chave] },
  })
}

afterEach(() => {
  delete globalThis.localStorage
  delete globalThis.sessionStorage
  definirConta(null)
})

const abas = [
  { key: '/', path: '/', kind: 'home', title: 'Início' },
  { key: '/notes/1', path: '/notes/1', kind: 'note', title: 'Cálculo', dirty: true },
  { key: '/notes/new?folder=2', path: '/notes/new?folder=2', kind: 'note' },
]

test('a sessão volta por conta, sem o item novo e sem "não salvo"', () => {
  globalThis.localStorage = armazenamento()
  globalThis.sessionStorage = armazenamento()
  definirConta('ana')
  guardarSessao(abas, '/notes/1')
  definirConta('bia')
  assert.equal(lerSessao(), null)
  definirConta('ana')
  const sessao = lerSessao()
  assert.deepEqual(sessao.abas.map((a) => a.path), ['/', '/notes/1'])
  assert.equal(sessao.ativa.path, '/notes/1')
  assert.equal(sessao.ativa.dirty, false)
})

test('a aba ativa que sumiu vira a última; lixo no disco é ignorado', () => {
  globalThis.localStorage = armazenamento()
  globalThis.sessionStorage = armazenamento()
  definirConta('ana')
  guardarSessao(abas, '/notes/new?folder=2')
  assert.equal(lerSessao().ativa.path, '/notes/1')
  localStorage.setItem('notefy.sessao@ana', '{"abas":[{"key":"x","path":"//fora.site"}]}')
  assert.equal(lerSessao(), null)
  localStorage.setItem('notefy.sessao@ana', 'não é json')
  assert.equal(lerSessao(), null)
})

test('a janela destacada não grava por cima da principal', () => {
  globalThis.localStorage = armazenamento()
  globalThis.sessionStorage = armazenamento()
  definirConta('ana')
  guardarSessao(abas, '/')
  marcarJanelaDestacada()
  assert.equal(janelaDestacada(), true)
  guardarSessao([{ key: '/notes/9', path: '/notes/9' }], '/notes/9')
  assert.equal(lerSessao().ativa.path, '/')
})

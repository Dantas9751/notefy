/**
 * O que é da conta, guardado no navegador, não passa para a próxima conta.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chaveDaConta, definirConta, descartarSemDono } from './conta.js'

test('cada conta tem a sua chave, e sem conta não há chave', () => {
  definirConta('ana')
  assert.equal(chaveDaConta('notefy.tabs'), 'notefy.tabs@ana')
  definirConta('bia')
  assert.equal(chaveDaConta('notefy.tabs'), 'notefy.tabs@bia')
  definirConta(null)
  assert.equal(chaveDaConta('notefy.tabs'), null)
})

test('as chaves de antes de ter dono saem; as da conta e as do aparelho ficam', () => {
  const guarda = (itens) => ({ itens, removeItem(chave) { delete this.itens[chave] } })
  const ambiente = {
    localStorage: guarda({ 'notefy.expanded': '[]', 'notefy.expanded@ana': '[]', 'notefy.theme': 'dark' }),
    sessionStorage: guarda({ 'notefy.tabs': '[]', 'notefy.tabs@ana': '[]', 'notefy.split': '{}' }),
  }
  descartarSemDono(ambiente)
  assert.deepEqual(Object.keys(ambiente.localStorage.itens), ['notefy.expanded@ana', 'notefy.theme'])
  assert.deepEqual(Object.keys(ambiente.sessionStorage.itens), ['notefy.tabs@ana'])
})

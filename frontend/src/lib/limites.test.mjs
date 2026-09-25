import test from 'node:test'
import assert from 'node:assert/strict'

import { MAX_COLUNAS_TABELA, MAX_ITENS_SECAO } from './limites.js'

/**
 * O par de verdade destes números está em `backend/content/schemas.py`, e
 * quem prende os dois é `backend/content/test_limites.py`. Aqui só se
 * confere que eles continuam sendo números utilizáveis — um `undefined`
 * escapando daqui faria `items.length >= undefined` virar `false` e o
 * editor pararia de limitar sem ninguém notar.
 */
test('os limites são inteiros positivos', () => {
  for (const [nome, valor] of [
    ['MAX_ITENS_SECAO', MAX_ITENS_SECAO],
    ['MAX_COLUNAS_TABELA', MAX_COLUNAS_TABELA],
  ]) {
    assert.equal(typeof valor, 'number', nome)
    assert.ok(Number.isInteger(valor) && valor > 0, `${nome} = ${valor}`)
  }
})

test('cabem mais itens do que colunas', () => {
  // Uma tabela tem muitas linhas e poucas colunas; inverter os dois na
  // importação passaria despercebido sem esta âncora.
  assert.ok(MAX_ITENS_SECAO > MAX_COLUNAS_TABELA)
})

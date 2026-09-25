/**
 * Testes da divisória do split view.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX, MIN, PADRAO, limitar, porcentagemDoPonteiro } from './split.js'

test('limitar prende nos extremos', () => {
  assert.equal(limitar(50), 50)
  assert.equal(limitar(0), MIN)
  assert.equal(limitar(100), MAX)
  assert.equal(limitar(-30), MIN)
  assert.equal(limitar(150), MAX)
})

test('limitar sobrevive a valor inválido', () => {
  // Acontece de verdade: `largura` zero numa medição feita antes do
  // layout produz NaN, e um `width: NaN%` some com o painel. Infinity
  // vem da mesma divisão e cai no mesmo lugar — não em MAX, porque um
  // salto silencioso para o extremo é mais difícil de entender do que
  // a divisória parada no meio.
  assert.equal(limitar(NaN), PADRAO)
  assert.equal(limitar(Infinity), PADRAO)
  assert.equal(limitar(-Infinity), PADRAO)
  assert.equal(limitar(undefined), PADRAO)
})

test('ponteiro no meio do contêiner dá metade', () => {
  // Contêiner de 1000px começando em 200 (depois da sidebar).
  assert.equal(porcentagemDoPonteiro(700, 200, 1000), 50)
})

test('a origem do contêiner é descontada', () => {
  // O mesmo clientX em contêineres que começam em pontos diferentes
  // precisa dar porcentagens diferentes — é o bug de ignorar a sidebar.
  assert.notEqual(
    porcentagemDoPonteiro(700, 0, 1000),
    porcentagemDoPonteiro(700, 200, 1000),
  )
  assert.equal(porcentagemDoPonteiro(700, 0, 1000), 70)
})

test('arrastar para fora do contêiner respeita os limites', () => {
  assert.equal(porcentagemDoPonteiro(-500, 200, 1000), MIN)
  assert.equal(porcentagemDoPonteiro(9999, 200, 1000), MAX)
})

test('largura zero não produz NaN', () => {
  assert.equal(porcentagemDoPonteiro(700, 200, 0), PADRAO)
})

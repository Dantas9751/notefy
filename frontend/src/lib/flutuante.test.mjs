/**
 * As caixas soltas sobre o app (relógio e Laviel) nunca saem da janela.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITES_DO_LAVIEL, LIMITES_DO_RELOGIO, caixaInicial, prenderNaTela } from './flutuante.js'

const tela = { w: 1280, h: 800 }

test('caixa solta: nunca sai da janela, nem quando ela encolhe', () => {
  const r = LIMITES_DO_RELOGIO
  assert.deepEqual(prenderNaTela({ x: 100, y: 100, w: 320, h: 200 }, tela, r), { x: 100, y: 100, w: 320, h: 200 })
  // Arrastada para fora, volta para a borda (com 8 px de margem).
  assert.deepEqual(prenderNaTela({ x: 5000, y: -50, w: 320, h: 200 }, tela, r), { x: 1280 - 320 - 8, y: 8, w: 320, h: 200 })
  // Tamanho dentro dos limites.
  const grande = prenderNaTela({ x: 0, y: 0, w: 5000, h: 10 }, tela, r)
  assert.deepEqual([grande.w, grande.h], [r.wMax, r.hMin])
  // Janela menor que a caixa: encolhe até o mínimo e fica no canto.
  assert.deepEqual(prenderNaTela({ x: 300, y: 300, w: 320, h: 200 }, { w: 230, h: 160 }, r), { x: 8, y: 8, w: 220, h: 150 })
})

test('cada caixa tem os próprios limites: o Laviel não encolhe até o tamanho do relógio', () => {
  const pequena = prenderNaTela({ x: 0, y: 0, w: 100, h: 100 }, tela, LIMITES_DO_LAVIEL)
  assert.deepEqual([pequena.w, pequena.h], [LIMITES_DO_LAVIEL.wMin, LIMITES_DO_LAVIEL.hMin])
})

test('caixa nova: no canto de cima à direita, dentro da janela', () => {
  const nova = caixaInicial(LIMITES_DO_LAVIEL, tela)
  assert.deepEqual(prenderNaTela(nova, tela, LIMITES_DO_LAVIEL), nova)
  assert.equal(nova.x + nova.w, tela.w - 24)
})

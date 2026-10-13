import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ATALHOS_DA_BARRA, arrumarBarra, barraParaSalvar, moverAtalho } from './barraLateral.js'

test('sem arrumação, tudo à mostra na ordem de fábrica', () => {
  const barra = arrumarBarra({})
  assert.deepEqual(barra.atalhos.map((a) => a.id), ATALHOS_DA_BARRA)
  assert.ok(barra.atalhos.every((a) => a.visivel))
  assert.deepEqual(barra.secoes, { favoritos: true, estudo: true, dica: true })
})

test('a ordem salva vale; id desconhecido cai fora e atalho novo entra no fim, à mostra', () => {
  const barra = arrumarBarra({ ordem: ['quadro', 'velho', 'inicio', 'quadro'], ocultos: ['roadmap', 'dica'] })
  assert.deepEqual(barra.atalhos.slice(0, 3).map((a) => a.id), ['quadro', 'inicio', 'recentes'])
  assert.equal(barra.atalhos.length, ATALHOS_DA_BARRA.length)
  assert.equal(barra.atalhos.find((a) => a.id === 'roadmap').visivel, false)
  assert.equal(barra.secoes.dica, false)
})

test('ida e volta pelo formato da conta', () => {
  const barra = arrumarBarra({ ordem: ['lixeira'], ocultos: ['buscar', 'estudo'] })
  assert.deepEqual(arrumarBarra(barraParaSalvar(barra)), barra)
})

test('mover leva o atalho para a posição pedida e ignora o impossível', () => {
  const { atalhos } = arrumarBarra({})
  assert.deepEqual(moverAtalho(atalhos, 0, 2).slice(0, 3).map((a) => a.id), ['recentes', 'arquivos', 'inicio'])
  assert.equal(moverAtalho(atalhos, 0, 99), atalhos)
})

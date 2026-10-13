import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leituraDaNota, mudarLeitura, umDe } from './aparencia.js'

test('a nota vale por cima do padrão, e o que não existe cai no padrão', () => {
  assert.deepEqual(leituraDaNota({ largura: 'inteira' }, { entrelinha: 'ampla' }), { largura: 'inteira', entrelinha: 'ampla' })
  assert.deepEqual(leituraDaNota({ largura: 'gigante' }, { entrelinha: 'qualquer' }), { largura: 'media', entrelinha: 'normal' })
  assert.deepEqual(leituraDaNota(null, { largura: 'estreita' }), { largura: 'estreita', entrelinha: 'normal' })
})

test('voltar ao padrão tira a chave, e sem chaves a nota não guarda leitura', () => {
  assert.deepEqual(mudarLeitura(undefined, 'largura', 'estreita'), { largura: 'estreita' })
  assert.deepEqual(mudarLeitura({ largura: 'estreita', entrelinha: 'ampla' }, 'largura', null), { entrelinha: 'ampla' })
  assert.equal(mudarLeitura({ largura: 'estreita' }, 'largura', null), undefined)
})

test('umDe só aceita o que está na lista', () => {
  assert.equal(umDe(110, [90, 100, 110], 100), 110)
  assert.equal(umDe('110', [90, 100, 110], 100), 100)
})

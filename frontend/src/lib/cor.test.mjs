import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contraste, hexParaRgb, hsvParaRgb, luminancia, misturar, normalizarHex, rgbParaHex, rgbParaHsv } from './cor.js'

test('normalizarHex aceita 3 ou 6 dígitos, com ou sem #, e recusa o resto', () => {
  assert.equal(normalizarHex('#abc'), '#AABBCC')
  assert.equal(normalizarHex(' 70864c '), '#70864C')
  for (const ruim of ['', '#12', '#12345', '#GGGGGG', null, undefined, '#1234567']) assert.equal(normalizarHex(ruim), null, String(ruim))
})

test('hex e RGB vão e voltam', () => {
  assert.deepEqual(hexParaRgb('#70864C'), [112, 134, 76])
  assert.equal(rgbParaHex([112, 134, 76]), '#70864C')
  assert.equal(rgbParaHex([300, -5, 0.4]), '#FF0000', 'fora de 0–255 é cortado')
})

test('HSV: as primárias, o cinza e a ida e volta', () => {
  assert.deepEqual(rgbParaHsv([255, 0, 0]), { h: 0, s: 1, v: 1 })
  assert.equal(rgbParaHsv([0, 255, 0]).h, 120)
  assert.equal(rgbParaHsv([0, 0, 255]).h, 240)
  assert.deepEqual(rgbParaHsv([128, 128, 128]), { h: 0, s: 0, v: 128 / 255 })
  assert.deepEqual(hsvParaRgb({ h: 120, s: 1, v: 1 }), [0, 255, 0])
  for (const cor of ['#70864C', '#3E6A8A', '#8A3B44', '#FFFFFF', '#000000', '#7AA2F7']) {
    assert.equal(rgbParaHex(hsvParaRgb(rgbParaHsv(hexParaRgb(cor)))), cor, cor)
  }
})

test('misturar vai de uma ponta à outra', () => {
  assert.equal(misturar('#000000', '#FFFFFF', 0), '#000000')
  assert.equal(misturar('#000000', '#FFFFFF', 1), '#FFFFFF')
  assert.equal(misturar('#000000', '#FFFFFF', 0.5), '#808080')
})

test('contraste: preto no branco é 21, igual é 1, e não depende da ordem', () => {
  assert.equal(luminancia('#FFFFFF'), 1)
  assert.equal(Math.round(contraste('#000000', '#FFFFFF')), 21)
  assert.equal(contraste('#70864C', '#70864C'), 1)
  assert.equal(contraste('#123456', '#ABCDEF'), contraste('#ABCDEF', '#123456'))
})

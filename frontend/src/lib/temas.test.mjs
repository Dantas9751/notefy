import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cssDoTema, TEMAS } from './temas.js'

const luz = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (a, b) => {
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

test('todo tema tem a escala inteira, do mais claro ao mais escuro', () => {
  for (const tema of TEMAS) {
    assert.equal(tema.ink.length, 12, tema.id)
    for (const cor of [...tema.ink, tema.destaque]) assert.match(cor, /^#[0-9a-f]{6}$/i, tema.id)
    for (let i = 1; i < 12; i += 1) assert.ok(luz(tema.ink[i]) < luz(tema.ink[i - 1]), `${tema.id}: passo ${i} não escurece`)
  }
})

test('o texto do app escuro (ink-100 sobre ink-950) é legível em todo tema', () => {
  for (const tema of TEMAS) {
    assert.ok(contraste(tema.ink[1], tema.ink[11]) >= 7, `${tema.id}: ${contraste(tema.ink[1], tema.ink[11]).toFixed(1)}`)
    // Texto secundário (ink-400) também passa do mínimo de leitura.
    assert.ok(contraste(tema.ink[5], tema.ink[11]) >= 4.5, `${tema.id} secundário: ${contraste(tema.ink[5], tema.ink[11]).toFixed(1)}`)
  }
})

test('a regra traz as doze variáveis em canais RGB; tema desconhecido não traz nada', () => {
  const css = cssDoTema('dracula')
  assert.equal((css.match(/--ink-\d+:/g) ?? []).length, 12)
  assert.match(css, /--ink-950:33 34 44;/)
  assert.equal(cssDoTema('light'), '')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMOJIS_SUGERIDOS, ehEmoji, emojiDe, primeiroEmoji } from './icone.js'

test('emoji simples, composto, com tom de pele e bandeira valem; texto não', () => {
  for (const emoji of ['📘', '✏️', '\u{1F469}‍\u{1F393}', '\u{1F44D}\u{1F3FD}', '\u{1F1E7}\u{1F1F7}', ...EMOJIS_SUGERIDOS]) {
    assert.ok(ehEmoji(emoji), emoji)
  }
  for (const valor of ['', 'Oi', '📘 x', '日', '1', 'book-open', null]) assert.equal(ehEmoji(valor), false, String(valor))
})

test('o nome de ícone antigo não é desenhado', () => {
  assert.equal(emojiDe({ icon: 'book-open' }), null)
  assert.equal(emojiDe({ icon: '📘' }), '📘')
  assert.equal(emojiDe(null), null)
})

test('do que foi colado, só o primeiro emoji', () => {
  assert.equal(primeiroEmoji(' \u{1F469}‍\u{1F393}📘 '), '\u{1F469}‍\u{1F393}')
  assert.equal(primeiroEmoji('abc'), null)
  assert.equal(primeiroEmoji(''), null)
})

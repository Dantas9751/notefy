/**
 * O ícone de um item: um emoji, no lugar do ícone do tipo.
 *
 * A mesma regra do servidor (`validar_icone`): só símbolos e as peças que
 * costuram um emoji (junta-emoji, seletor de apresentação, tom de pele,
 * bandeiras). O campo do item também guarda nomes de ícone antigos
 * (`book-open`), que não são desenhados.
 */

const PECAS = /^(?:\p{So}|\p{Sk}|\p{Mn}|\p{Me}|‍|[︎️]|[\u{E0020}-\u{E007F}])+$/u

export const ehEmoji = (texto) =>
  typeof texto === 'string' && texto.length > 0 && texto.length <= 32 && PECAS.test(texto) && /\p{So}/u.test(texto)

/** O emoji do item, ou `null`. */
export const emojiDe = (item) => (ehEmoji(item?.icon) ? item.icon : null)

/** O primeiro emoji do que foi digitado ou colado (o painel de emojis pode mandar dois), ou `null`. */
export function primeiroEmoji(texto) {
  const limpo = (texto ?? '').trim()
  if (!limpo) return null
  const primeiro =
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(limpo)[Symbol.iterator]().next().value.segment
      : limpo
  return ehEmoji(primeiro) ? primeiro : null
}

/** Os que aparecem prontos para escolher: estudo e trabalho primeiro. */
export const EMOJIS_SUGERIDOS = [
  '📘', '📗', '📙', '📕', '📓', '📝', '✏️', '📌',
  '📎', '📐', '🧮', '🔬', '🧪', '🧬', '🧠', '💡',
  '🎯', '✅', '⭐', '🔥', '🚀', '💼', '📊', '📈',
  '🗂️', '📁', '🗓️', '⏰', '🎓', '🌍', '🎨', '🎵',
  '💻', '⚙️', '🧩', '❤️', '🌱', '☕', '📷', '🎬',
  '✈️', '🏠', '💰', '🛒', '🍎', '⚽', '🐶', '🌙',
]

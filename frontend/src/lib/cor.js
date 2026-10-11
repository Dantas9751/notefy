/**
 * Contas de cor: hex, RGB, HSV, mistura e contraste.
 *
 * Módulo puro, sem React nem DOM. O seletor de cor (`SeletorDeCor`) e os
 * temas personalizados (`lib/temas.js`) usam as mesmas funções, então a cor
 * que se vê no seletor é a que a escala do tema recebe.
 */

/** '#abc', 'ABCDEF', '#aabbcc' → '#AABBCC'; qualquer outra coisa → `null`. */
export function normalizarHex(texto) {
  const limpo = String(texto ?? '').trim().replace(/^#/, '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(limpo)) return null
  const cheio = limpo.length === 3 ? [...limpo].map((c) => c + c).join('') : limpo
  return `#${cheio.toUpperCase()}`
}

/** '#AABBCC' → [170, 187, 204]. */
export const hexParaRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

const dois = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')

/** [170, 187, 204] → '#AABBCC'. */
export const rgbParaHex = ([r, g, b]) => `#${dois(r)}${dois(g)}${dois(b)}`.toUpperCase()

/** RGB 0–255 → { h: 0–360, s: 0–1, v: 0–1 }. */
export function rgbParaHsv([r, g, b]) {
  const [rn, gn, bn] = [r, g, b].map((c) => c / 255)
  const max = Math.max(rn, gn, bn)
  const d = max - Math.min(rn, gn, bn)
  let h = 0
  if (d) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
    else if (max === gn) h = ((bn - rn) / d + 2) * 60
    else h = ((rn - gn) / d + 4) * 60
  }
  return { h, s: max ? d / max : 0, v: max }
}

/** { h: 0–360, s: 0–1, v: 0–1 } → [r, g, b] em 0–255. */
export function hsvParaRgb({ h, s, v }) {
  const f = (n) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [f(5), f(3), f(1)].map((c) => Math.round(c * 255))
}

/** A cor entre `a` e `b`: `quanto` 0 é `a`, 1 é `b`. Mistura em RGB, que basta para uma escala de cinzas. */
export function misturar(a, b, quanto) {
  const [x, y] = [hexParaRgb(a), hexParaRgb(b)]
  return rgbParaHex(x.map((c, i) => c + (y[i] - c) * quanto))
}

/** Luminância relativa (WCAG), de 0 (preto) a 1 (branco). */
export function luminancia(hex) {
  const [r, g, b] = hexParaRgb(hex)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razão de contraste (WCAG) entre duas cores: de 1 (iguais) a 21 (preto no branco). */
export function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

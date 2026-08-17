/**
 * Gera a escala 50–900 da cor de destaque a partir de uma cor só.
 *
 * O usuário escolhe UMA cor no seletor, mas a interface usa dez tons dela
 * (fundo de chip em `accent-50`, botão em `accent-600`, texto em
 * `accent-700`...). Pedir dez cores seria absurdo, e usar a mesma em todo
 * lugar destruiria o contraste — então derivamos a escala.
 *
 * O método: mantém o matiz e a saturação da cor escolhida e aplica a curva
 * de luminosidade do índigo original do Tailwind. É isso que faz qualquer
 * cor render uma escala com o mesmo "peso" visual que a paleta de fábrica,
 * em vez de dez variações aleatórias.
 */

/** Luminosidade (%) de cada degrau, medida no índigo que era o padrão. */
const LUMINOSIDADE = {
  50: 96.7,
  100: 93.9,
  200: 88.8,
  300: 82.2,
  400: 73.9,
  500: 66.7,
  600: 58.6,
  700: 50.6,
  800: 41.4,
  900: 34.3,
}

/**
 * Saturação relativa de cada degrau.
 *
 * Os tons claros precisam de mais saturação para não virarem cinza, e os
 * escuros de menos para não ficarem berrantes — é a mesma proporção que o
 * índigo original tem entre as pontas e o meio da escala.
 */
const SATURACAO = {
  50: 1.19,
  100: 1.19,
  200: 1.14,
  300: 1.12,
  400: 1.06,
  500: 1.0,
  600: 0.89,
  700: 0.69,
  800: 0.65,
  900: 0.56,
}

export const CORES_PADRAO = [
  '#4F46E5', // índigo (padrão de fábrica)
  '#0EA5E9', // azul
  '#10B981', // verde
  '#F59E0B', // âmbar
  '#EF4444', // vermelho
  '#EC4899', // rosa
  '#8B5CF6', // violeta
  '#64748B', // ardósia
]

export const ACCENT_PADRAO = CORES_PADRAO[0]

/** '#4F46E5' → { h, s, l } com s e l em 0–100. */
export function hexParaHsl(hex) {
  const limpo = String(hex).replace('#', '').trim()
  const cheio =
    limpo.length === 3
      ? limpo
          .split('')
          .map((c) => c + c)
          .join('')
      : limpo
  const r = parseInt(cheio.slice(0, 2), 16) / 255
  const g = parseInt(cheio.slice(2, 4), 16) / 255
  const b = parseInt(cheio.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }

  return { h: h * 360, s: s * 100, l: l * 100 }
}

/** HSL → [r, g, b] em 0–255. */
export function hslParaRgb(h, s, l) {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  const setor = Math.floor(((h % 360) + 360) % 360 / 60)
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][setor]
  return [r, g, b].map((v) => Math.round((v + m) * 255))
}

/** Aceita '#abc', '#aabbcc' — com ou sem '#'. */
export function corValida(hex) {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(hex ?? '').trim())
}

/** { 50: '238 242 255', ... } pronto para virar variável CSS. */
export function escalaDe(hex) {
  const { h, s } = hexParaHsl(hex)
  const escala = {}
  for (const [degrau, l] of Object.entries(LUMINOSIDADE)) {
    // Teto em 100: uma cor já saturada multiplicada por 1.19 estouraria.
    const saturacao = Math.min(100, s * SATURACAO[degrau])
    escala[degrau] = hslParaRgb(h, saturacao, l).join(' ')
  }
  return escala
}

const ID_ESTILO = 'notefy-accent'

/**
 * Aplica a escala como uma regra de folha de estilo.
 *
 * Poderia ser `documentElement.style.setProperty`, mas uma <style> própria
 * deixa a paleta num lugar só, inspecionável, e mantém o atributo `style`
 * do <html> livre para outras coisas. Voltar ao padrão é esvaziar a regra,
 * e aí valem os valores de fábrica declarados no index.css — sem precisar
 * remover dez propriedades uma a uma.
 */
export function aplicarAccent(hex) {
  const cor = corValida(hex) ? hex : ACCENT_PADRAO

  let folha = document.getElementById(ID_ESTILO)
  if (!folha) {
    folha = document.createElement('style')
    folha.id = ID_ESTILO
    document.head.appendChild(folha)
  }

  // No padrão, a regra fica vazia para valer o índigo exato do index.css.
  // A escala derivada chega perto, mas não é idêntica, e não faz sentido
  // "quase" reproduzir a paleta original que já está na folha de estilo.
  if (cor.toLowerCase() === ACCENT_PADRAO.toLowerCase()) {
    folha.textContent = ''
    return cor
  }

  const linhas = Object.entries(escalaDe(cor))
    .map(([degrau, valor]) => `--accent-${degrau}:${valor};`)
    .join('')
  folha.textContent = `:root{${linhas}}`
  return cor
}

/**
 * Caixas soltas sobre o app — o relógio e o Laviel flutuantes: onde ficam,
 * de que tamanho, e sempre dentro da janela.
 */

const prender = (n, min, max) => Math.min(max, Math.max(min, n))

/** Tamanho de partida e limites de cada caixa. */
export const LIMITES_DO_RELOGIO = { w: 320, h: 200, wMin: 220, hMin: 150, wMax: 640, hMax: 420 }
export const LIMITES_DO_LAVIEL = { w: 400, h: 560, wMin: 320, hMin: 360, wMax: 760, hMax: 1100 }

/** Onde uma caixa nova aparece: no canto de cima à direita, abaixo da faixa de abas. */
export const caixaInicial = (limites, tela) => ({ x: tela.w - limites.w - 24, y: 72, w: limites.w, h: limites.h })

/**
 * Prende a caixa dentro da `tela` (a janela do app), com uma margem:
 * arrastada até a borda, ou com a janela encolhida depois, ela nunca some
 * de vista. O tamanho fica entre os limites e cabe na tela.
 */
export function prenderNaTela(caixa, tela, limites, margem = 8) {
  const { wMin, hMin, wMax, hMax } = limites
  const w = prender(caixa.w, wMin, Math.max(wMin, Math.min(wMax, tela.w - margem * 2)))
  const h = prender(caixa.h, hMin, Math.max(hMin, Math.min(hMax, tela.h - margem * 2)))
  return {
    x: Math.round(prender(caixa.x, margem, Math.max(margem, tela.w - w - margem))),
    y: Math.round(prender(caixa.y, margem, Math.max(margem, tela.h - h - margem))),
    w: Math.round(w),
    h: Math.round(h),
  }
}

/** Um valor guardado neste aparelho (JSON), ou `padrao` se não houver ou não der para ler. */
export function lerDoAparelho(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto === null ? padrao : JSON.parse(bruto)
  } catch {
    return padrao
  }
}

export function guardarNoAparelho(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    // Modo privado: vale só nesta sessão.
  }
}

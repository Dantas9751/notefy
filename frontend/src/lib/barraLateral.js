/**
 * A barra lateral do jeito da pessoa: a ordem dos atalhos e o que fica
 * escondido. Mora na conta (`sidebar_layout`), como o Início, e é a mesma
 * na barra aberta e no trilho recolhido.
 *
 * O servidor só confere a forma; quem sabe quais ids existem é daqui. Um
 * atalho que o app ganhar depois entra no fim, à mostra, para quem já tinha
 * arrumado a barra: escondido é só o que está em `ocultos`.
 */

export const ATALHOS_DA_BARRA = ['inicio', 'recentes', 'arquivos', 'buscar', 'quadro', 'calendario', 'roadmap', 'modelos', 'lixeira']

/** Partes da barra que não são atalho: a lista de favoritos, o cronômetro de estudo e a dica de uso. */
export const SECOES_DA_BARRA = ['favoritos', 'estudo', 'dica']

/** `{ atalhos: [{ id, visivel }], secoes: { id: visivel } }` a partir do que a conta guardou. */
export function arrumarBarra(layout) {
  const salvos = Array.isArray(layout?.ordem) ? layout.ordem.filter((id) => ATALHOS_DA_BARRA.includes(id)) : []
  const ordem = [...new Set(salvos), ...ATALHOS_DA_BARRA.filter((id) => !salvos.includes(id))]
  const ocultos = new Set(Array.isArray(layout?.ocultos) ? layout.ocultos : [])
  return {
    atalhos: ordem.map((id) => ({ id, visivel: !ocultos.has(id) })),
    secoes: Object.fromEntries(SECOES_DA_BARRA.map((id) => [id, !ocultos.has(id)])),
  }
}

/** De volta ao formato da conta. */
export function barraParaSalvar({ atalhos, secoes }) {
  return {
    ordem: atalhos.map((a) => a.id),
    ocultos: [...atalhos.filter((a) => !a.visivel).map((a) => a.id), ...SECOES_DA_BARRA.filter((id) => !secoes[id])],
  }
}

/** Os atalhos com o de `de` levado para a posição `para`. */
export function moverAtalho(atalhos, de, para) {
  if (de === para || de < 0 || para < 0 || de >= atalhos.length || para >= atalhos.length) return atalhos
  const copia = [...atalhos]
  const [item] = copia.splice(de, 1)
  copia.splice(para, 0, item)
  return copia
}

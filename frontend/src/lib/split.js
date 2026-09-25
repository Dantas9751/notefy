/**
 * Regras da divisória do split view.
 *
 * Módulo próprio porque é a única aritmética do recurso — e a que erra
 * calado: um limite trocado só aparece como um painel de 3% que ninguém
 * consegue mais arrastar de volta.
 */

/** Um painel menor que isto não mostra conteúdo útil, só barra de rolagem. */
export const MIN = 20
export const MAX = 80
export const PADRAO = 50

/** Prende a porcentagem entre os limites. */
export function limitar(porcentagem) {
  if (!Number.isFinite(porcentagem)) return PADRAO
  return Math.min(MAX, Math.max(MIN, porcentagem))
}

/**
 * Converte a posição do ponteiro na porcentagem do painel esquerdo.
 *
 * `clientX` é absoluto na janela; `esquerda` é onde o contêiner começa.
 * Sem subtrair, a sidebar entraria na conta e a divisória saltaria para
 * longe do cursor no primeiro movimento.
 */
export function porcentagemDoPonteiro(clientX, esquerda, largura) {
  if (!largura) return PADRAO
  return limitar(((clientX - esquerda) / largura) * 100)
}

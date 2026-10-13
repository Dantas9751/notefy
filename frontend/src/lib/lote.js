/**
 * Operações em lote (excluir, mover, restaurar), iguais em toda tela: a
 * fila vai até o fim, um item recusado não impede os seguintes, e quem
 * chama recebe o resumo para montar o aviso.
 *
 * Em série, e não em paralelo: são dezenas de itens, e a ordem das
 * requisições fica previsível.
 */

import { extractError } from './erros.js'

/** `null` se tudo deu certo; senão `{ falhas, total, motivo }`, com o motivo da primeira recusa. */
export async function emLote(itens, operacao) {
  const motivos = []
  for (const item of itens) {
    try {
      await operacao(item)
    } catch (err) {
      motivos.push(extractError(err))
    }
  }
  return motivos.length ? { falhas: motivos.length, total: itens.length, motivo: motivos[0] } : null
}

/** O item já não está ali: apagado (404) ou na lixeira (410) — outra aba chegou antes. */
export const jaSaiu = (err) => err?.response?.status === 404 || err?.response?.status === 410

/** Para `.catch`: já ter saído é sucesso quando o pedido era tirar o item dali. */
export function ignorarSeJaSaiu(err) {
  if (!jaSaiu(err)) throw err
}

/**
 * "Continuar de onde parei": as abas da última sessão, guardadas no aparelho
 * por conta.
 *
 * As abas de cada janela moram no `sessionStorage` (`TabsContext`), que
 * acaba quando o app fecha. Para reabrir o que estava aberto, a janela
 * PRINCIPAL deixa também uma cópia aqui, no `localStorage`. As janelas
 * destacadas não escrevem: são um item solto ao lado, e a última a fechar
 * trocaria as abas da principal pelo item dela.
 */

import { chaveDaConta } from './conta.js'

const CHAVE = 'notefy.sessao'
const DESTACADA = 'notefy.janelaDestacada'

/** O `main.jsx` marca a janela que nasceu de "abrir em nova janela". Vale até ela fechar, num recarregar também. */
export function marcarJanelaDestacada() {
  try {
    sessionStorage.setItem(DESTACADA, '1')
  } catch {
    /* sem storage: a janela escreve como se fosse a principal */
  }
}

export function janelaDestacada() {
  try {
    return sessionStorage.getItem(DESTACADA) === '1'
  } catch {
    return false
  }
}

/** Só abas com caminho do app, sem o item novo que nunca foi salvo, e nada "não salvo". */
function abasValidas(abas) {
  if (!Array.isArray(abas)) return []
  return abas
    .filter(
      (aba) =>
        aba &&
        typeof aba.key === 'string' &&
        typeof aba.path === 'string' &&
        aba.path.startsWith('/') &&
        !aba.path.startsWith('//') &&
        !aba.path.includes('/new'),
    )
    .map((aba) => ({ ...aba, dirty: false }))
}

/** `ativa`: a chave da aba em foco. */
export function guardarSessao(abas, ativa) {
  const chave = chaveDaConta(CHAVE)
  if (!chave || janelaDestacada()) return
  try {
    localStorage.setItem(chave, JSON.stringify({ abas: abasValidas(abas), ativa }))
  } catch {
    /* sem storage: na próxima abertura não há de onde continuar */
  }
}

/** `{ abas, ativa }` da última sessão desta conta, ou `null`. `ativa` é sempre uma das abas. */
export function lerSessao() {
  const chave = chaveDaConta(CHAVE)
  if (!chave) return null
  try {
    const { abas, ativa } = JSON.parse(localStorage.getItem(chave) || 'null') ?? {}
    const validas = abasValidas(abas)
    if (!validas.length) return null
    return { abas: validas, ativa: validas.find((aba) => aba.key === ativa) ?? validas.at(-1) }
  } catch {
    return null
  }
}

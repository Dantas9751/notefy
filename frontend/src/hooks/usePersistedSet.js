import { useCallback, useState } from 'react'

/**
 * Conjunto de chaves que sobrevive ao recarregar.
 *
 * Nasceu de duas cópias idênticas — a expansão da árvore de categorias e a
 * de pastas — que só diferiam na chave do storage e no nome das variáveis.
 *
 * O storage pode recusar leitura e escrita (aba anônima, cota estourada,
 * site data bloqueado). Quando isso acontece o conjunto continua valendo
 * em memória: perder a expansão ao recarregar é aceitável, quebrar a
 * sidebar não é.
 */
export function usePersistedSet(storageKey) {
  const [values, setValues] = useState(() => {
    try {
      const lido = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      return new Set(Array.isArray(lido) ? lido : [])
    } catch {
      return new Set()
    }
  })

  const persist = useCallback(
    (next) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        /* sem storage: vale só nesta sessão */
      }
      return next
    },
    [storageKey],
  )

  const toggle = useCallback(
    (key) => {
      setValues((prev) => {
        const next = new Set(prev)
        if (!next.delete(key)) next.add(key)
        return persist(next)
      })
    },
    [persist],
  )

  const ensureOpen = useCallback(
    (key) => {
      setValues((prev) => (prev.has(key) ? prev : persist(new Set(prev).add(key))))
    },
    [persist],
  )

  return { values, toggle, ensureOpen }
}

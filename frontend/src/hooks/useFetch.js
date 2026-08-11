import { useCallback, useEffect, useRef, useState } from 'react'
import api, { extractError } from '@/lib/api'

/**
 * GET com estados de carregamento, erro e refetch.
 *
 * Cada disparo recebe um AbortController: se as dependências mudarem no
 * meio do voo (o usuário digita na busca, troca de pasta), a resposta
 * antiga é descartada em vez de sobrescrever a nova — a corrida clássica
 * que faz a tela mostrar o resultado errado.
 */
export function useFetch(url, { params, enabled = true, deps = [] } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)
  const controllerRef = useRef(null)

  const paramsKey = JSON.stringify(params ?? {})

  const run = useCallback(async () => {
    if (!enabled || !url) {
      setLoading(false)
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const response = await api.get(url, { params, signal: controller.signal })
      setData(response.data)
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
      setError(extractError(err))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paramsKey, enabled, ...deps])

  useEffect(() => {
    run()
    return () => controllerRef.current?.abort()
  }, [run])

  return { data, loading, error, refetch: run, setData }
}

/** Estado de submissão para POST/PATCH/DELETE. */
export function useMutation(fn) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const mutate = useCallback(
    async (...args) => {
      setLoading(true)
      setError(null)
      try {
        return await fn(...args)
      } catch (err) {
        setError(extractError(err))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [fn],
  )

  return { mutate, loading, error, setError }
}

/** Adia o valor até parar de mudar por `delay` ms. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

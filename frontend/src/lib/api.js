import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const TOKEN_KEY = 'notefy.access'
export const REFRESH_KEY = 'notefy.refresh'

export const tokenStore = {
  get access() {
    return localStorage.getItem(TOKEN_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set({ access, refresh }) {
    if (access) localStorage.setItem(TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = tokenStore.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  // Deixa o browser definir o boundary do multipart; forçar o header
  // quebraria o upload de anexos.
  if (config.data instanceof FormData) delete config.headers['Content-Type']
  return config
})

/**
 * Refresh compartilhado.
 *
 * Numa tela que dispara várias requisições em paralelo, todas podem tomar
 * 401 ao mesmo tempo. Sem compartilhar a chamada, cada uma pediria um
 * refresh — e com ROTATE_REFRESH_TOKENS ligado no backend, o primeiro
 * refresh invalida os demais e o usuário cairia para a tela de login sem
 * motivo.
 *
 * Quem chega no meio do caminho espera a MESMA promise, em vez de entrar
 * numa fila de callbacks: a fila tinha uma janela de um microtask entre
 * "já avisei todo mundo" e "já zerei a variável", e quem caísse ali dentro
 * se inscrevia numa lista que ninguém mais ia percorrer — a requisição
 * ficava pendurada para sempre, com o spinner na tela.
 */
let refreshing = null

let onAuthFailure = () => {}
export function setAuthFailureHandler(fn) {
  onAuthFailure = fn
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error

    if (!response || response.status !== 401 || config?._retry) {
      return Promise.reject(error)
    }
    // O próprio endpoint de refresh falhando significa sessão encerrada.
    if (config.url?.includes('/auth/refresh')) {
      tokenStore.clear()
      onAuthFailure()
      return Promise.reject(error)
    }

    const refreshToken = tokenStore.refresh
    if (!refreshToken) {
      onAuthFailure()
      return Promise.reject(error)
    }

    config._retry = true

    if (!refreshing) {
      refreshing = axios
        .post(`${BASE_URL}/auth/refresh/`, { refresh: refreshToken })
        .then(({ data }) => {
          tokenStore.set({ access: data.access, refresh: data.refresh })
          return data.access
        })
        .catch((err) => {
          tokenStore.clear()
          onAuthFailure()
          throw err
        })
        .finally(() => {
          refreshing = null
        })
    }

    let newToken
    try {
      newToken = await refreshing
    } catch {
      return Promise.reject(error)
    }
    if (!newToken) return Promise.reject(error)

    // O interceptor de request relê o token do storage; este header é o
    // plano B para quando a escrita no localStorage falha (aba anônima,
    // cota estourada) e a leitura volta vazia.
    config.headers.Authorization = `Bearer ${newToken}`
    return api(config)
  },
)

export { extractError } from './erros'

export default api

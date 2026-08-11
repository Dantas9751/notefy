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
 * Fila de espera do refresh.
 *
 * Numa tela que dispara várias requisições em paralelo, todas podem tomar
 * 401 ao mesmo tempo. Sem esta fila, cada uma pediria um refresh — e com
 * ROTATE_REFRESH_TOKENS ligado no backend, o primeiro refresh invalida os
 * demais e o usuário cairia para a tela de login sem motivo.
 */
let refreshing = null
const listeners = []

function onRefreshed(token) {
  listeners.forEach((cb) => cb(token))
  listeners.length = 0
}

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
          onRefreshed(data.access)
          return data.access
        })
        .catch((err) => {
          tokenStore.clear()
          onRefreshed(null)
          onAuthFailure()
          throw err
        })
        .finally(() => {
          refreshing = null
        })
    }

    const newToken = await new Promise((resolve) => {
      listeners.push(resolve)
      refreshing.catch(() => {})
    })

    if (!newToken) return Promise.reject(error)

    config.headers.Authorization = `Bearer ${newToken}`
    return api(config)
  },
)

/** Achata os erros do DRF numa única mensagem legível. */
export function extractError(error, fallback = 'Algo deu errado. Tente novamente.') {
  const data = error?.response?.data
  if (!data) return error?.message || fallback
  if (typeof data === 'string') return data
  if (data.detail) return data.detail
  const first = Object.entries(data)[0]
  if (!first) return fallback
  const [field, value] = first
  const message = Array.isArray(value) ? value[0] : value
  return field === 'non_field_errors' ? message : `${field}: ${message}`
}

export default api

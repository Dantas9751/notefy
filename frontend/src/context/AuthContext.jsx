import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { setAuthFailureHandler, tokenStore } from '@/lib/api'
import { definirConta, descartarSemDono } from '@/lib/conta'
import { esperarBackend } from '@/lib/desktop'
import { adotarEstudoSemDono } from '@/lib/estudo'

/** O documento é desta conta? 410 também: está na lixeira dela. */
const ehDaConta = (id) =>
  api.get(`/documents/${id}/`, { params: { abrir: 0 } }).then(
    () => true,
    (erro) => erro.response?.status === 410,
  )

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUserDoEstado] = useState(null)
  // `booting` cobre a checagem inicial da sessão. Sem ele, o app pisca a
  // tela de login por um instante antes de confirmar que já há sessão.
  const [booting, setBooting] = useState(true)

  // A conta vale no navegador ANTES de as telas dela montarem (abas, painel e
  // estudo leem o que é dela já no primeiro render): por isso aqui, junto com
  // o usuário, e não num efeito depois.
  // Aceita valor ou função, como o `setState` (as Configurações atualizam as preferências assim).
  const setUser = useCallback((proximo) => {
    setUserDoEstado((atual) => {
      const novo = typeof proximo === 'function' ? proximo(atual) : proximo
      definirConta(novo?.id)
      return novo
    })
  }, [])

  // Uma vez por conta que entra: o que foi gravado antes de ter dono.
  useEffect(() => {
    if (!user?.id) return
    descartarSemDono()
    adotarEstudoSemDono(ehDaConta)
  }, [user?.id])

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh
    if (refresh) {
      // Best-effort: se a revogação falhar, o token local já foi apagado.
      await api.post('/auth/logout/', { refresh }).catch(() => {})
    }
    tokenStore.clear()
    setUser(null)
  }, [setUser])

  useEffect(() => {
    // O interceptor do axios avisa quando o refresh falhou de vez.
    setAuthFailureHandler(() => setUser(null))
  }, [setUser])

  useEffect(() => {
    let active = true
    async function restoreSession() {
      // No desktop o backend sobe junto com a janela: sem esperar, o login
      // também sairia no vazio. A abertura animada cobre a espera.
      await esperarBackend()
      if (!tokenStore.access) {
        if (active) setBooting(false)
        return
      }
      try {
        const { data } = await api.get('/me/')
        if (active) setUser(data)
      } catch (erro) {
        // Só a recusa do servidor encerra a sessão. Um erro de conexão (o
        // backend ainda subindo, a rede caída) apagava o token e mandava
        // para o login quem tinha sessão válida.
        if (erro.response?.status === 401) tokenStore.clear()
      } finally {
        if (active) setBooting(false)
      }
    }
    restoreSession()
    return () => {
      active = false
    }
  }, [setUser])

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login/', { username, password })
    tokenStore.set({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    return data.user
  }, [setUser])

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register/', payload)
    tokenStore.set({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    return data.user
  }, [setUser])

  const value = useMemo(
    () => ({ user, setUser, booting, login, register, logout, isAuthenticated: !!user }),
    [user, setUser, booting, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return ctx
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { setAuthFailureHandler, tokenStore } from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // `booting` cobre a checagem inicial da sessão. Sem ele, o app pisca a
  // tela de login por um instante antes de confirmar que já há sessão.
  const [booting, setBooting] = useState(true)

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh
    if (refresh) {
      // Best-effort: se a revogação falhar, o token local já foi apagado.
      await api.post('/auth/logout/', { refresh }).catch(() => {})
    }
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    // O interceptor do axios avisa quando o refresh falhou de vez.
    setAuthFailureHandler(() => setUser(null))
  }, [])

  useEffect(() => {
    let active = true
    async function restoreSession() {
      if (!tokenStore.access) {
        setBooting(false)
        return
      }
      try {
        const { data } = await api.get('/me/')
        if (active) setUser(data)
      } catch {
        tokenStore.clear()
      } finally {
        if (active) setBooting(false)
      }
    }
    restoreSession()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login/', { email, password })
    tokenStore.set({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register/', payload)
    tokenStore.set({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    return data.user
  }, [])

  const value = useMemo(
    () => ({ user, setUser, booting, login, register, logout, isAuthenticated: !!user }),
    [user, booting, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return ctx
}

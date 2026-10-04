import { useCallback, useRef } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

/**
 * Preferências da conta (`/me/preferences/`), lidas do usuário logado e
 * gravadas na hora.
 *
 * A tela muda ANTES da resposta (o Início reorganiza os blocos no clique),
 * e só a resposta do pedido mais recente vale: dois cliques seguidos com a
 * do primeiro chegando por último desfariam o segundo.
 */
export function usePreferencias() {
  const { user, setUser } = useAuth()
  const ultimoRef = useRef(0)

  const salvar = useCallback(
    async (campos) => {
      const meu = (ultimoRef.current += 1)
      setUser((u) => u && { ...u, preferences: { ...(u.preferences ?? {}), ...campos } })
      const { data } = await api.patch('/me/preferences/', campos)
      if (meu === ultimoRef.current) setUser((u) => u && { ...u, preferences: data })
      return data
    },
    [setUser],
  )

  return { prefs: user?.preferences ?? {}, salvar }
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const UIContext = createContext(null)

const SIDEBAR_KEY = 'notefy.sidebar'
const THEME_KEY = 'notefy.theme'

export function UIProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true',
  )
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'system')
  // Overlay em telas estreitas: a sidebar não pode ocupar metade da tela.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()

    // Em 'system', o app precisa acompanhar a troca de tema do SO em tempo
    // real — sem isso o usuário teria que recarregar a página.
    if (theme !== 'system') return undefined
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [])

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
      theme,
      setTheme,
      mobileSidebarOpen,
      setMobileSidebarOpen,
    }),
    [sidebarCollapsed, toggleSidebar, theme, mobileSidebarOpen],
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI precisa estar dentro de <UIProvider>.')
  return ctx
}

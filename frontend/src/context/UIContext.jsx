import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import i18n, { IDIOMA_KEY, idiomaSalvo } from '@/lib/i18n'
import { ACCENT_PADRAO, aplicarAccent, corValida } from '@/lib/accent'

const UIContext = createContext(null)

const SIDEBAR_KEY = 'notefy.sidebar'
const THEME_KEY = 'notefy.theme'
const ACCENT_KEY = 'notefy.accent'
const ZEN_KEY = 'notefy.zen'

export function UIProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true',
  )
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'system')
  // Overlay em telas estreitas: a sidebar não pode ocupar metade da tela.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [accent, setAccentState] = useState(() => {
    const guardado = localStorage.getItem(ACCENT_KEY)
    return corValida(guardado) ? guardado : ACCENT_PADRAO
  })
  const [language, setLanguageState] = useState(idiomaSalvo)
  // Modo zen: some com a sidebar e os cabecalhos para sobrar so o
  // conteudo. Persistido porque quem escreve muito quer entrar no app ja
  // dentro dele, sem reativar toda vez.
  const [zen, setZen] = useState(() => localStorage.getItem(ZEN_KEY) === 'true')

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

  useEffect(() => {
    localStorage.setItem(ACCENT_KEY, accent)
    aplicarAccent(accent)
  }, [accent])

  useEffect(() => {
    localStorage.setItem(ZEN_KEY, String(zen))
    document.documentElement.classList.toggle('zen', zen)
  }, [zen])

  useEffect(() => {
    localStorage.setItem(IDIOMA_KEY, language)
    i18n.changeLanguage(language)
    document.documentElement.lang = language
  }, [language])

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [])
  const toggleZen = useCallback(() => setZen((v) => !v), [])
  const setAccent = useCallback(
    (cor) => setAccentState(corValida(cor) ? cor : ACCENT_PADRAO),
    [],
  )

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
      theme,
      setTheme,
      mobileSidebarOpen,
      setMobileSidebarOpen,
      zen,
      setZen,
      toggleZen,
      accent,
      setAccent,
      language,
      setLanguage: setLanguageState,
    }),
    [
      sidebarCollapsed,
      toggleSidebar,
      theme,
      mobileSidebarOpen,
      zen,
      toggleZen,
      accent,
      setAccent,
      language,
    ],
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI precisa estar dentro de <UIProvider>.')
  return ctx
}

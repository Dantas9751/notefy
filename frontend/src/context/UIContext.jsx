import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ACCENT_PADRAO, ACCENT_PADRAO_ANTIGO, aplicarAccent, corValida } from '@/lib/accent'
import { idioma } from '@/lib/i18n'
import { telaCheia } from '@/lib/desktop'
import { aplicarTema } from '@/lib/temas'
import { FONTES_DA_NOTA, FONTES_DO_APP, pilha } from '@/lib/fontes'

const UIContext = createContext(null)

const SIDEBAR_KEY = 'notefy.sidebar'
const THEME_KEY = 'notefy.theme'
const ACCENT_KEY = 'notefy.accent'
const ZEN_KEY = 'notefy.zen'
const FONTE_APP_KEY = 'notefy.fonteApp'
const FONTE_NOTA_KEY = 'notefy.fonteNota'

export function UIProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true',
  )
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'system')
  // Overlay em telas estreitas: a sidebar não pode ocupar metade da tela.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [accent, setAccentState] = useState(() => {
    const guardado = localStorage.getItem(ACCENT_KEY)
    if (guardado?.toLowerCase() === ACCENT_PADRAO_ANTIGO.toLowerCase()) return ACCENT_PADRAO
    return corValida(guardado) ? guardado : ACCENT_PADRAO
  })
  // Modo zen: some com a sidebar e os cabecalhos para sobrar so o
  // conteudo. Persistido porque quem escreve muito quer entrar no app ja
  // dentro dele, sem reativar toda vez.
  const [zen, setZen] = useState(() => localStorage.getItem(ZEN_KEY) === 'true')
  // Fontes do app e das notas: por aparelho, como o tema e a cor.
  const [fonteApp, setFonteApp] = useState(() => localStorage.getItem(FONTE_APP_KEY) || 'padrao')
  const [fonteNota, setFonteNota] = useState(() => localStorage.getItem(FONTE_NOTA_KEY) || 'app')

  useEffect(() => {
    localStorage.setItem(FONTE_APP_KEY, fonteApp)
    localStorage.setItem(FONTE_NOTA_KEY, fonteNota)
    const raiz = document.documentElement.style
    raiz.setProperty('--fonte-app', pilha(FONTES_DO_APP, fonteApp))
    raiz.setProperty('--fonte-nota', pilha(FONTES_DA_NOTA, fonteNota))
  }, [fonteApp, fonteNota])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    // Tema de cor (Midnight, Dracula...): troca a escala de cinzas e é
    // sempre escuro. Claro, escuro e sistema limpam a escala.
    const colorido = aplicarTema(theme)
    const apply = () => {
      const dark = colorido || theme === 'dark' || (theme === 'system' && media.matches)
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
    telaCheia(zen).catch(() => {})
  }, [zen])

  // Sair da tela cheia pelo navegador (Esc, F11) sai do zen junto: zen sem
  // tela cheia era o app com a moldura do navegador de volta e o cabeçalho
  // ainda escondido.
  useEffect(() => {
    const aoMudar = () => !document.fullscreenElement && setZen(false)
    document.addEventListener('fullscreenchange', aoMudar)
    return () => document.removeEventListener('fullscreenchange', aoMudar)
  }, [])

  // `-u-hc-h23` obriga o relógio de 24 horas nos campos nativos de data
  // e hora. Sem a extensão, o navegador segue o formato do SISTEMA
  // OPERACIONAL e mostra AM/PM mesmo com a página em português, e não há
  // outra forma de mandar nisso por CSS ou atributo.
  //
  // Está no `index.html` como atributo estático e aqui de novo porque o
  // React não mexe no <html>: esta linha é só a garantia de que ninguém
  // perdeu o atributo numa edição do template.
  useEffect(() => {
    // Em inglês o relógio de 12 horas é o esperado; só o português fixa as 24.
    // (`trocarIdioma` refaz isto quando a pessoa muda de língua.)
    document.documentElement.lang = idioma === 'pt-BR' ? 'pt-BR-u-hc-h23' : idioma
  }, [])

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
      fonteApp,
      setFonteApp,
      fonteNota,
      setFonteNota,
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
      fonteApp,
      fonteNota,
    ],
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI precisa estar dentro de <UIProvider>.')
  return ctx
}

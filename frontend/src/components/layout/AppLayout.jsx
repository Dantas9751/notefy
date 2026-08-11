import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { useUI } from '@/context/UIContext'
import { cn } from '@/lib/utils'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useUI()
  const navigate = useNavigate()
  const location = useLocation()

  // Navegar fecha o menu no mobile — senão o overlay ficaria por cima da
  // página recém-aberta.
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname, setMobileSidebarOpen])

  // Ctrl/Cmd+K abre a busca global de qualquer tela.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        navigate('/search')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-ink-950">
      {/* Sidebar fixa a partir de lg */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Sidebar como overlay em telas menores */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink-950/40"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
          <div className="relative animate-slide-up">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior só existe no mobile: no desktop a sidebar já
            oferece as mesmas ações e uma barra extra roubaria altura útil. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 px-4 lg:hidden dark:border-ink-800">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Abrir menu"
            className="rounded p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <Menu size={18} />
          </button>
          <span className="text-[15px] font-semibold tracking-tight">Notefy</span>
          <button
            onClick={() => navigate('/search')}
            aria-label="Buscar"
            className="ml-auto rounded p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <Search size={18} />
          </button>
        </header>

        <main className={cn('min-h-0 flex-1 overflow-y-auto')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Cabeçalho padrão das páginas internas. */
export function PageHeader({ title, subtitle, breadcrumb, actions, children }) {
  return (
    <div className="border-b border-ink-100 bg-white/80 px-6 py-5 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80">
      {breadcrumb}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function PageBody({ className, children }) {
  return <div className={cn('px-6 py-6', className)}>{children}</div>
}

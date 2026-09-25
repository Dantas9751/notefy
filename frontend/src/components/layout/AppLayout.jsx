import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Search, FolderPlus, Tag, FileText, Table, Network, LayoutTemplate, Maximize2 } from 'lucide-react'
import { useUI } from '@/context/UIContext'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useSplit } from '@/context/SplitContext'
import { useAssistente } from '@/context/AssistenteContext'
import { cn } from '@/lib/utils'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
import SplitPane from './SplitPane'
import AssistentePanel from '@/components/ai/AssistentePanel'
import { conectarJanelas } from '@/lib/desktop'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import { kindMeta } from '@/lib/documents'
import { NotificacoesProvider } from '@/context/NotificacoesContext'
import { AvisosFlutuantes, CentralDeNotificacoes } from './Notificacoes'

export default function AppLayout() {
  const { mobileSidebarOpen, setMobileSidebarOpen, toggleZen } = useUI()
  const navigate = useNavigate()
  const location = useLocation()
  
  const { user } = useAuth()
  const { refresh } = useWorkspace()
  const { fecharPainel, painel, registrarPathPainel } = useSplit()
  const { alternar: alternarAssistente } = useAssistente()
  const telaInicialAplicada = useRef(false)
  const ladoEmFoco = useRef('main')
  const { menu, openMenu, closeMenu } = useContextMenu()

  const [folderModal, setFolderModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(null)

  // 1. Redirecionamento da Tela Inicial
  useEffect(() => {
    if (telaInicialAplicada.current) return
    telaInicialAplicada.current = true

    if (location.pathname !== '/') return

    const destino = {
      calendar: '/calendar',
      board: '/board'
    }[user?.preferences?.default_view]

    if (destino) {
      navigate(destino, { replace: true })
    }
  }, [location.pathname, user, navigate])

  // 2. Navegar fecha o menu no mobile
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname, setMobileSidebarOpen])

  // 3. Ctrl/Cmd+K abre a busca global de qualquer tela.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        navigate('/search')
      }
      // Ctrl+. entra e sai do zen. Ponto porque nao colide com nenhum
      // atalho de edicao de texto, que e onde o zen mais e usado.
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        toggleZen()
      }
      // Ctrl+\ fecha o painel lateral — mesma tecla que o VS Code usa
      // para dividir. Só fecha: abrir exige escolher QUAL documento vai
      // ao lado, e isso o teclado não tem como perguntar.
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        fecharPainel()
      }
      // Ctrl+J abre o assistente de IA sobre o lado em foco: com o
      // "abrir ao lado" aberto e o foco no painel, ele cobre o painel;
      // senão, a main view.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        alternarAssistente(painel && ladoEmFoco.current === 'painel' ? 'painel' : 'main')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, toggleZen, fecharPainel, painel, alternarAssistente])

  // 3b. De que lado o usuário mexeu por último. `document.activeElement`
  // sozinho não serve: clicar no texto de um editor (ou em área sem
  // elemento focável) deixa o foco no body, e o Ctrl+J caía sempre na
  // main view mesmo com o painel em uso.
  useEffect(() => {
    const marcar = (e) => {
      const alvo = e.target
      if (!alvo?.closest) return
      // Cliques dentro do próprio assistente não mudam o lado — ele já
      // está ancorado onde deveria.
      if (alvo.closest('[data-assistente]')) return
      if (alvo.closest('[data-painel]')) ladoEmFoco.current = 'painel'
      else if (alvo.closest('[data-assistente-alvo]')) ladoEmFoco.current = 'main'
    }
    window.addEventListener('mousedown', marcar, true)
    window.addEventListener('focusin', marcar, true)
    return () => {
      window.removeEventListener('mousedown', marcar, true)
      window.removeEventListener('focusin', marcar, true)
    }
  }, [])

  // Painel fechado: o lado volta a ser a main view.
  useEffect(() => {
    if (!painel) ladoEmFoco.current = 'main'
  }, [painel])

  // 4. Uma janela destacada mexe no mesmo acervo. Repetir aqui os avisos
  // que já circulam dentro do app faz a outra janela se atualizar sozinha
  // — favoritar numa aparece na outra, sem nenhuma tela saber disso.
  useEffect(() => conectarJanelas(), [])

  // Lógica dinâmica rigorosa para o menu de contexto com base na rota atual
  //
  // `path` e `irPara` vêm de QUEM foi clicado: com o painel aberto, o
  // clique do lado direito tem que criar na pasta do PAINEL e abrir o
  // editor no PAINEL. `location.pathname` é sempre a rota da esquerda —
  // usá-lo dos dois lados era o que fazia o botão direito do painel agir
  // sobre a main view.
  const getContextMenuItems = (path, irPara) => {
    // Caso 1: Na Raiz / Início (ou Dashboard) -> Criar Categoria e Pastas Raiz
    if (path === '/' || path === '/dashboard') {
      return [
        {
          label: 'Criar categoria',
          icon: Tag,
          onClick: () => setCategoryModal({}),
        },
        { separator: true },
        {
          label: 'Nova pasta',
          icon: FolderPlus,
          onClick: () => setFolderModal({ parent: null }),
        },
      ]
    }

    // Caso 2: Dentro de uma Categoria (/categories/...) -> Criar Pastas na Categoria
    if (path.startsWith('/categories/')) {
      const categoryId = path.split('/')[2]
      return [
        {
          label: 'Nova pasta',
          icon: FolderPlus,
          onClick: () => setFolderModal({ parent: null, categoryId }),
        },
      ]
    }

    // Caso 3: Dentro de uma Pasta (/folders/...) -> Criar Subpastas e Itens (Notas, Planilhas, Diagramas, Canvas)
    if (path.startsWith('/folders/')) {
      const folderId = path.split('/')[2]
      return [
        {
          label: 'Nova subpasta',
          icon: FolderPlus,
          onClick: () => setFolderModal({ parent: { id: folderId } }),
        },
        { separator: true },
        {
          label: 'Nova nota',
          icon: FileText,
          onClick: () => irPara(`${kindMeta('note').route}/new?folder=${folderId}`),
        },
        {
          label: 'Nova planilha',
          icon: Table,
          onClick: () => irPara(`${kindMeta('spreadsheet').route}/new?folder=${folderId}`),
        },
        {
          label: 'Novo diagrama',
          icon: Network,
          onClick: () => irPara(`${kindMeta('diagram').route}/new?folder=${folderId}`),
        },
        {
          label: 'Novo canvas',
          icon: LayoutTemplate,
          onClick: () => irPara(`${kindMeta('canvas').route}/new?folder=${folderId}`),
        },
      ]
    }

    // Caso 4: Outras páginas -> Retorna array vazio
    return []
  }

  return (
    // A casca logada é o único lugar montado em toda tela: é daqui que a
    // central de notificações vigia os prazos, e é aqui dentro que a aba
    // de Configurações a alcança.
    <NotificacoesProvider>
    <div 
      className="flex h-screen overflow-hidden bg-white dark:bg-ink-950"
      onContextMenu={(e) => {
        if (e.target.closest('article') || e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
          return
        }

        // De qual lado veio o clique? O painel marca a própria subárvore
        // com `data-painel`; sem essa marca, o clique é da esquerda.
        const noPainel = !!painel && !!e.target.closest('[data-painel]')
        const path = noPainel ? painel.path.split('?')[0] : location.pathname
        const irPara = noPainel ? registrarPathPainel : navigate

        const items = getContextMenuItems(path, irPara)
        if (items.length === 0) return

        e.preventDefault()
        openMenu(e, { type: 'global-empty', items })
      }}
    >
      {/* Sidebar fixa a partir de lg */}
      <div className="app-sidebar hidden lg:flex">
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
        {/* Barra superior só existe no mobile */}
        <header className="app-topbar flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 px-4 lg:hidden dark:border-ink-800">
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

        {/* Sair do zen. Fica fora do cabecalho de proposito: o cabecalho
            e justamente o que o zen esconde, e sem esta saida o usuario
            ficaria preso no modo sem saber como voltar. */}
        <button
          onClick={toggleZen}
          title="Sair do modo zen (Ctrl+.)"
          aria-label="Sair do modo zen"
          // Canto inferior: o superior direito e onde todo editor poe a
          // acao primaria — aqui ele cobria o botao Salvar da nota, e no
          // zen o cabecalho sumido deixa a barra do editor ainda mais alta.
          // Embaixo nao disputa com nada: a barra de selecao multipla e
          // centralizada, e o `padding-bottom` do zen ja abre a folga.
          className="app-zen-exit fixed bottom-4 right-4 z-50 items-center gap-1.5 rounded-full border border-ink-200 bg-white/90 px-3 py-1.5 text-xs text-ink-500 shadow-pop backdrop-blur transition hover:text-ink-800 dark:border-ink-700 dark:bg-ink-900/90 dark:hover:text-ink-100"
        >
          <Maximize2 size={13} />
          Sair do zen
        </button>

        {/* A faixa de abas e o sino dividem a mesma linha. O sino fica
            FORA da fileira rolável: com muitas abas abertas ele rolaria
            junto e sumiria do canto. */}
        <div className="app-tabs flex shrink-0 items-stretch border-b border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/40">
          <TabBar />
          <CentralDeNotificacoes />
        </div>

        {/* `SplitPane` devolve os filhos crus quando não há painel aberto:
            sem "abrir ao lado", a árvore é a mesma de antes. */}
        <main className="flex min-h-0 flex-1 overflow-hidden">
          <SplitPane>
            {/* `flex-1` e `min-w-0`: dentro de um pai flex, um filho sem
                eles encolhe até o conteúdo — a tela inteira ficava
                espremida à esquerda mesmo sem painel aberto. Com o painel,
                a largura vem do `style` do SplitPane e o `flex-1` não
                atrapalha. */}
            <div
              data-assistente-alvo="main"
              className="h-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
            >
              <Outlet />
            </div>
          </SplitPane>
          <AssistentePanel />
        </main>
      </div>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu?.payload?.items ?? []}
      />

      <FolderFormModal
        open={!!folderModal}
        folder={folderModal?.folder}
        parent={folderModal?.parent}
        categoryId={folderModal?.categoryId}
        onClose={() => setFolderModal(null)}
        onSaved={() => {
          setFolderModal(null)
          refresh()
          window.dispatchEvent(new Event('notefy:moved'))
        }}
      />

      <CategoryFormModal
        open={!!categoryModal}
        category={categoryModal?.category}
        onClose={() => setCategoryModal(null)}
        onSaved={() => {
          setCategoryModal(null)
          refresh()
          window.dispatchEvent(new Event('notefy:moved'))
        }}
      />

      <AvisosFlutuantes />
    </div>
    </NotificacoesProvider>
  )
}

/** Cabeçalho padrão das páginas internas. */
export function PageHeader({ title, subtitle, breadcrumb, actions, children }) {
  return (
    <div className="app-page-header border-b border-ink-100 bg-white/80 px-6 py-5 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80">
      {breadcrumb}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="titulo truncate text-[26px] leading-tight">{title}</h1>
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

export function PageBody({ className, children, ...props }) {
  return (
    <div className={cn('app-page-body px-6 py-6', className)} {...props}>
      {children}
    </div>
  )
}
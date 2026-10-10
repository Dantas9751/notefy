import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  GanttChartSquare,
  Clock,
  Folder as FolderIcon,
  Kanban,
  Home,
  LayoutTemplate,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Download,
  Search,
  Star,
  Settings,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useUI } from '@/context/UIContext'
import { flattenFolders, useWorkspace } from '@/context/WorkspaceContext'
import { cn } from '@/lib/utils'
import { useF2, useRenomear } from '@/hooks/useRenomear'
import StudyTimer from '@/components/layout/StudyTimer'
import FavoritosSidebar from '@/components/layout/FavoritosSidebar'
import { ColorDot, Spinner } from '@/components/ui'
import DicaLateral from '@/components/ui/DicaLateral'
import { useTabs } from '@/context/TabsContext'
import { usePropriedadesNoMenu } from '@/context/PropriedadesContext'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import CategoryTree from './CategoryTree'
import { itensDaCategoria, itensDaPasta } from '@/components/layout/menusDaArvore'
import CreateMenu from './CreateMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import DestinationModal from '@/components/modals/DestinationModal'
import { useExcluirSelecao } from '@/hooks/useCascadeDelete'
import { avisarErro } from '@/lib/avisoFlutuante'
import { emLote } from '@/lib/lote'
import { parseKey } from '@/hooks/useMultiSelect'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { exportarSelecao } from '@/components/ExportMenu'
import { t } from '@/lib/i18n'
import { semMouse } from '@/lib/desktop'

const NAV_ITEMS = [
  { to: '/', get label() { return t('Início') }, icon: Home, end: true },
  { to: '/recent', get label() { return t('Recentes') }, icon: Clock },
  // Favoritos não entra aqui: a seção mais abaixo JÁ É a lista, e um
  // item de navegação levaria a uma tela com os mesmos nomes que já
  // estão à vista. A seção é o favorito inteiro; não há rota /favorites.
  { to: '/files', get label() { return t('Arquivos') }, icon: Paperclip },
  { to: '/search', get label() { return t('Buscar') }, icon: Search }, 
  { to: '/board', get label() { return t('Quadro') }, icon: Kanban },
  { to: '/calendar', get label() { return t('Calendário') }, icon: CalendarDays },
  { to: '/roadmap', get label() { return t('Roadmap') }, icon: GanttChartSquare },
  { to: '/templates', get label() { return t('Modelos') }, icon: LayoutTemplate },
  { to: '/trash', get label() { return t('Lixeira') }, icon: Trash2, },
]

/** Ativo na barra recolhida: quadrado cheio na cor de destaque, porque ali o ícone é o único sinal. */
const ATIVO_NO_TRILHO = 'bg-accent-100 text-accent-800 dark:bg-accent-500/20 dark:text-accent-200'
/** Botão do trilho (barra recolhida): 32px, a altura da linha da barra aberta. */
const QUADRADO = 'mx-auto flex h-8 w-8 items-center justify-center rounded-md transition'

/**
 * Ctrl, Shift ou o botão do meio num link da barra: abre numa aba NOVA do
 * Notefy, como no navegador — e não numa aba do navegador, onde o app
 * carregaria de novo, do zero (e no aplicativo, numa janela solta).
 */
function useAbaNova() {
  const { duplicarAba } = useTabs()
  const navigate = useNavigate()
  return useCallback(
    (caminho) => (e) => {
      if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return
      e.preventDefault()
      duplicarAba(caminho)
      navigate(caminho)
    },
    [duplicarAba, navigate],
  )
}

function NavItem({ to, label, icon: Icon, end, collapsed }) {
  const abaNova = useAbaNova()
  return (
    <DicaLateral rotulo={label} ativa={collapsed}>
      <NavLink
        to={to}
        end={end}
        onClick={abaNova(to)}
        onAuxClick={abaNova(to)}
        aria-label={collapsed ? label : undefined}
        className={({ isActive }) =>
          collapsed
            ? cn(QUADRADO, isActive ? ATIVO_NO_TRILHO : 'text-ink-500 hover:bg-ink-200/60 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100')
            : cn(
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition',
                isActive
                  ? 'bg-ink-100 font-medium text-ink-900 dark:bg-ink-800 dark:text-ink-50'
                  : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800/70',
              )
        }
      >
        <Icon size={16} className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    </DicaLateral>
  )
}

/**
 * O painel do trilho: UM só, para as categorias e os favoritos. Descer o
 * mouse pelas iniciais não pode empilhar painéis nem piscar pastas:
 *
 * - fechado, ele espera um instante antes de abrir (quem só está passando
 *   não vê nada);
 * - aberto, o próximo troca NO LUGAR dele, com um respiro curto — o mouse
 *   que corta outra inicial a caminho do painel não o troca no caminho.
 */
function usePainelDoTrilho() {
  const [painel, setPainel] = useState(null)
  const abrirRef = useRef(null)
  const fecharRef = useRef(null)
  const abertoRef = useRef(false)
  abertoRef.current = !!painel

  useEffect(
    () => () => {
      clearTimeout(abrirRef.current)
      clearTimeout(fecharRef.current)
    },
    [],
  )

  const ficar = () => {
    clearTimeout(abrirRef.current)
    clearTimeout(fecharRef.current)
  }
  const mostrar = (chave, alvo, agora = false) => {
    ficar()
    const r = alvo.getBoundingClientRect()
    // Perto do pé da tela o painel cresce para cima, rente ao ícone, em vez
    // de ser empurrado para longe dele.
    const embaixo = r.top > window.innerHeight - 340
    const novo = {
      chave,
      left: r.right + 8,
      ...(embaixo ? { bottom: Math.max(8, window.innerHeight - r.bottom - 4) } : { top: Math.max(8, r.top - 4) }),
    }
    if (agora) setPainel(novo)
    else abrirRef.current = setTimeout(() => setPainel(novo), abertoRef.current ? 120 : 280)
  }
  const fecharLogo = () => {
    ficar()
    fecharRef.current = setTimeout(() => setPainel(null), 200)
  }
  const fechar = () => {
    ficar()
    setPainel(null)
  }

  const gatilho = (chave) => ({
    onPointerEnter: (e) => e.pointerType === 'mouse' && mostrar(chave, e.currentTarget),
    onPointerLeave: fecharLogo,
    onFocus: (e) => mostrar(chave, e.currentTarget, true),
    onBlur: fecharLogo,
  })
  const noPainel = {
    onPointerEnter: ficar,
    onPointerLeave: fecharLogo,
    onFocus: ficar,
    onBlur: fecharLogo,
    onKeyDown: (e) => e.key === 'Escape' && fechar(),
    // Escolheu um lugar no painel: ele sai da frente.
    onClick: (e) => e.target.closest('a') && fechar(),
  }
  return { painel, gatilho, noPainel, mostrar }
}

/** Uma pasta no painel do trilho, com as subpastas logo abaixo, recuadas. */
function PastaNoPainel({ pasta, nivel, abaNova }) {
  const caminho = `/folders/${pasta.id}`
  return (
    <>
      <NavLink
        to={caminho}
        onClick={abaNova(caminho)}
        onAuxClick={abaNova(caminho)}
        style={{ paddingLeft: 8 + nivel * 14 }}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded py-1.5 pr-2 text-sm transition',
            isActive ? 'text-accent-700 dark:text-accent-300' : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
          )
        }
      >
        <FolderIcon size={14} className="shrink-0 text-ink-400" style={pasta.color ? { color: pasta.color } : undefined} />
        <span className="min-w-0 flex-1 truncate">{pasta.name}</span>
        {pasta.document_count > 0 && <span className="text-[11px] tabular-nums text-ink-400">{pasta.document_count}</span>}
      </NavLink>
      {(pasta.children ?? []).map((filha) => (
        <PastaNoPainel key={filha.id} pasta={filha} nivel={nivel + 1} abaNova={abaNova} />
      ))}
    </>
  )
}

/**
 * O que a árvore mostra com a barra aberta, no painel ao lado da inicial:
 * o nome da categoria e as pastas dela.
 */
function PastasDaCategoria({ categoria, abaNova }) {
  const caminho = `/categories/${categoria.id}`
  const pastas = categoria.folders ?? []
  return (
    <div>
      <NavLink
        to={caminho}
        onClick={abaNova(caminho)}
        onAuxClick={abaNova(caminho)}
        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm font-semibold text-ink-900 transition hover:bg-ink-100 dark:text-ink-50 dark:hover:bg-ink-800"
      >
        <ColorDot color={categoria.color} size={8} />
        <span className="min-w-0 flex-1 truncate">{categoria.name}</span>
      </NavLink>
      <div className="my-1 border-t border-ink-100 dark:border-ink-800" />
      {pastas.length ? (
        pastas.map((pasta) => <PastaNoPainel key={pasta.id} pasta={pasta} nivel={0} abaNova={abaNova} />)
      ) : (
        <p className="px-2 py-1.5 text-xs text-ink-400">{t('Nenhuma pasta aqui.')}</p>
      )}
    </div>
  )
}

/**
 * `sempreAberta`: a gaveta do celular. Lá não existe trilho — a gaveta já é
 * o jeito de esconder a barra —, então ela ignora a preferência e não
 * mostra o botão de recolher.
 */
export default function Sidebar({ sempreAberta = false }) {
  const { sidebarCollapsed, toggleSidebar, setMobileSidebarOpen } = useUI()
  const { user, logout } = useAuth()
  const { categories, loading, refresh } = useWorkspace()

  // Renomear pasta e categoria no lugar, na própria linha da árvore.
  // Depois do `useWorkspace`, que é de onde `refresh` vem.
  const renomear = useRenomear({ onRenamed: refresh })
  const navigate = useNavigate()
  const location = useLocation()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const fimDoMenu = usePropriedadesNoMenu()
  const abaNova = useAbaNova()
  const trilho = usePainelDoTrilho()

  const [folderModal, setFolderModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(null)

  // Estados de Multi-Seleção e Ações em Massa
  const [selectedIds, setSelectedIds] = useState([])
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  
  // Tratamento da Rota Dinâmica
  const rawHome = user?.settings?.home_page || '/'
  const homeRoute = rawHome.startsWith('/') ? rawHome : `/${rawHome}`
  
  const dynamicNav = NAV_ITEMS.map((item) =>
    item.to === '/' ? { ...item, to: homeRoute } : item
  )

  const { pedirExclusao, requestDelete, dialogs: deleteDialogs } = useExcluirSelecao({
    selecionados: selectedIds,
    itemDe: (chave) => flattenFolders(categories).find((pasta) => `folder:${pasta.id}` === chave),
    // Quem estava dentro do que saiu volta para o início.
    onExcluido: (alvo) => {
      setSelectedIds([])
      refresh()
      if (alvo && location.pathname.includes(alvo.id)) navigate(homeRoute)
    },
  })

  const collapsed = sidebarCollapsed && !sempreAberta
  const categoriaDoPainel = categories.find((c) => c.id === trilho.painel?.chave)

  useListenerDeJanela('keydown', (e) => {
    if (e.key === 'Escape') setSelectedIds([])
  })
  // O menu da árvore MOSTRA "F2" ao lado de "Renomear": a tecla precisa valer.
  useF2(renomear, selectedIds, ['folder'])

  useListenerDeJanela('notefy:moved', refresh)

  const handleDrop = useCallback(
    async (payload, target) => {
      try {
        if (payload.type === 'document') {
          await api.post(`/documents/${payload.id}/move/`, { folder: target.id })
        } else if (target.type === 'category') {
          await api.post(`/folders/${payload.id}/move/`, { category: target.id })
        } else {
          await api.post(`/folders/${payload.id}/move/`, { parent: target.id })
        }
        refresh()
        window.dispatchEvent(new CustomEvent('notefy:moved', { detail: { payload, target } }))
      } catch (err) {
        avisarErro(extractError(err))
      }
    },
    [refresh],
  )

  // A fila vai até o fim (`emLote`); o `notefy:moved` recarrega a árvore.
  const handleBulkMove = async (destinationFolderId) => {
    if (selectedIds.length === 0 || !destinationFolderId) return
    const recusa = await emLote(selectedIds, (chave) => {
      const { type, id } = parseKey(chave)
      return type === 'folder'
        ? api.post(`/folders/${id}/move/`, { parent: destinationFolderId })
        : api.post(`/documents/${id}/move/`, { folder: destinationFolderId })
    })
    setSelectedIds([])
    setMoveModalOpen(false)
    window.dispatchEvent(new Event('notefy:moved'))
    if (recusa) avisarErro(t('{falhas} de {total} não foram movidos. {motivo}', recusa))
  }

  const menuItems = () => {
    if (!menu) return []
    const { payload } = menu

    if (payload.isMultiple) {
      return [
        {
          label: t('Mover ({length})', { length: selectedIds.length }),
          icon: FolderIcon,
          onClick: () => setMoveModalOpen(true),
        },
        {
          label: t('Exportar ({length}) como .zip', { length: selectedIds.length }),
          icon: Download,
          onClick: () => exportarSelecao(selectedIds),
        },
        { separator: true },
        {
          label: t('Excluir ({length} selecionadas)', { length: selectedIds.length }),
          icon: Trash2,
          danger: true,
          onClick: pedirExclusao,
        },
      ]
    }

    if (payload.type === 'bookmark') {
      const isFile = payload.item.type !== 'folder' && payload.item.type !== 'category'
      return [
        { label: t('Abrir'), icon: ExternalLink, onClick: () => navigate(payload.item.url) },
        ...(isFile && payload.item.folder
          ? [
              {
                label: t('Ir para pasta'),
                icon: FolderIcon,
                onClick: () => navigate(`/folders/${payload.item.folder}`),
              },
            ]
          : []),
        { separator: true },
        {
          label: t('Remover dos favoritos'),
          icon: Trash2,
          danger: true,
          onClick: async () => {
            const rota = payload.item.type === 'folder' ? 'folders' : 'documents'
            const endpoint = `/${rota}/${payload.item.id}/`
            await api.patch(endpoint, { is_favorite: false })
            window.dispatchEvent(
              new CustomEvent('notefy:favorites-changed', {
                detail: { endpoint, is_favorite: false },
              }),
            )
          },
        },
        ...fimDoMenu(
          payload.item.type === 'folder' ? 'pasta' : payload.item.type === 'category' ? 'categoria' : 'documento',
          payload.item.id,
        ),
      ]
    }

    if (payload.type === 'category') {
      const category = payload.category
      return itensDaCategoria(category, {
        navigate,
        novaPasta: () => setFolderModal({ parent: null, categoryId: category.id }),
        renomear: () => renomear.abrir(category.id),
        editar: () => setCategoryModal({ category }),
        excluir: () => requestDelete({ kind: 'category', id: category.id, name: category.name }),
        fimDoMenu,
      })
    }

    const folder = payload.node
    return itensDaPasta(folder, {
      navigate,
      novaSubpasta: () => setFolderModal({ parent: folder, categoryId: payload.categoryId }),
      moverPara: () => {
        setSelectedIds([`folder:${folder.id}`])
        setMoveModalOpen(true)
      },
      renomear: () => renomear.abrir(folder.id),
      editar: () => setFolderModal({ folder, categoryId: payload.categoryId }),
      excluir: () => requestDelete({ kind: 'folder', id: folder.id, name: folder.name }),
      fimDoMenu,
    })
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <aside
        className={cn(
          'flex h-full shrink-0 flex-col border-r border-ink-200 bg-ink-50',
          'transition-[width] duration-200 ease-out dark:border-ink-800 dark:bg-ink-900',
          collapsed ? 'w-[60px]' : 'w-64',
        )}
      >
        <div className={cn('flex h-14 items-center px-3', collapsed && 'justify-center px-0')}>
          <DicaLateral rotulo={t('Início')} ativa={collapsed}>
            <Link
              to={homeRoute}
              onClick={abaNova(homeRoute)}
              onAuxClick={abaNova(homeRoute)}
              aria-label={collapsed ? t('Início') : undefined}
              className="truncate text-[15px] font-semibold tracking-tight text-ink-900 transition hover:text-accent-600 dark:text-ink-50"
            >
              {/* Recolhida, só a inicial do nome, no mesmo tipo. */}
              {collapsed ? t('Notefy').charAt(0) : t('Notefy')}
            </Link>
          </DicaLateral>
        </div>

        <div className={cn('px-3 pb-1', collapsed && 'flex justify-center px-0')}>
          <DicaLateral rotulo={t('Criar')} ativa={collapsed}>
            <CreateMenu collapsed={collapsed} />
          </DicaLateral>
        </div>

        <nav className={cn('min-h-0 flex-1 overflow-y-auto pb-4', collapsed ? 'px-0' : 'px-3')}>
          <div className="space-y-0.5 pt-3">
            {dynamicNav.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} />
            ))}
          </div>

          {!collapsed && (
            <>
              {/* Seção Categorias */}
              <div className="flex items-center justify-between px-2 pb-1 pt-3">
                <span className="secao">
                  {t('Categorias')}
                </span>
                <button
                  onClick={() => setCategoryModal({})}
                  aria-label={t('Nova categoria')}
                  title={t('Nova categoria')}
                  className="rounded p-0.5 text-ink-400 transition hover:text-accent-600"
                >
                  <Plus size={13} />
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center py-4">
                  <Spinner size={15} />
                </div>
              ) : (
                <CategoryTree
                  categories={categories}
                  selectedIds={selectedIds}
                  onSelectIds={setSelectedIds}
                  actions={{
                    onDrop: handleDrop,
                    onContextMenu: openMenu,
                    renomear,
                    onCreateFolder: ({ parent, categoryId }) =>
                      setFolderModal({ parent, categoryId }),
                  }}
                />
              )}

              <p className="mt-4 px-2 text-[10px] leading-relaxed text-ink-400">
                {semMouse()
            ? t('Toque e segure um item ou uma pasta para ver as opções.')
            : t('Arraste itens e pastas para mover. Clique com o botão direito para mais opções. Ctrl+/ mostra os atalhos.')}
              </p>

              <FavoritosSidebar aoAbrirMenu={openMenu} />
            </>
          )}

          {/* No trilho, as categorias viram iniciais na cor delas: um clique
              leva à categoria e o botão direito abre o mesmo menu da árvore. */}
          {collapsed && (
            <div className="mx-3 mt-3 space-y-0.5 border-t border-ink-200 pt-3 dark:border-ink-800">
              {categories.map((c) => {
                const cor = c.color || '#8C8A86'
                return (
                  <div key={c.id} {...trilho.gatilho(c.id)}>
                    <NavLink
                      to={`/categories/${c.id}`}
                      aria-label={c.name}
                      onClick={abaNova(`/categories/${c.id}`)}
                      onAuxClick={abaNova(`/categories/${c.id}`)}
                      onContextMenu={(e) => openMenu(e, { type: 'category', category: c })}
                      style={{ backgroundColor: `${cor}26`, color: cor, '--tw-ring-color': cor }}
                      className={({ isActive }) =>
                        cn(
                          QUADRADO,
                          'text-[11px] font-semibold',
                          isActive ? 'ring-2 ring-offset-2 ring-offset-ink-50 dark:ring-offset-ink-900' : 'hover:brightness-110',
                        )
                      }
                    >
                      {/* Duas palavras, duas letras: "Pesquisa Acadêmica" e "Pessoal" não viram dois "P". */}
                      {c.name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase()}
                    </NavLink>
                  </div>
                )
              })}
              <DicaLateral rotulo={t('Nova categoria')}>
                <button
                  onClick={() => setCategoryModal({})}
                  aria-label={t('Nova categoria')}
                  className={cn(QUADRADO, 'border border-dashed border-ink-300 text-ink-400 hover:border-accent-500 hover:text-accent-600 dark:border-ink-700')}
                >
                  <Plus size={15} />
                </button>
              </DicaLateral>
            </div>
          )}

          {/* Os favoritos também ficam a um passo com a barra recolhida: a
              estrela abre a mesma lista da barra aberta, no mesmo painel. */}
          {collapsed && (
            <div className="mx-3 mt-3 border-t border-ink-200 pt-3 dark:border-ink-800">
              <div {...trilho.gatilho('favoritos')}>
                <button
                  type="button"
                  onClick={(e) => trilho.mostrar('favoritos', e.currentTarget, true)}
                  aria-label={t('Favoritos')}
                  aria-expanded={trilho.painel?.chave === 'favoritos'}
                  className={cn(QUADRADO, 'text-ink-500 hover:bg-ink-200/60 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100')}
                >
                  <Star size={16} />
                </button>
              </div>
            </div>
          )}
        </nav>

        <div className={cn('border-t border-ink-200 dark:border-ink-800', collapsed ? 'space-y-0.5 px-0 py-3' : 'p-3')}>
          {/* Recolher e expandir no MESMO lugar, no topo do rodapé: o botão
              fica embaixo do cursor nos dois estados. */}
          {!sempreAberta && (
            <DicaLateral rotulo={t('Expandir menu')} ativa={collapsed}>
              <button
                onClick={toggleSidebar}
                aria-label={collapsed ? t('Expandir menu') : t('Recolher menu')}
                aria-expanded={!collapsed}
                className={cn(
                  'text-ink-500 transition hover:bg-ink-200/60 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100',
                  collapsed ? QUADRADO : 'mb-1 flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-xs',
                )}
              >
                {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                {!collapsed && t('Recolher menu')}
              </button>
            </DicaLateral>
          )}
          <StudyTimer collapsed={collapsed} />
          {collapsed && (
            <DicaLateral rotulo={t('Configurações')}>
              <NavLink
                to="/settings"
                onClick={abaNova('/settings')}
                onAuxClick={abaNova('/settings')}
                aria-label={t('Configurações')}
                // Sem realce de "ativo": é atalho do rodapé, como na barra aberta.
                className={cn(QUADRADO, 'text-ink-500 hover:bg-ink-200/60 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100')}
              >
                <Settings size={15} />
              </NavLink>
            </DicaLateral>
          )}
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center pt-1')}>
            <DicaLateral rotulo={t('Sua conta')} ativa={collapsed}>
              <NavLink
                to="/settings/conta"
                onClick={abaNova('/settings/conta')}
                onAuxClick={abaNova('/settings/conta')}
                aria-label={t('Sua conta')}
                className="block shrink-0 rounded-full ring-accent-400 transition hover:ring-2"
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-600 text-[11px] font-semibold text-white">
                    {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </NavLink>
            </DicaLateral>
            {!collapsed && (
              <>
                <NavLink to="/settings/conta" onClick={abaNova('/settings/conta')} onAuxClick={abaNova('/settings/conta')} className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-700 transition hover:text-accent-600 dark:text-ink-200 dark:hover:text-accent-400">
                    {user?.full_name || user?.username}
                  </p>
                </NavLink>
                <NavLink
                  to="/settings"
                  onClick={abaNova('/settings')}
                  onAuxClick={abaNova('/settings')}
                  aria-label={t('Configurações')}
                  className="rounded p-1.5 text-ink-400 transition hover:bg-ink-200/60 hover:text-ink-700 dark:hover:bg-ink-800"
                >
                  <Settings size={15} />
                </NavLink>
                <button
                  onClick={handleLogout}
                  aria-label={t('Sair')}
                  className="rounded p-1.5 text-ink-400 transition hover:bg-ink-200/60 hover:text-red-600 dark:hover:bg-ink-800"
                >
                  <LogOut size={15} />
                </button>
              </>
            )}
          </div>
        </div>

      </aside>

      {collapsed &&
        trilho.painel &&
        createPortal(
          <div
            style={{ left: trilho.painel.left, top: trilho.painel.top, bottom: trilho.painel.bottom }}
            {...trilho.noPainel}
            className="fixed z-[70] max-h-80 w-60 animate-fade-in overflow-y-auto rounded-md border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900"
          >
            {trilho.painel.chave === 'favoritos' ? (
              <FavoritosSidebar aoAbrirMenu={openMenu} noPainel />
            ) : (
              categoriaDoPainel && <PastasDaCategoria categoria={categoriaDoPainel} abaNova={abaNova} />
            )}
          </div>,
          document.body,
        )}

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menuItems()}
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
          setMobileSidebarOpen(false)
          // `refresh()` só atualiza a árvore da sidebar. Quem está com uma
          // pasta ou a busca aberta ao lado depende deste aviso — que os
          // mesmos modais no AppLayout já disparavam, e aqui faltava.
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

      <DestinationModal
        open={moveModalOpen}
        title={t('Mover {length} item(s)', { length: selectedIds.length })}
        confirmLabel={t('Mover para cá')}
        onClose={() => {
          setMoveModalOpen(false)
          setSelectedIds([])
        }}
        onPick={handleBulkMove}
      />

      {deleteDialogs}
    </>
  )
}
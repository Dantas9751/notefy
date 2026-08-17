import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  GanttChartSquare,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  FolderPlus,
  Folder as FolderIcon,
  Kanban,
  LayoutDashboard,
  LogOut,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  Tag,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { documentPath, kindMeta } from '@/lib/documents'
import { useAuth } from '@/context/AuthContext'
import { useUI } from '@/context/UIContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { cn } from '@/lib/utils'
import { Button, Spinner, Modal } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import CategoryTree from './CategoryTree'
import CreateMenu from './CreateMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import DestinationModal from '@/components/modals/DestinationModal'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'

const NAV_ITEMS = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/recent', label: 'Recentes', icon: Clock },
  { to: '/files', label: 'Arquivos', icon: Paperclip },
  { to: '/search', label: 'Buscar', icon: Search }, 
  { to: '/board', label: 'Quadro', icon: Kanban },
  { to: '/calendar', label: 'Calendário', icon: CalendarDays },
  { to: '/roadmap', label: 'Roadmap', icon: GanttChartSquare },
  { to: '/trash', label: 'Lixeira', icon: Trash2, },
]

function NavItem({ to, label, icon: Icon, end, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-ink-100 font-medium text-ink-900 dark:bg-ink-800 dark:text-ink-50'
            : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800/70',
        )
      }
    >
      <Icon size={16} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, setMobileSidebarOpen } = useUI()
  const { user, logout } = useAuth()
  const { categories, loading, refresh } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()
  const { menu, openMenu, closeMenu } = useContextMenu()

  const [folderModal, setFolderModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(null)
  const [error, setError] = useState(null)

  // Estados de Multi-Seleção e Ações em Massa
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  
  // Tratamento da Rota Dinâmica
  const rawHome = user?.settings?.home_page || '/'
  const homeRoute = rawHome.startsWith('/') ? rawHome : `/${rawHome}`
  
  const dynamicNav = NAV_ITEMS.map((item) =>
    item.label === 'Início' ? { ...item, to: homeRoute } : item
  )

  // Função Timerzinho para erros (Desaparece em 4s)
  const displayError = (msg) => {
    setError(msg)
    setTimeout(() => setError(null), 4000)
  }

  const { requestDelete, dialogs: deleteDialogs } = useCascadeDelete({
    onDeleted: (target) => {
      setSelectedIds([])
      refresh()
      if (location.pathname.includes(target.id)) {
        navigate(homeRoute)
      }
    },
    onError: displayError, // Conectado com o Timer
  })

  const collapsed = sidebarCollapsed

  const favDocs = useFetch('/documents/', {
    params: { is_favorite: true, ordering: '-updated_at', page_size: 12 },
  })
  const favFolders = useFetch('/folders/', {
    params: { is_favorite: true, ordering: 'name', page_size: 12 },
  })

  useEffect(() => {
    const recarregar = () => {
      favDocs.refetch()
      favFolders.refetch()
    }
    window.addEventListener('notefy:favorites-changed', recarregar)
    return () => window.removeEventListener('notefy:favorites-changed', recarregar)
  }, [favDocs.refetch, favFolders.refetch])

  const favoritos = [
    ...(favFolders.data?.results ?? []).map((f) => ({
      id: f.id,
      type: 'folder',
      name: f.name,
      url: `/folders/${f.id}`,
      icon: FolderIcon,
      color: f.color,
    })),
    ...(favDocs.data?.results ?? []).map((d) => ({
      id: d.id,
      type: 'document',
      name: d.title,
      url: documentPath(d),
      folder: d.folder,
      icon: kindMeta(d.kind).icon,
      color: d.color,
    })),
  ]

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedIds([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const onMoved = () => refresh()
    window.addEventListener('notefy:moved', onMoved)
    return () => window.removeEventListener('notefy:moved', onMoved)
  }, [refresh])

  // Filtro Blindado: Impede categorias de entrarem no Multi-select
  const handleSelectIds = (ids) => {
    const categoryIds = categories.map(c => String(c.id))
    
    const filtered = ids.filter((id) => {
      const strId = String(id)
      // Bloqueia se tiver o prefixo explícito
      if (strId.startsWith('category:')) return false
      // Bloqueia se o ID cru pertencer à tabela de categorias
      if (categoryIds.includes(strId)) return false
      
      return true
    })
    
    setSelectedIds(filtered)
  }

  const handleDrop = useCallback(
    async (payload, target) => {
      setError(null)
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
        displayError(extractError(err))
      }
    },
    [refresh],
  )

  const deleteOne = async (selectionKey) => {
    const separatorIndex = selectionKey.indexOf(':')
    const itemType = selectionKey.slice(0, separatorIndex)
    const itemId = selectionKey.slice(separatorIndex + 1)
    
    let endpoint = `/documents/${itemId}/`
    if (itemType === 'folder') endpoint = `/folders/${itemId}/`
    else if (itemType === 'category') endpoint = `/categories/${itemId}/`

    // Devolve o resultado em vez de lançar: lançar abortava o `for` do
    // lote, e um item bloqueado por favorito virava parede — os seguintes
    // nem eram tentados.
    try {
      await api.delete(endpoint)
      return { ok: true }
    } catch (err) {
      const status = err.response?.status
      if (status === 404) return { ok: true }
      // 423 é o bloqueio por favorito: `?force=true` não derruba.
      if (status === 423) return { ok: false, motivo: extractError(err) }

      try {
        await api.delete(`${endpoint}?force=true`)
        return { ok: true }
      } catch (forceErr) {
        if (forceErr.response?.status === 404) return { ok: true }
        return { ok: false, motivo: extractError(forceErr) }
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    setError(null)
    setIsDeletingBulk(true)

    const total = selectedIds.length
    const bloqueados = []

    for (const selectionKey of selectedIds) {
      const resultado = await deleteOne(selectionKey)
      if (!resultado.ok) bloqueados.push(resultado.motivo)
    }

    setSelectedIds([])
    setBulkDeleteModalOpen(false)
    setIsDeletingBulk(false)

    if (bloqueados.length) {
      displayError(`${bloqueados.length} de ${total} não foram excluídos. ${bloqueados[0]}`)
    }

    await refresh()
    window.dispatchEvent(new Event('notefy:moved'))
  }

  const handleBulkMove = async (destinationFolderId) => {
    if (selectedIds.length === 0 || !destinationFolderId) return
    setError(null)
    try {
      for (const selectionKey of selectedIds) {
        const separatorIndex = selectionKey.indexOf(':')
        const itemType = selectionKey.slice(0, separatorIndex)
        const itemId = selectionKey.slice(separatorIndex + 1)

        if (itemType === 'document') {
          await api.post(`/documents/${itemId}/move/`, { folder: destinationFolderId })
        } else if (itemType === 'folder') {
          await api.post(`/folders/${itemId}/move/`, { parent: destinationFolderId })
        }
      }
    } catch (err) {
      displayError(extractError(err))
    } finally {
      setSelectedIds([])
      setMoveModalOpen(false)
      await refresh()
      window.dispatchEvent(new Event('notefy:moved'))
    }
  }

  const menuItems = () => {
    if (!menu) return []
    const { payload } = menu

    if (payload.isMultiple) {
      return [
        {
          label: `Mover (${selectedIds.length})`,
          icon: FolderIcon,
          onClick: () => setMoveModalOpen(true),
        },
        { separator: true },
        {
          label: `Excluir (${selectedIds.length})`,
          icon: Trash2,
          danger: true,
          onClick: () => setBulkDeleteModalOpen(true),
        },
      ]
    }

    if (payload.type === 'bookmark') {
      const isFile = payload.item.type !== 'folder' && payload.item.type !== 'category'
      return [
        { label: 'Abrir', icon: ExternalLink, onClick: () => navigate(payload.item.url) },
        ...(isFile && payload.item.folder
          ? [
              {
                label: 'Ir para pasta',
                icon: FolderIcon,
                onClick: () => navigate(`/folders/${payload.item.folder}`),
              },
            ]
          : []),
        { separator: true },
        {
          label: 'Remover dos favoritos',
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
      ]
    }

    if (payload.type === 'category') {
      const category = payload.category
      return [
        {
          label: 'Abrir',
          icon: Tag,
          onClick: () => navigate(`/categories/${category.id}`),
        },
        {
          label: 'Nova pasta aqui',
          icon: FolderPlus,
          onClick: () => setFolderModal({ parent: null, categoryId: category.id }),
        },
        { separator: true },
        {
          label: 'Renomear',
          icon: Pencil,
          onClick: () => setCategoryModal({ category }),
        },
        {
          label: 'Excluir',
          icon: Trash2,
          danger: true,
          onClick: () => {
            setError(null)
            requestDelete({ kind: 'category', id: category.id, name: category.name })
          },
        },
      ]
    }

    const folder = payload.node
    return [
      { label: 'Abrir', icon: FolderIcon, onClick: () => navigate(`/folders/${folder.id}`) },
      {
        label: 'Nova subpasta',
        icon: FolderPlus,
        onClick: () => setFolderModal({ parent: folder, categoryId: payload.categoryId }),
      },
      {
        label: 'Mover para...',
        icon: FolderIcon,
        onClick: () => {
          setSelectedIds([`folder:${folder.id}`])
          setMoveModalOpen(true)
        },
      },
      { separator: true },
      {
        label: 'Renomear',
        icon: Pencil,
        onClick: () => setFolderModal({ folder, categoryId: payload.categoryId }),
      },
      {
        label: 'Excluir',
        icon: Trash2,
        danger: true,
        onClick: () => {
          setError(null)
          requestDelete({ kind: 'folder', id: folder.id, name: folder.name })
        },
      },
    ]
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
        <div className="flex h-14 items-center justify-between px-3">
          {!collapsed && (
            <Link 
              to={homeRoute}
              className="truncate text-[15px] font-semibold tracking-tight text-ink-900 dark:text-ink-50 transition hover:text-accent-600"
            >
              Notefy
            </Link>
          )}
          <button
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'rounded p-1.5 text-ink-400 transition hover:bg-ink-200/60 hover:text-ink-700',
              'dark:hover:bg-ink-800 dark:hover:text-ink-200',
              collapsed && 'mx-auto',
            )}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>

        <div className="px-3 pb-1">
          <CreateMenu collapsed={collapsed} />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <div className="space-y-0.5 pt-3">
            {dynamicNav.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} />
            ))}
          </div>

          {!collapsed && (
            <>
              {/* Seção Categorias */}
              <div className="flex items-center justify-between px-2 pb-1 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  Categorias
                </span>
                <button
                  onClick={() => setCategoryModal({})}
                  aria-label="Nova categoria"
                  title="Nova categoria"
                  className="rounded p-0.5 text-ink-400 transition hover:text-accent-600"
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* Mensagem de Erro Temporária */}
              {error && (
                <div className="mb-2 px-2">
                  <p className="rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-600 dark:bg-red-500/10 dark:text-red-400 shadow-sm border border-red-100 dark:border-red-900/50">
                    {error}
                  </p>
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-4">
                  <Spinner size={15} />
                </div>
              ) : (
                <CategoryTree
                  categories={categories}
                  selectedIds={selectedIds}
                  onSelectIds={handleSelectIds}
                  actions={{
                    onDrop: handleDrop,
                    onContextMenu: openMenu,
                    onCreateFolder: ({ parent, categoryId }) =>
                      setFolderModal({ parent, categoryId }),
                  }}
                />
              )}

              <p className="mt-4 px-2 text-[10px] leading-relaxed text-ink-400">
                Arraste itens e pastas para mover. Clique com o botão direito para mais opções.
              </p>

              <div className="flex items-center justify-between px-2 pb-1 pt-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  Favoritos
                </span>
              </div>
              {favoritos.length === 0 ? (
                <div className="px-2 pb-2 text-xs text-ink-400">
                  Nenhum favorito adicionado.
                </div>
              ) : (
                <ul className="pb-2">
                  {favoritos.map((item) => {
                    const Icon = item.icon
                    return (
                      <li key={`${item.type}:${item.id}`}>
                        <NavLink
                          to={item.url}
                          onContextMenu={(event) =>
                            openMenu(event, { type: 'bookmark', item })
                          }
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2 rounded px-2 py-1 text-xs transition',
                              isActive
                                ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                                : 'text-ink-600 hover:bg-ink-200/60 dark:text-ink-300 dark:hover:bg-ink-800',
                            )
                          }
                        >
                          <Icon
                            size={13}
                            className="shrink-0 text-ink-400"
                            style={item.color ? { color: item.color } : undefined}
                          />
                          <span className="truncate">{item.name}</span>
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {collapsed && (
            <div className="mt-3 flex flex-col items-center gap-1 border-t border-ink-200 pt-3 dark:border-ink-800">
              <button
                onClick={() => setCategoryModal({})}
                title="Nova categoria"
                className="rounded p-2 text-ink-400 transition hover:bg-ink-200/60 hover:text-ink-700 dark:hover:bg-ink-800"
              >
                <Tag size={16} />
              </button>
            </div>
          )}
        </nav>

        <div className="border-t border-ink-200 p-3 dark:border-ink-800">
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
            <NavLink
              to="/profile"
              title="Perfil"
              aria-label="Perfil"
              className="shrink-0 rounded-full ring-accent-400 transition hover:ring-2"
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
            {!collapsed && (
              <>
                <NavLink to="/profile" className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-700 transition hover:text-accent-600 dark:text-ink-200 dark:hover:text-accent-400">
                    {user?.full_name || user?.username}
                  </p>
                </NavLink>
                <NavLink
                  to="/settings"
                  aria-label="Configurações"
                  className="rounded p-1.5 text-ink-400 transition hover:bg-ink-200/60 hover:text-ink-700 dark:hover:bg-ink-800"
                >
                  <Settings size={15} />
                </NavLink>
                <button
                  onClick={handleLogout}
                  aria-label="Sair"
                  className="rounded p-1.5 text-ink-400 transition hover:bg-ink-200/60 hover:text-red-600 dark:hover:bg-ink-800"
                >
                  <LogOut size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

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
        }}
      />

      <CategoryFormModal
        open={!!categoryModal}
        category={categoryModal?.category}
        onClose={() => setCategoryModal(null)}
        onSaved={() => {
          setCategoryModal(null)
          refresh()
        }}
      />

      <DestinationModal
        open={moveModalOpen}
        title={`Mover ${selectedIds.length} item(s)`}
        confirmLabel="Mover para cá"
        onClose={() => {
          setMoveModalOpen(false)
          setSelectedIds([])
        }}
        onPick={handleBulkMove}
      />

      <Modal
        open={bulkDeleteModalOpen}
        onClose={() => setBulkDeleteModalOpen(false)}
        title="Excluir múltiplos itens"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={isDeletingBulk}
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white border-transparent"
            >
              Sim, excluir {selectedIds.length} itens
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Você está prestes a excluir <strong>{selectedIds.length}</strong> itens de forma permanente.
          Se houver subpastas com conteúdo, eles também serão forçados a serem excluídos. Deseja continuar?
        </p>
      </Modal>

      {deleteDialogs}
    </>
  )
}
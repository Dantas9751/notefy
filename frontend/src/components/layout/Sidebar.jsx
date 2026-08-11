import { useCallback, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  FolderPlus,
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
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useUI } from '@/context/UIContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { cn } from '@/lib/utils'
import { Button, Spinner } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import CategoryTree from './CategoryTree'
import CreateMenu from './CreateMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'

/**
 * Sidebar.
 *
 * Só os seis destinos globais mais a árvore. Os tipos de conteúdo saíram
 * daqui: eles já são a única coisa dentro de "Criar", e repeti-los na
 * navegação fazia todo lugar do app dizer a mesma coisa.
 */
const NAV = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/recent', label: 'Recentes', icon: Clock },
  { to: '/files', label: 'Arquivos', icon: Paperclip },
  { to: '/search', label: 'Buscar', icon: Search },
  { to: '/board', label: 'Quadro', icon: Kanban },
  { to: '/calendar', label: 'Calendário', icon: CalendarDays },
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
  const { menu, openMenu, closeMenu } = useContextMenu()

  const [folderModal, setFolderModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState(null)

  const collapsed = sidebarCollapsed

  /* ------------------------------------------------------------------ */
  /* Mover por arraste                                                  */
  /* ------------------------------------------------------------------ */
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
        // A tela aberta pode estar mostrando o item que acabou de sair
        // dali; recarregar a rota atual mantém a lista fiel.
        window.dispatchEvent(new CustomEvent('notefy:moved', { detail: { payload, target } }))
      } catch (err) {
        setError(extractError(err))
      }
    },
    [refresh],
  )

  /* ------------------------------------------------------------------ */
  /* Menu de contexto                                                   */
  /* ------------------------------------------------------------------ */
  const menuItems = () => {
    if (!menu) return []
    const { payload } = menu

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
          onClick: () =>
            setConfirm({
              title: 'Excluir categoria',
              message: (
                <>
                  A categoria <strong>{category.name}</strong> será removida. Ela precisa
                  estar sem pastas — mova ou exclua as pastas antes.
                </>
              ),
              onConfirm: async () => {
                await api.delete(`/categories/${category.id}/`)
                refresh()
              },
            }),
        },
      ]
    }

    const folder = payload.node
    return [
      { label: 'Abrir', icon: FolderPlus, onClick: () => navigate(`/folders/${folder.id}`) },
      {
        label: 'Nova subpasta',
        icon: FolderPlus,
        onClick: () => setFolderModal({ parent: folder, categoryId: payload.categoryId }),
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
        onClick: () =>
          setConfirm({
            title: 'Excluir pasta',
            message: (
              <>
                A pasta <strong>{folder.name}</strong> será removida. Ela precisa estar
                vazia — mova ou exclua o conteúdo antes.
              </>
            ),
            onConfirm: async () => {
              await api.delete(`/folders/${folder.id}/`)
              refresh()
            },
          }),
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
            <span className="truncate text-[15px] font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              Notefy
            </span>
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
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} />
            ))}
          </div>

          {!collapsed && (
            <>
              <div className="flex items-center justify-between px-2 pb-1 pt-5">
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

              {error && (
                <p className="mb-1.5 rounded bg-red-50 px-2 py-1 text-[11px] text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </p>
              )}

              {loading ? (
                <div className="flex justify-center py-4">
                  <Spinner size={15} />
                </div>
              ) : (
                <CategoryTree
                  categories={categories}
                  actions={{
                    onDrop: handleDrop,
                    onContextMenu: openMenu,
                    onCreateFolder: ({ parent, categoryId }) =>
                      setFolderModal({ parent, categoryId }),
                  }}
                />
              )}

              <p className="mt-4 px-2 text-[10px] leading-relaxed text-ink-400">
                Arraste itens e pastas para mover. Clique com o botão direito para mais
                opções.
              </p>
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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-600 text-[11px] font-semibold text-white">
              {(user?.full_name || user?.email || '?').charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-700 dark:text-ink-200">
                    {user?.full_name || user?.email}
                  </p>
                </div>
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

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
      />
    </>
  )
}

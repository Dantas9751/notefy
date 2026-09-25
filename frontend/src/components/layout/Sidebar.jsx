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
  Download,
  Search,
  Settings,
  Tag,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useUI } from '@/context/UIContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { cn } from '@/lib/utils'
import { useRenomear } from '@/hooks/useRenomear'
import StudyTimer from '@/components/layout/StudyTimer'
import FavoritosSidebar from '@/components/layout/FavoritosSidebar'
import { Button, Spinner, Modal } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import CategoryTree from './CategoryTree'
import CreateMenu from './CreateMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import DestinationModal from '@/components/modals/DestinationModal'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { exportBatchAsZip, exportFolderAsZip } from '@/components/ExportMenu'

const NAV_ITEMS = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/recent', label: 'Recentes', icon: Clock },
  // Favoritos não entra aqui: a seção mais abaixo JÁ É a lista, e um
  // item de navegação levaria a uma tela com os mesmos nomes que já
  // estão à vista. A seção é o favorito inteiro; não há rota /favorites.
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

  // Renomear pasta e categoria no lugar, na própria linha da árvore.
  // Depois do `useWorkspace`, que é de onde `refresh` vem.
  const renomear = useRenomear({ onRenamed: refresh })
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedIds([])
        return
      }
      // O menu de renomear da árvore MOSTRA "F2" ao lado do rótulo, e
      // nada aqui escutava a tecla: o atalho era anunciado e não fazia
      // nada. As telas de listagem já tinham o handler; a sidebar ficou
      // de fora. Só com um item marcado — renomear vários não existe.
      if (e.key === 'F2' && !renomear.editando && selectedIds.length === 1) {
        const chave = String(selectedIds[0])
        const separador = chave.indexOf(':')
        const tipo = separador === -1 ? 'folder' : chave.slice(0, separador)
        const id = separador === -1 ? chave : chave.slice(separador + 1)
        if (tipo !== 'folder') return
        e.preventDefault()
        renomear.abrir(id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, renomear])

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

  /**
   * Baixa a seleção como um único ZIP.
   *
   * Os itens vêm da sidebar como `tipo:id` e sem conteúdo — a árvore
   * carrega só nome e ícone. Cada documento precisa ser buscado inteiro
   * antes de virar arquivo, e pastas entram pela rota de conteúdo, que
   * devolve a subárvore já montada.
   */
  const handleBulkExport = async () => {
    if (selectedIds.length === 0) return
    setError(null)

    const documentos = []
    for (const selectionKey of selectedIds) {
      const separatorIndex = selectionKey.indexOf(':')
      const itemType = selectionKey.slice(0, separatorIndex)
      const itemId = selectionKey.slice(separatorIndex + 1)

      try {
        if (itemType === 'document') {
          const { data } = await api.get(`/documents/${itemId}/`)
          documentos.push(data)
        } else if (itemType === 'folder') {
          // A pasta vira as suas folhas: um zip de "pasta + notas soltas"
          // que ignorasse o conteúdo dela seria uma pasta vazia no lugar
          // do que o usuário mandou baixar.
          const { data } = await api.get(`/folders/${itemId}/contents/`)
          for (const doc of data.documents ?? []) {
            const completo = await api.get(`/documents/${doc.id}/`)
            documentos.push(completo.data)
          }
        }
      } catch {
        // Item que falha não derruba o lote: melhor um zip com o que deu
        // certo do que nenhum arquivo por causa de um item quebrado.
      }
    }

    if (documentos.length === 0) {
      displayError('Nada para exportar na seleção.')
      return
    }

    try {
      await exportBatchAsZip(documentos)
      setSelectedIds([])
    } catch (err) {
      displayError(extractError(err))
    }
  }

  /** Baixa uma pasta inteira como ZIP, preservando a hierarquia. */
  const handleFolderExport = async (folder) => {
    setError(null)
    try {
      const { data } = await api.get(`/folders/${folder.id}/contents/`)

      // `contents/` devolve um nível. Buscar o payload de cada documento é
      // o que permite converter para .md/.csv em vez de gravar um JSON de
      // metadados que ninguém consegue abrir.
      const documentos = []
      for (const doc of data.documents ?? []) {
        try {
          const completo = await api.get(`/documents/${doc.id}/`)
          documentos.push(completo.data)
        } catch {
          /* item ignorado */
        }
      }

      await exportFolderAsZip(
        [{ name: folder.name, documents: documentos, children: [] }],
      )
    } catch (err) {
      displayError(extractError(err))
    }
  }

  /** Monta o nó de exportação de uma pasta e de toda a subárvore dela. */
  const coletarSubarvore = async (folderId) => {
    const { data } = await api.get(`/folders/${folderId}/contents/`)

    const documentos = []
    for (const doc of data.documents ?? []) {
      try {
        const completo = await api.get(`/documents/${doc.id}/`)
        documentos.push(completo.data)
      } catch {
        /* item ignorado */
      }
    }

    const children = []
    for (const sub of data.subfolders ?? []) {
      children.push(await coletarSubarvore(sub.id))
    }

    return { name: data.folder.name, documents: documentos, children }
  }

  /** Baixa a categoria inteira como ZIP, preservando a hierarquia. */
  const handleCategoryExport = async (category) => {
    setError(null)
    try {
      const { data } = await api.get(`/categories/${category.id}/contents/`)

      const raizes = []
      for (const pasta of data.folders ?? []) {
        raizes.push(await coletarSubarvore(pasta.id))
      }

      if (!raizes.length) {
        displayError('Nada para exportar nesta categoria.')
        return
      }

      await exportFolderAsZip(raizes)
    } catch (err) {
      displayError(extractError(err))
    }
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
        {
          label: `Exportar (${selectedIds.length}) como .zip`,
          icon: Download,
          onClick: handleBulkExport,
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
          atalho: 'F2',
          onClick: () => renomear.abrir(category.id),
        },
        {
          // O modal continua: ele edita cor e descrição, não só o nome.
          label: 'Editar...',
          icon: Settings,
          onClick: () => setCategoryModal({ category }),
        },
        {
          label: 'Exportar como .zip',
          icon: Download,
          onClick: () => handleCategoryExport(category),
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
      {
        label: 'Exportar como .zip',
        icon: Download,
        onClick: () => handleFolderExport(folder),
      },
      { separator: true },
      {
        label: 'Renomear',
        icon: Pencil,
        atalho: 'F2',
        onClick: () => renomear.abrir(folder.id),
      },
      {
        label: 'Editar...',
        icon: Settings,
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
                <span className="secao">
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
                    renomear,
                    onCreateFolder: ({ parent, categoryId }) =>
                      setFolderModal({ parent, categoryId }),
                  }}
                />
              )}

              <p className="mt-4 px-2 text-[10px] leading-relaxed text-ink-400">
                Arraste itens e pastas para mover. Clique com o botão direito para mais opções.
              </p>

              <FavoritosSidebar aoAbrirMenu={openMenu} />
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
          <StudyTimer collapsed={collapsed} />
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
            <NavLink
              to="/settings/conta"
              title="Sua conta"
              aria-label="Sua conta"
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
                <NavLink to="/settings/conta" className="min-w-0 flex-1">
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
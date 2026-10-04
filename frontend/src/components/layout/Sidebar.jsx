import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  GanttChartSquare,
  Clock,
  FolderPlus,
  Folder as FolderIcon,
  Kanban,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
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
import { Spinner } from '@/components/ui'
import DicaLateral from '@/components/ui/DicaLateral'
// O ícone do app instalado, e não uma cópia: trocou lá, troca aqui.
import logo from '../../../src-tauri/icons/64x64.png'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import CategoryTree from './CategoryTree'
import CreateMenu from './CreateMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import DestinationModal from '@/components/modals/DestinationModal'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { exportBatchAsZip, exportFolderAsZip } from '@/components/ExportMenu'
import { t } from '@/lib/i18n'
import { semMouse } from '@/lib/desktop'
import ConfirmDialog from '@/components/modals/ConfirmDialog'

const NAV_ITEMS = [
  { to: '/', get label() { return t('Início') }, icon: LayoutDashboard, end: true },
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
/** Botão quadrado do trilho (barra recolhida). */
const QUADRADO = 'mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition'

function NavItem({ to, label, icon: Icon, end, collapsed }) {
  return (
    <DicaLateral rotulo={label} ativa={collapsed}>
      <NavLink
        to={to}
        end={end}
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

  const [folderModal, setFolderModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(null)
  const [error, setError] = useState(null)

  // Estados de Multi-Seleção e Ações em Massa
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  
  // Tratamento da Rota Dinâmica
  const rawHome = user?.settings?.home_page || '/'
  const homeRoute = rawHome.startsWith('/') ? rawHome : `/${rawHome}`
  
  const dynamicNav = NAV_ITEMS.map((item) =>
    item.to === '/' ? { ...item, to: homeRoute } : item
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

  const collapsed = sidebarCollapsed && !sempreAberta

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

    const total = selectedIds.length
    const bloqueados = []

    for (const selectionKey of selectedIds) {
      const resultado = await deleteOne(selectionKey)
      if (!resultado.ok) bloqueados.push(resultado.motivo)
    }

    setSelectedIds([])
    setBulkDeleteModalOpen(false)

    if (bloqueados.length) {
      displayError(t('{falhas} de {total} não foram excluídos. {motivo}', { falhas: bloqueados.length, total, motivo: bloqueados[0] }))
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
      displayError(t('Nada para exportar na seleção.'))
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
        displayError(t('Nada para exportar nesta categoria.'))
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
          label: t('Mover ({length})', { length: selectedIds.length }),
          icon: FolderIcon,
          onClick: () => setMoveModalOpen(true),
        },
        {
          label: t('Exportar ({length}) como .zip', { length: selectedIds.length }),
          icon: Download,
          onClick: handleBulkExport,
        },
        { separator: true },
        {
          label: t('Excluir ({length})', { length: selectedIds.length }),
          icon: Trash2,
          danger: true,
          onClick: () => setBulkDeleteModalOpen(true),
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
      ]
    }

    if (payload.type === 'category') {
      const category = payload.category
      return [
        {
          label: t('Abrir'),
          icon: Tag,
          onClick: () => navigate(`/categories/${category.id}`),
        },
        {
          label: t('Nova pasta aqui'),
          icon: FolderPlus,
          onClick: () => setFolderModal({ parent: null, categoryId: category.id }),
        },
        { separator: true },
        {
          label: t('Renomear'),
          icon: Pencil,
          atalho: 'F2',
          onClick: () => renomear.abrir(category.id),
        },
        {
          // O modal continua: ele edita cor e descrição, não só o nome.
          label: t('Editar...'),
          icon: Settings,
          onClick: () => setCategoryModal({ category }),
        },
        {
          label: t('Exportar como .zip'),
          icon: Download,
          onClick: () => handleCategoryExport(category),
        },
        {
          label: t('Excluir'),
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
      { label: t('Abrir'), icon: FolderIcon, onClick: () => navigate(`/folders/${folder.id}`) },
      {
        label: t('Nova subpasta'),
        icon: FolderPlus,
        onClick: () => setFolderModal({ parent: folder, categoryId: payload.categoryId }),
      },
      {
        label: t('Novo a partir de modelo...'),
        icon: LayoutTemplate,
        onClick: () => navigate(`/templates?folder=${folder.id}`),
      },
      {
        label: t('Mover para...'),
        icon: FolderIcon,
        onClick: () => {
          setSelectedIds([`folder:${folder.id}`])
          setMoveModalOpen(true)
        },
      },
      {
        label: t('Exportar como .zip'),
        icon: Download,
        onClick: () => handleFolderExport(folder),
      },
      { separator: true },
      {
        label: t('Renomear'),
        icon: Pencil,
        atalho: 'F2',
        onClick: () => renomear.abrir(folder.id),
      },
      {
        label: t('Editar...'),
        icon: Settings,
        onClick: () => setFolderModal({ folder, categoryId: payload.categoryId }),
      },
      {
        label: t('Excluir'),
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
        <div className={cn('flex h-14 items-center px-3', collapsed && 'justify-center px-0')}>
          <DicaLateral rotulo={t('Início')} ativa={collapsed}>
            <Link
              to={homeRoute}
              aria-label={collapsed ? t('Início') : undefined}
              className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-ink-900 transition hover:text-accent-600 dark:text-ink-50"
            >
              <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-full bg-white object-cover ring-1 ring-ink-200 dark:ring-ink-700" />
              {!collapsed && <span className="truncate">{t('Notefy')}</span>}
            </Link>
          </DicaLateral>
        </div>

        <div className={cn('px-3 pb-1', collapsed && 'flex justify-center px-0')}>
          <DicaLateral rotulo={t('Criar')} ativa={collapsed}>
            <CreateMenu collapsed={collapsed} />
          </DicaLateral>
        </div>

        <nav className={cn('min-h-0 flex-1 overflow-y-auto pb-4', collapsed ? 'px-0' : 'px-3')}>
          <div className={cn('pt-3', collapsed ? 'space-y-1' : 'space-y-0.5')}>
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
            <div className="mx-3 mt-3 space-y-1 border-t border-ink-200 pt-3 dark:border-ink-800">
              {categories.map((c) => {
                const cor = c.color || '#8C8A86'
                return (
                  <DicaLateral key={c.id} rotulo={c.name}>
                    <NavLink
                      to={`/categories/${c.id}`}
                      aria-label={c.name}
                      onContextMenu={(e) => openMenu(e, { type: 'category', category: c })}
                      style={{ backgroundColor: `${cor}26`, color: cor, '--tw-ring-color': cor }}
                      className={({ isActive }) =>
                        cn(
                          QUADRADO,
                          'text-[13px] font-semibold',
                          isActive ? 'ring-2 ring-offset-2 ring-offset-ink-50 dark:ring-offset-ink-900' : 'hover:brightness-110',
                        )
                      }
                    >
                      {/* Duas palavras, duas letras: "Pesquisa Acadêmica" e "Pessoal" não viram dois "P". */}
                      {c.name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase()}
                    </NavLink>
                  </DicaLateral>
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
        </nav>

        <div className={cn('border-t border-ink-200 dark:border-ink-800', collapsed ? 'space-y-1 px-0 py-3' : 'p-3')}>
          <StudyTimer collapsed={collapsed} />
          {collapsed && (
            <DicaLateral rotulo={t('Configurações')}>
              <NavLink
                to="/settings"
                aria-label={t('Configurações')}
                className={({ isActive }) =>
                  cn(QUADRADO, isActive ? ATIVO_NO_TRILHO : 'text-ink-500 hover:bg-ink-200/60 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100')
                }
              >
                <Settings size={16} />
              </NavLink>
            </DicaLateral>
          )}
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center pt-1')}>
            <DicaLateral rotulo={t('Sua conta')} ativa={collapsed}>
              <NavLink
                to="/settings/conta"
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
                <NavLink to="/settings/conta" className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-700 transition hover:text-accent-600 dark:text-ink-200 dark:hover:text-accent-400">
                    {user?.full_name || user?.username}
                  </p>
                </NavLink>
                <NavLink
                  to="/settings"
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

        {/* Recolher e expandir no MESMO lugar, o pé da barra: o botão fica
            embaixo do cursor nos dois estados, e dá para ir e voltar sem
            procurar. */}
        {!sempreAberta && (
          <div className={cn('border-t border-ink-200 dark:border-ink-800', collapsed ? 'py-2' : 'p-2')}>
            <DicaLateral rotulo={t('Expandir menu')} ativa={collapsed}>
              <button
                onClick={toggleSidebar}
                aria-label={collapsed ? t('Expandir menu') : t('Recolher menu')}
                aria-expanded={!collapsed}
                className={cn(
                  'text-ink-500 transition hover:bg-ink-200/60 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100',
                  collapsed ? QUADRADO : 'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-xs',
                )}
              >
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                {!collapsed && t('Recolher menu')}
              </button>
            </DicaLateral>
          </div>
        )}
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
        title={t('Mover {length} item(s)', { length: selectedIds.length })}
        confirmLabel={t('Mover para cá')}
        onClose={() => {
          setMoveModalOpen(false)
          setSelectedIds([])
        }}
        onPick={handleBulkMove}
      />

      <ConfirmDialog
        open={bulkDeleteModalOpen}
        onClose={() => setBulkDeleteModalOpen(false)}
        title={t('Excluir itens selecionados')}
        message={t('{n} itens vão para a lixeira, junto com o que houver dentro deles.', { n: selectedIds.length })}
        confirmLabel={t('Excluir {n} itens', { n: selectedIds.length })}
        onConfirm={handleBulkDelete}
      />

      {deleteDialogs}
    </>
  )
}
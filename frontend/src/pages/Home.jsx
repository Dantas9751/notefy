import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckSquare, ChevronRight, FolderOpen, Layers, Plus, Tag, Trash2, X, FolderPlus } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Button, EmptyState, ErrorState, ListSkeleton, Modal } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import DocumentCard from '@/components/DocumentCard'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import FolderFormModal from '@/components/modals/FolderFormModal'
import { DOCUMENT_KINDS } from '@/lib/documents'
import { TASK_PRIORITY, formatRelative, cn } from '@/lib/utils'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function StatCard({ icon: Icon, label, value, to, color }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-4 transition hover:bg-ink-50 dark:hover:bg-ink-800/50">
      <div
        className="rounded-md p-2"
        style={color ? { backgroundColor: `${color}18`, color } : undefined}
      >
        <Icon size={17} className={color ? undefined : 'text-ink-500 dark:text-ink-400'} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight tabular-nums text-ink-900 dark:text-ink-50">
          {value ?? '—'}
        </p>
        <p className="truncate text-xs text-ink-500 dark:text-ink-400">{label}</p>
      </div>
    </Link>
  )
}

/** Cartão de categoria com suporte a seleção e clique direito. */
function CategoryCard({ category, isSelected, onClick, onContextMenu }) {
  const folders = category.folders ?? []
  const preview = folders.slice(0, 4)

  return (
    <Link
      to={`/categories/${category.id}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "card group flex flex-col p-4 transition overflow-hidden",
        isSelected ? 'ring-2 ring-accent-500 bg-accent-50/50 dark:bg-accent-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800/50'
      )}
      style={{ borderTopColor: category.color, borderTopWidth: 3 }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink-900 group-hover:text-accent-700 dark:text-ink-100 dark:group-hover:text-accent-300">
            {category.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {category.folder_count} pasta(s) · {category.document_count} item(ns)
          </p>
        </div>
        <ChevronRight
          size={15}
          className="mt-0.5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500"
        />
      </div>

      <div className="mt-3 flex-1 space-y-1">
        {preview.map((folder) => (
          <div
            key={folder.id}
            className="flex items-center gap-1.5 text-[12px] text-ink-500 dark:text-ink-400"
          >
            <FolderOpen size={12} className="shrink-0 text-ink-300" />
            <span className="truncate">{folder.name}</span>
            {folder.document_count > 0 && (
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-400">
                {folder.document_count}
              </span>
            )}
          </div>
        ))}
        {folders.length > preview.length && (
          <p className="text-[11px] text-ink-400">+{folders.length - preview.length} pasta(s)</p>
        )}
        {folders.length === 0 && (
          <p className="text-[11px] italic text-ink-400">Nenhuma pasta ainda.</p>
        )}
      </div>
    </Link>
  )
}

/**
 * Início — painel e porta de entrada da hierarquia.
 */
export default function Home() {
  const { user } = useAuth()
  const { categories, loading, refresh } = useWorkspace()
  const navigate = useNavigate()
  const { menu, openMenu, closeMenu } = useContextMenu()
  
  const [categoryModal, setCategoryModal] = useState(false)
  const [folderModal, setFolderModal] = useState(null) // Para "Nova pasta" na categoria

  // Estados de Multi-Seleção e Erro
  const [selectedIds, setSelectedIds] = useState([])
  const [actionError, setActionError] = useState(null)
  const lastSelectedId = useRef(null)

  // Estado para o Modal de Exclusão em Massa
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)

  const stats = useFetch('/documents/stats/')
  const recent = useFetch('/documents/recent/')
  const upcoming = useFetch('/tasks/', {
    params: { status: 'todo', ordering: 'starts_at', page_size: 6 },
  })
  
  const { buildMenu, dialogs: docActionDialogs } = useDocumentActions({ onChanged: recent.refetch })

  // Hook de exclusão em cascata (Usado para exclusão ÚNICA)
  const { requestDelete, dialogs: deleteDialogs } = useCascadeDelete({
    onDeleted: () => {
      setSelectedIds([])
      stats.refetch()
      recent.refetch()
      upcoming.refetch()
      refresh()
    },
    onError: setActionError,
  })

  // Atalho Tecla ESC para limpar seleções
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
    const onChanged = () => {
      stats.refetch()
      recent.refetch()
      upcoming.refetch()
      refresh()
    }
    window.addEventListener('notefy:moved', onChanged)
    return () => window.removeEventListener('notefy:moved', onChanged)
  }, [stats.refetch, recent.refetch, upcoming.refetch, refresh])

  /* ------------------------------------------------------------------ */
  /* Lógica de Cliques e Multi-Seleção                                  */
  /* ------------------------------------------------------------------ */
  const handleItemClick = (itemType, itemId, event) => {
    const uniqueKey = `${itemType}:${itemId}`
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      setSelectedIds((prev) =>
        prev.includes(uniqueKey) ? prev.filter((i) => i !== uniqueKey) : [...prev, uniqueKey]
      )
      lastSelectedId.current = uniqueKey
    } else {
      setSelectedIds([uniqueKey])
      lastSelectedId.current = uniqueKey
    }
  }

  const handleContextMenu = (itemType, item, event) => {
    event.preventDefault()
    const uniqueKey = `${itemType}:${item.id}`
    
    let currentSelected = selectedIds
    if (!selectedIds.includes(uniqueKey)) {
      currentSelected = [uniqueKey]
      setSelectedIds([uniqueKey])
      lastSelectedId.current = uniqueKey
    }

    const payload = itemType === 'category' ? { type: 'category', category: item } : { type: 'document', document: item }
    openMenu(event, { ...payload, isMultiple: currentSelected.length > 1 })
  }

  /* ------------------------------------------------------------------ */
  /* Lógica de Exclusão Blindada                                        */
  /* ------------------------------------------------------------------ */
  const deleteOne = async (selectionKey) => {
    const [itemType, itemId] = selectionKey.split(':')
    const endpoint = itemType === 'category' ? `/categories/${itemId}/` : `/documents/${itemId}/`

    try {
      await api.delete(endpoint)
    } catch (err) {
      if (err.response?.status === 404) return;
      try {
        await api.delete(`${endpoint}?force=true`)
      } catch (forceErr) {
        if (forceErr.response?.status === 404) return;
        throw forceErr;
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return

    const idsToDelete = [...selectedIds]
    setActionError(null)
    setIsDeletingBulk(true)

    try {
      for (const selectionKey of idsToDelete) {
        await deleteOne(selectionKey)
      }
    } catch (err) {
      setActionError(extractError(err))
    } finally {
      setSelectedIds([])
      lastSelectedId.current = null
      setBulkDeleteModalOpen(false)
      setIsDeletingBulk(false)
      
      stats.refetch()
      recent.refetch()
      upcoming.refetch()
      refresh()
    }
  }

  const handleBulkDeleteWithDialog = () => {
    if (selectedIds.length === 0) return

    if (selectedIds.length === 1) {
      const [itemType, itemId] = selectedIds[0].split(':')
      
      if (itemType === 'category') {
        const cat = categories.find((c) => String(c.id) === String(itemId))
        if (cat) {
          setActionError(null)
          requestDelete({ kind: 'category', id: cat.id, name: cat.name })
          return
        }
      } else if (itemType === 'document') {
        const doc = recent.data?.find((d) => String(d.id) === String(itemId))
        if (doc) {
          setActionError(null)
          requestDelete({ kind: 'document', id: doc.id, name: doc.title })
          return
        }
      }
    }

    setBulkDeleteModalOpen(true)
  }

  const firstName = (user?.full_name || user?.username || '').split(' ')[0]
  const byKind = stats.data?.by_kind ?? {}
  const totalFolders = categories.reduce((sum, c) => sum + (c.folder_count ?? 0), 0)

  return (
    <div className="pb-24">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle="Um resumo do seu espaço e as categorias onde tudo mora."
        actions={
          <Button icon={Plus} onClick={() => setCategoryModal(true)}>
            Nova categoria
          </Button>
        }
      />

      <PageBody className="space-y-8">
        {actionError && <div className="mb-4"><ErrorState message={actionError} /></div>}

        {/* Painel: quanto tem de cada coisa */}
        <section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Layers} label="Itens no total" value={stats.data?.total} to="/recent" />
            <StatCard icon={Tag} label="Categorias" value={categories.length} to="/" />
            <StatCard icon={FolderOpen} label="Pastas" value={totalFolders} to="/" />
            <StatCard
              icon={CheckSquare}
              label="Tarefas abertas"
              value={upcoming.data?.count}
              to="/board"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(DOCUMENT_KINDS).map(([kind, meta]) => {
              const Icon = meta.icon
              const count = byKind[kind] ?? 0
              return (
                // `type` e nao `kind`: e o nome que a busca le da URL
                // (`searchParams.getAll('type')`) e manda para a API. Com
                // `kind` a navegacao funcionaria e o filtro nao aplicaria —
                // silenciosamente.
                <Link
                  key={kind}
                  to={`/search?type=${kind}`}
                  title={`Ver ${meta.plural.toLowerCase()}`}
                  className="card flex items-center gap-2.5 p-3 transition hover:bg-ink-50 dark:hover:bg-ink-800/50"
                  style={{ borderLeftColor: meta.accent, borderLeftWidth: 3 }}
                >
                  <Icon size={16} className="shrink-0" style={{ color: meta.accent }} />
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-none tabular-nums text-ink-900 dark:text-ink-50">
                      {count}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-ink-500 dark:text-ink-400">
                      {count === 1 ? meta.label : meta.plural}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        {/* Categorias — o primeiro nível da navegação */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
              Categorias
            </h2>
          </div>

          {loading ? (
            <ListSkeleton rows={2} />
          ) : categories.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => {
                const isSelected = selectedIds.includes(`category:${category.id}`)
                return (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    isSelected={isSelected}
                    onClick={(e) => handleItemClick('category', category.id, e)}
                    onContextMenu={(e) => handleContextMenu('category', category, e)}
                  />
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={Tag}
              title="Comece criando uma categoria"
              description="Tudo no Notefy mora dentro de uma categoria: ela guarda pastas, e as pastas guardam suas notas, arquivos, planilhas, diagramas e canvas."
              action={
                <Button icon={Plus} onClick={() => setCategoryModal(true)}>
                  Criar categoria
                </Button>
              }
            />
          )}
        </section>

        {/* Recentes */}
        {(recent.loading || recent.data?.length > 0) && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
                Mexidos recentemente
              </h2>
              <Link
                to="/recent"
                className="text-xs text-ink-500 underline-offset-2 hover:underline dark:text-ink-400"
              >
                Ver todos
              </Link>
            </div>

            {recent.loading ? (
              <ListSkeleton rows={3} />
            ) : recent.error ? (
              <ErrorState message={recent.error} onRetry={recent.refetch} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {recent.data.slice(0, 6).map((doc) => {
                  const isSelected = selectedIds.includes(`document:${doc.id}`)
                  return (
                    <div
                      key={doc.id}
                      onClickCapture={(e) => handleItemClick('document', doc.id, e)}
                      onContextMenu={(e) => handleContextMenu('document', doc, e)}
                      className={cn(
                        'rounded-xl transition cursor-pointer overflow-hidden',
                        isSelected && 'ring-2 ring-accent-500 bg-accent-50/50 dark:bg-accent-500/10'
                      )}
                    >
                      <DocumentCard document={doc} showFolder />
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Próximas tarefas */}
        {upcoming.data?.results?.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
                Próximas tarefas
              </h2>
              <Link
                to="/board"
                className="text-xs text-ink-500 underline-offset-2 hover:underline dark:text-ink-400"
              >
                Ver quadro
              </Link>
            </div>

            <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {upcoming.data.results.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-ink-50 dark:hover:bg-ink-900"
                >
                  <CheckSquare size={15} className="shrink-0 text-ink-300" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700 dark:text-ink-200">
                    {task.title}
                  </span>
                  {task.document_title && (
                    <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                      {task.document_title}
                    </Badge>
                  )}
                  <span
                    className={`text-[11px] font-medium ${TASK_PRIORITY[task.priority]?.className}`}
                  >
                    {task.priority_label}
                  </span>
                  {task.starts_at ? (
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {formatRelative(task.starts_at)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] italic text-ink-400">sem data</span>
                  )}
                  {task.is_overdue && <Badge className="bg-red-100 text-red-700">atrasada</Badge>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageBody>

      {/* Barra Flutuante de Ações em Massa */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-slide-up flex items-center gap-3 rounded-xl bg-ink-900 px-4 py-2.5 text-white shadow-xl dark:bg-ink-800 border border-ink-700">
          <span className="text-xs font-medium">
            {selectedIds.length} selecionado(s)
          </span>
          <div className="h-4 w-px bg-ink-700" />
          <button
            onClick={handleBulkDeleteWithDialog}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/20"
          >
            <Trash2 size={14} /> Excluir
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="rounded p-1 text-ink-400 transition hover:text-white"
            title="Limpar seleção"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Menu de Contexto */}
      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload?.isMultiple
            ? [
                {
                  label: `Excluir (${selectedIds.length} selecionados)`,
                  icon: Trash2,
                  danger: true,
                  onClick: handleBulkDeleteWithDialog,
                },
              ]
            : menu?.payload?.type === 'category'
              ? [
                  {
                    label: 'Nova pasta',
                    icon: FolderPlus,
                    onClick: () => setFolderModal({ categoryId: menu.payload.category.id }),
                  },
                  { separator: true },
                  {
                    label: 'Excluir',
                    icon: Trash2,
                    danger: true,
                    onClick: () => {
                      setActionError(null)
                      requestDelete({
                        kind: 'category',
                        id: menu.payload.category.id,
                        name: menu.payload.category.name,
                      })
                    },
                  },
                ]
              : menu?.payload?.document
                ? buildMenu(menu.payload.document)
                : []
        }
      />

      {/* Modais de Exclusão e Ações */}
      {deleteDialogs}
      {docActionDialogs}

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
          Você está prestes a excluir <strong>{selectedIds.length}</strong> itens (e todo o seu conteúdo interno) de forma permanente.
          Deseja continuar?
        </p>
      </Modal>

      {/* Modais de Criação */}
      <CategoryFormModal
        open={categoryModal}
        onClose={() => setCategoryModal(false)}
        onSaved={(category) => {
          setCategoryModal(false)
          refresh()
          if (category?.id) navigate(`/categories/${category.id}`)
        }}
      />

      <FolderFormModal
        open={!!folderModal}
        categoryId={folderModal?.categoryId}
        onClose={() => setFolderModal(null)}
        onSaved={async (newFolder) => {
          setFolderModal(null)
          await refresh()
          if (newFolder?.id) navigate(`/folders/${newFolder.id}`)
        }}
      />
    </div>
  )
}
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronRight,
  FileUp,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import DocumentCard from '@/components/DocumentCard'
import CreateMenu from '@/components/layout/CreateMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { canDrop, hasFilePayload, hasItemPayload, readDragPayload, setDragPayload } from '@/lib/dnd'
import { kindMeta } from '@/lib/documents'
import { TASK_STATUS, cn, formatRelative } from '@/lib/utils'

/**
 * Terceiro nível: o conteúdo de uma pasta.
 *
 * Notas, arquivos, planilhas, diagramas e canvas na MESMA grade, com chips
 * para filtrar por tipo sem sair da tela. Soltar arquivos do sistema envia
 * para esta pasta; soltar um item ou pasta do app move para cá.
 */
export default function FolderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh } = useWorkspace()
  const { menu, openMenu, closeMenu } = useContextMenu()

  const { data, loading, error, refetch } = useFetch(`/folders/${id}/contents/`, { deps: [id] })
  const { buildMenu, dialogs } = useDocumentActions({ onChanged: refetch })

  const [folderModal, setFolderModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [kindFilter, setKindFilter] = useState('')
  const [dragging, setDragging] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const onMoved = () => refetch()
    window.addEventListener('notefy:moved', onMoved)
    return () => window.removeEventListener('notefy:moved', onMoved)
  }, [refetch])

  const upload = async (files) => {
    if (!files.length) return
    setUploadError(null)
    try {
      const body = new FormData()
      files.forEach((file) => body.append('files', file))
      body.append('folder', id)
      await api.post('/documents/upload/', body)
      refetch()
      refresh()
    } catch (err) {
      setUploadError(extractError(err))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <PageBody>
        <ListSkeleton rows={5} />
      </PageBody>
    )
  }

  if (error) {
    return (
      <PageBody>
        <ErrorState message={error} onRetry={refetch} />
      </PageBody>
    )
  }

  const { folder, subfolders = [], documents = [], tasks = [], counts_by_kind = {} } = data ?? {}
  const visible = kindFilter ? documents.filter((d) => d.kind === kindFilter) : documents
  const isEmpty = !subfolders.length && !documents.length && !tasks.length
  const target = { type: 'folder', id, path: folder?.path }

  const subfolderMenu = (sub) => [
    { label: 'Abrir', icon: FolderOpen, onClick: () => navigate(`/folders/${sub.id}`) },
    {
      label: 'Nova subpasta',
      icon: FolderPlus,
      onClick: () => setFolderModal({ parent: sub, categoryId: folder.category }),
    },
    { separator: true },
    {
      label: 'Renomear',
      icon: Pencil,
      onClick: () => setFolderModal({ folder: sub, categoryId: folder.category }),
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
              A pasta <strong>{sub.name}</strong> será removida. Ela precisa estar vazia —
              mova ou exclua o conteúdo antes.
            </>
          ),
          onConfirm: async () => {
            await api.delete(`/folders/${sub.id}/`)
            refetch()
            refresh()
          },
        }),
    },
  ]

  return (
    <div
      onDragOver={(event) => {
        if (hasFilePayload(event)) {
          event.preventDefault()
          setDragging('file')
        } else if (hasItemPayload(event)) {
          event.preventDefault()
          setDragging('item')
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(null)
      }}
      onDrop={async (event) => {
        const mode = dragging
        setDragging(null)

        if (mode === 'file') {
          event.preventDefault()
          upload(Array.from(event.dataTransfer.files ?? []))
          return
        }

        const payload = readDragPayload(event)
        if (!canDrop(payload, target)) return
        event.preventDefault()
        if (payload.type === 'document') {
          await api.post(`/documents/${payload.id}/move/`, { folder: id })
        } else {
          await api.post(`/folders/${payload.id}/move/`, { parent: id })
        }
        refetch()
        refresh()
      }}
      className={cn('relative min-h-full', dragging && 'ring-2 ring-inset ring-accent-400')}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent-50/80 dark:bg-accent-500/10">
          <p className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-accent-700 shadow-pop dark:bg-ink-900 dark:text-accent-300">
            <FileUp size={16} />
            {dragging === 'file' ? 'Soltar para enviar para' : 'Soltar para mover para'} “
            {folder?.name}”
          </p>
        </div>
      )}

      <PageHeader
        title={folder?.name}
        subtitle={folder?.description || undefined}
        breadcrumb={
          folder?.breadcrumb?.length > 0 && (
            <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-400">
              <Link to="/" className="hover:text-ink-700 dark:hover:text-ink-200">
                Início
              </Link>
              <ChevronRight size={11} />
              {folder.breadcrumb.map((crumb) => (
                <span key={crumb.id} className="flex items-center gap-1">
                  <Link
                    to={
                      crumb.type === 'category'
                        ? `/categories/${crumb.id}`
                        : `/folders/${crumb.id}`
                    }
                    className="hover:text-ink-700 dark:hover:text-ink-200"
                  >
                    {crumb.name}
                  </Link>
                  <ChevronRight size={11} />
                </span>
              ))}
              <span className="text-ink-500 dark:text-ink-300">{folder.name}</span>
            </nav>
          )
        }
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => upload(Array.from(e.target.files ?? []))}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={Pencil}
              onClick={() => setFolderModal({ folder, categoryId: folder.category })}
            >
              Editar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={FolderPlus}
              onClick={() => setFolderModal({ parent: folder, categoryId: folder.category })}
            >
              Subpasta
            </Button>
            <div className="w-28">
              <CreateMenu defaultFolderId={id} defaultCategoryId={folder?.category} />
            </div>
          </>
        }
      >
        {documents.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <button
              onClick={() => setKindFilter('')}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                !kindFilter
                  ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                  : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
              )}
            >
              Tudo <span className="tabular-nums opacity-70">{documents.length}</span>
            </button>

            {Object.entries(counts_by_kind).map(([kind, count]) => {
              const meta = kindMeta(kind)
              const Icon = meta.icon
              const active = kindFilter === kind
              return (
                <button
                  key={kind}
                  onClick={() => setKindFilter(active ? '' : kind)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                    active
                      ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                  )}
                >
                  <Icon size={12} />
                  {meta.plural}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </PageHeader>

      <PageBody className="space-y-8">
        {uploadError && <ErrorState message={uploadError} />}

        {isEmpty && (
          <EmptyState
            icon={FolderOpen}
            title="Pasta vazia"
            description="Use “Criar” para uma nota, planilha, diagrama ou canvas — ou arraste arquivos para cá."
            action={
              <div className="w-32">
                <CreateMenu defaultFolderId={id} defaultCategoryId={folder?.category} />
              </div>
            }
          />
        )}

        {subfolders.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Subpastas
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {subfolders.map((sub) => (
                <article
                  key={sub.id}
                  draggable
                  onDragStart={(event) =>
                    setDragPayload(event, {
                      type: 'folder',
                      id: sub.id,
                      title: sub.name,
                      parentId: id,
                      categoryId: folder.category,
                      isRoot: false,
                      path: sub.path,
                    })
                  }
                  onClick={() => navigate(`/folders/${sub.id}`)}
                  onContextMenu={(event) => openMenu(event, { type: 'folder', folder: sub })}
                  className="card group flex cursor-pointer items-center gap-3 p-4 active:cursor-grabbing"
                >
                  <FolderOpen
                    size={17}
                    className="shrink-0 text-ink-400"
                    style={sub.color ? { color: sub.color } : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                      {sub.name}
                    </p>
                    <p className="text-xs text-ink-400">
                      {sub.document_count} item(ns) · {sub.child_count} subpasta(s)
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {visible.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              {kindFilter ? kindMeta(kindFilter).plural : 'Conteúdo'}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  onContextMenu={(event) =>
                    openMenu(event, { type: 'document', document: doc })
                  }
                />
              ))}
            </div>
          </section>
        )}

        {tasks.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Tarefas
            </h2>
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700 dark:text-ink-200">
                    {task.title}
                  </span>
                  <Badge className={TASK_STATUS[task.status]?.className}>
                    {TASK_STATUS[task.status]?.label}
                  </Badge>
                  {task.starts_at && (
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {formatRelative(task.starts_at)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageBody>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload.type === 'document'
            ? buildMenu(menu.payload.document)
            : menu
              ? subfolderMenu(menu.payload.folder)
              : []
        }
      />

      <FolderFormModal
        open={!!folderModal}
        folder={folderModal?.folder}
        parent={folderModal?.parent}
        categoryId={folderModal?.categoryId}
        onClose={() => setFolderModal(null)}
        onSaved={() => {
          setFolderModal(null)
          refetch()
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

      {dialogs}
    </div>
  )
}

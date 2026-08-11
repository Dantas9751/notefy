import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { canDrop, hasItemPayload, readDragPayload, setDragPayload } from '@/lib/dnd'
import { cn, formatRelative } from '@/lib/utils'

/**
 * Segundo nível da navegação: as pastas de uma categoria.
 *
 * Não lista itens — eles moram nas pastas, e mostrá-los aqui apagaria a
 * distinção entre os dois níveis.
 */
export default function CategoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh } = useWorkspace()
  const { menu, openMenu, closeMenu } = useContextMenu()

  const { data, loading, error, refetch } = useFetch(`/categories/${id}/contents/`, {
    deps: [id],
  })

  const [folderModal, setFolderModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  // Mover algo pela sidebar pode ter tirado (ou trazido) uma pasta daqui.
  useEffect(() => {
    const onMoved = () => refetch()
    window.addEventListener('notefy:moved', onMoved)
    return () => window.removeEventListener('notefy:moved', onMoved)
  }, [refetch])

  if (loading) {
    return (
      <PageBody>
        <ListSkeleton rows={4} />
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

  const { category, folders = [] } = data ?? {}
  const target = { type: 'category', id }

  const folderMenu = (folder) => [
    { label: 'Abrir', icon: FolderOpen, onClick: () => navigate(`/folders/${folder.id}`) },
    {
      label: 'Nova subpasta',
      icon: FolderPlus,
      onClick: () => setFolderModal({ parent: folder, categoryId: id }),
    },
    { separator: true },
    {
      label: 'Renomear',
      icon: Pencil,
      onClick: () => setFolderModal({ folder, categoryId: id }),
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
            refetch()
            refresh()
          },
        }),
    },
  ]

  return (
    <div
      onDragOver={(event) => {
        if (!hasItemPayload(event)) return
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false)
      }}
      onDrop={async (event) => {
        setDragOver(false)
        const payload = readDragPayload(event)
        if (!canDrop(payload, target)) return
        event.preventDefault()
        await api.post(`/folders/${payload.id}/move/`, { category: id })
        refetch()
        refresh()
      }}
      className={cn('min-h-full', dragOver && 'ring-2 ring-inset ring-accent-400')}
    >
      <PageHeader
        title={category?.name}
        subtitle={category?.description || `${folders.length} pasta(s) nesta categoria.`}
        breadcrumb={
          <nav className="mb-2 flex items-center gap-1 text-xs text-ink-400">
            <Link to="/" className="hover:text-ink-700 dark:hover:text-ink-200">
              Início
            </Link>
            <ChevronRight size={11} />
            <span className="text-ink-500 dark:text-ink-300">Categorias</span>
          </nav>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={Pencil}
              onClick={() => setCategoryModal(true)}
            >
              Editar
            </Button>
            <Button
              size="sm"
              icon={FolderPlus}
              onClick={() => setFolderModal({ parent: null, categoryId: id })}
            >
              Nova pasta
            </Button>
          </>
        }
      />

      <PageBody>
        {folders.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((folder) => (
              <article
                key={folder.id}
                draggable
                onDragStart={(event) =>
                  setDragPayload(event, {
                    type: 'folder',
                    id: folder.id,
                    title: folder.name,
                    parentId: null,
                    categoryId: id,
                    isRoot: true,
                  })
                }
                onClick={() => navigate(`/folders/${folder.id}`)}
                onContextMenu={(event) => openMenu(event, { folder })}
                className="card group flex cursor-pointer items-start gap-3 p-4 active:cursor-grabbing"
                style={
                  folder.color
                    ? { borderLeftColor: folder.color, borderLeftWidth: 3 }
                    : undefined
                }
              >
                <FolderOpen
                  size={18}
                  className="mt-0.5 shrink-0 text-ink-400"
                  style={folder.color ? { color: folder.color } : undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900 group-hover:text-accent-700 dark:text-ink-100 dark:group-hover:text-accent-300">
                    {folder.name}
                  </p>
                  {folder.description && (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-500 dark:text-ink-400">
                      {folder.description}
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] text-ink-400">
                    {folder.document_count} item(ns) · {folder.child_count} subpasta(s) ·{' '}
                    {formatRelative(folder.updated_at)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FolderOpen}
            title="Nenhuma pasta nesta categoria"
            description="Crie uma pasta para começar a guardar notas, arquivos, planilhas e diagramas aqui."
            action={
              <Button
                icon={FolderPlus}
                onClick={() => setFolderModal({ parent: null, categoryId: id })}
              >
                Criar pasta
              </Button>
            }
          />
        )}
      </PageBody>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? folderMenu(menu.payload.folder) : []}
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

      <CategoryFormModal
        open={categoryModal}
        category={category}
        onClose={() => setCategoryModal(false)}
        onSaved={() => {
          setCategoryModal(false)
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
    </div>
  )
}

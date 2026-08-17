import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronRight,
  FileUp,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { parseKey, useMultiSelect } from '@/hooks/useMultiSelect'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import DocumentCard from '@/components/DocumentCard'
import FavoriteButton from '@/components/FavoriteButton'
import CreateMenu from '@/components/layout/CreateMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import {
  canDrop,
  hasFilePayload,
  hasItemPayload,
  readDragPayload,
  setDragPayload,
} from '@/lib/dnd'
import { CREATABLE_KINDS, kindMeta } from '@/lib/documents'
import { TASK_STATUS, cn, formatRelative } from '@/lib/utils'

export default function FolderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh } = useWorkspace()
  const { menu, openMenu, closeMenu } = useContextMenu()

  const { data, loading, error, refetch } = useFetch(
    `/folders/${id}/contents/`,
    { deps: [id] },
  )

  const { buildMenu, dialogs } = useDocumentActions({
    onChanged: refetch,
  })

  const [folderModal, setFolderModal] = useState(null)
  const [kindFilter, setKindFilter] = useState('')
  const [dragging, setDragging] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  //: Quantidade aguardando confirmação de exclusão em lote.
  const [confirmarLote, setConfirmarLote] = useState(null)

  const fileInputRef = useRef(null)

  const {
    folder,
    subfolders = [],
    documents = [],
    tasks = [],
    counts_by_kind = {},
  } = data ?? {}

  const visible = kindFilter
    ? documents.filter((document) => document.kind === kindFilter)
    : documents

  const selectableKeys = useMemo(
    () => [
      ...subfolders.map((sub) => `folder:${sub.id}`),
      ...visible.map((document) => `document:${document.id}`),
    ],
    [subfolders, visible],
  )

  const { selected: selectedIds, isSelected, clear, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  const {
    requestDelete,
    dialogs: deleteDialogs,
  } = useCascadeDelete({
    onDeleted: () => {
      clear()
      refetch()
      refresh()
    },
    onError: setUploadError,
  })

  useEffect(() => {
    const onMoved = () => refetch()
    window.addEventListener('notefy:moved', onMoved)
    return () => {
      window.removeEventListener('notefy:moved', onMoved)
    }
  }, [refetch])

  useEffect(() => {
    clear()
  }, [id, clear])

  // O aviso some sozinho, como já acontece no CategoryDetail: ele fica no
  // topo da grade e ninguém o fecha na mão depois de ler.
  useEffect(() => {
    if (!uploadError) return undefined
    const timer = setTimeout(() => setUploadError(null), 4000)
    return () => clearTimeout(timer)
  }, [uploadError])

  const upload = async (files) => {
    if (!files.length) return
    setUploadError(null)
    try {
      const body = new FormData()
      files.forEach((file) => {
        body.append('files', file)
      })
      body.append('folder', id)
      await api.post('/documents/upload/', body)
      refetch()
      refresh()
    } catch (err) {
      setUploadError(extractError(err))
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 👇 AQUI ESTÁ A MÁGICA: `&& !data` evita que a página se destrua no meio do refetch
  if (loading && !data) {
    return (
      <PageBody>
        <ListSkeleton rows={5} />
      </PageBody>
    )
  }

  if (error && !data) {
    return (
      <PageBody>
        <ErrorState message={error} onRetry={refetch} />
      </PageBody>
    )
  }

  const isEmpty =
    !subfolders.length &&
    !documents.length &&
    !tasks.length

  const target = {
    type: 'folder',
    id,
    path: folder?.path,
  }

  const handleContextAction = (itemKey, event, payload) => {
    const total = handleContextMenu(itemKey)
    openMenu(event, { ...payload, isMultiple: total > 1 })
  }

  /**
   * Apaga um item. Devolve o resultado em vez de lançar.
   *
   * Lançar aqui abortava o `for` do lote: os itens ANTES do bloqueado eram
   * apagados e os DEPOIS nem eram tentados. Um item recusado deve ser
   * pulado, não virar parede no meio da fila.
   */
  const deleteOne = async (selectionKey) => {
    const { type: itemType, id: itemId } = parseKey(selectionKey)

    const endpoint =
      itemType === 'folder'
        ? `/folders/${itemId}/`
        : `/documents/${itemId}/`

    try {
      await api.delete(endpoint)
      return { ok: true }
    } catch (err) {
      const status = err.response?.status
      if (status === 404) return { ok: true }
      // 423 é o bloqueio por favorito, e `?force=true` não derruba —
      // repetir só gastaria outra requisição para receber o mesmo não.
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

    const idsToDelete = [...selectedIds]

    setUploadError(null)
    setConfirmarLote(null)

    // A fila vai até o fim: um item recusado não impede os seguintes.
    const bloqueados = []
    for (const selectionKey of idsToDelete) {
      const resultado = await deleteOne(selectionKey)
      if (!resultado.ok) bloqueados.push(resultado.motivo)
    }

    clear()

    if (bloqueados.length) {
      setUploadError(
        `${bloqueados.length} de ${idsToDelete.length} não foram excluídos. ${bloqueados[0]}`,
      )
    }

    await refetch()
    refresh()

    window.dispatchEvent(new Event('notefy:moved'))
  }

  const handleBulkDeleteWithDialog = () => {
    if (selectedIds.length === 0) return

    if (selectedIds.length === 1) {
      const { type: itemType, id: itemId } = parseKey(selectedIds[0])

      if (itemType === 'folder') {
        const sub = subfolders.find(
          (item) => String(item.id) === String(itemId),
        )

        if (sub) {
          setUploadError(null)

          requestDelete({
            kind: 'folder',
            id: sub.id,
            name: sub.name,
          })

          return
        }
      }

      handleBulkDelete()
      return
    }

    // Com vários, o diálogo é aberto direto — e NÃO via `requestDelete`.
    //
    // `requestDelete` começa tentando um DELETE de verdade no alvo, e só cai
    // no diálogo se o servidor pedir confirmação. Passando o primeiro item
    // como alvo, uma pasta vazia era apagada na hora, `onDeleted` fechava o
    // fluxo e o `onConfirmOverride` nunca rodava: só o primeiro sumia.
    //
    // De quebra, o caminho antigo caía em `handleBulkDelete()` direto quando
    // o primeiro selecionado era um documento — apagava tudo sem perguntar.
    setConfirmarLote(selectedIds.length)
  }

  const subfolderMenu = (payload) => {
    const { sub, isMultiple } = payload

    if (isMultiple) {
      return [
        {
          label: `Excluir (${selectedIds.length} selecionados)`,
          icon: Trash2,
          danger: true,
          onClick: handleBulkDeleteWithDialog,
        },
      ]
    }

    return [
      {
        label: 'Abrir',
        icon: FolderOpen,
        onClick: () => navigate(`/folders/${sub.id}`),
      },
      {
        label: 'Nova subpasta',
        icon: FolderPlus,
        onClick: () =>
          setFolderModal({
            parent: sub,
            categoryId: folder.category,
          }),
      },
      {
        separator: true,
      },
      {
        label: 'Renomear',
        icon: Pencil,
        onClick: () =>
          setFolderModal({
            folder: sub,
            categoryId: folder.category,
          }),
      },
      {
        label: 'Excluir',
        icon: Trash2,
        danger: true,
        onClick: () => {
          setUploadError(null)

          requestDelete({
            kind: 'folder',
            id: sub.id,
            name: sub.name,
          })
        },
      },
    ]
  }

  const pageMenu = () => [
    ...CREATABLE_KINDS.map((kind) => {
      const meta = kindMeta(kind)
      return {
        label: meta.label,
        icon: meta.icon,
        onClick: () => navigate(`${meta.route}/new?folder=${id}`),
      }
    }),
    { separator: true },
    {
      label: 'Nova subpasta',
      icon: FolderPlus,
      onClick: () => setFolderModal({ parent: folder, categoryId: folder?.category }),
    },
  ]

  const documentMenu = (payload) => {
    if (payload.isMultiple) {
      return [
        {
          label: `Excluir (${selectedIds.length} selecionados)`,
          icon: Trash2,
          danger: true,
          onClick: handleBulkDeleteWithDialog,
        },
      ]
    }

    return buildMenu(payload.document)
  }

  return (
    <div
      onDragEnter={(event) => {
        if (!hasFilePayload(event) && !hasItemPayload(event)) return

        event.preventDefault()

        setDragging(
          hasFilePayload(event)
            ? 'file'
            : 'item',
        )
      }}
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
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setDragging(null)
        }
      }}
      onDrop={async (event) => {
        setDragging(null)

        const files = Array.from(
          event.dataTransfer.files ?? [],
        )

        if (files.length) {
          event.preventDefault()
          upload(files)
          return
        }

        const payload = readDragPayload(event)

        if (!canDrop(payload, target)) return

        event.preventDefault()

        if (payload.type === 'document') {
          await api.post(
            `/documents/${payload.id}/move/`,
            { folder: id },
          )
        } else {
          await api.post(
            `/folders/${payload.id}/move/`,
            { parent: id },
          )
        }

        refetch()
        refresh()
      }}
      className={cn(
        'relative min-h-full pb-20',
        dragging && 'ring-2 ring-inset ring-accent-400',
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent-50/80 dark:bg-accent-500/10">
          <p className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-accent-700 shadow-pop dark:bg-ink-900 dark:text-accent-300">
            <FileUp size={16} />
            {dragging === 'file'
              ? 'Soltar para enviar para'
              : 'Soltar para mover para'}{' '}
            “{folder?.name}”
          </p>
        </div>
      )}

      <PageHeader
        title={folder?.name}
        subtitle={folder?.description || undefined}
        breadcrumb={
          folder?.breadcrumb?.length > 0 && (
            <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-400">
              <Link
                to="/"
                className="hover:text-ink-700 dark:hover:text-ink-200"
              >
                Início
              </Link>

              <ChevronRight size={11} />

              {folder.breadcrumb.map((crumb) => (
                <span
                  key={crumb.id}
                  className="flex items-center gap-1"
                >
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

              <span className="text-ink-500 dark:text-ink-300">
                {folder.name}
              </span>
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
              onChange={(event) =>
                upload(
                  Array.from(
                    event.target.files ?? [],
                  ),
                )
              }
            />

            <Button
              variant="secondary"
              size="sm"
              icon={Pencil}
              onClick={() =>
                setFolderModal({
                  folder,
                  categoryId: folder.category,
                })
              }
            >
              Editar
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={FolderPlus}
              onClick={() =>
                setFolderModal({
                  parent: folder,
                  categoryId: folder.category,
                })
              }
            >
              Subpasta
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={FileUp}
              onClick={() =>
                fileInputRef.current?.click()
              }
            >
              Importar arquivo
            </Button>

            <div className="w-28">
              <CreateMenu
                alignRight
                defaultFolderId={id}
                defaultCategoryId={folder?.category}
              />
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
              Tudo{' '}
              <span className="tabular-nums opacity-70">
                {documents.length}
              </span>
            </button>

            {Object.entries(counts_by_kind).map(
              ([kind, count]) => {
                const meta = kindMeta(kind)
                const Icon = meta.icon
                const active = kindFilter === kind

                return (
                  <button
                    key={kind}
                    onClick={() =>
                      setKindFilter(
                        active ? '' : kind,
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                      active
                        ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                        : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                    )}
                  >
                    <Icon size={12} />
                    {meta.plural}{' '}
                    <span className="tabular-nums opacity-70">
                      {count}
                    </span>
                  </button>
                )
              },
            )}
          </div>
        )}
      </PageHeader>

      <PageBody
        className="min-h-full space-y-8"
        onContextMenu={(event) => openMenu(event, { type: 'page' })}
      >
        {uploadError && (
          <ErrorState message={uploadError} />
        )}

        {isEmpty && (
          <EmptyState
            icon={FolderOpen}
            title="Pasta vazia"
            description="Use “Criar” para uma nota, planilha, diagrama ou canvas — ou arraste arquivos para cá."
            action={
              <div className="flex w-full justify-center">
                <CreateMenu
                  alignRight
                  defaultFolderId={id}
                  defaultCategoryId={folder?.category}
                />
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
              {subfolders.map((sub) => {
                const selectionKey = `folder:${sub.id}`
                const selecionada = isSelected(selectionKey)

                return (
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
                    onClickCapture={(event) =>
                      handleClick(selectionKey, event, () =>
                        navigate(`/folders/${sub.id}`),
                      )
                    }
                    onContextMenu={(event) =>
                      handleContextAction(selectionKey, event, {
                        type: 'subfolder',
                        sub,
                      })
                    }
                    className={cn(
                      'card group flex cursor-pointer items-center gap-3 p-4 active:cursor-grabbing transition',
                      selecionada &&
                        'ring-2 ring-accent-500 bg-accent-50/50 dark:bg-accent-500/10',
                    )}
                  >
                    <FolderOpen
                      size={17}
                      className="shrink-0 text-ink-400"
                      style={
                        sub.color
                          ? { color: sub.color }
                          : undefined
                      }
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                        {sub.name}
                      </p>

                      <p className="text-xs text-ink-400">
                        {sub.document_count} item(ns) ·{' '}
                        {sub.child_count} subpasta(s)
                      </p>
                    </div>

                    <FavoriteButton
                      endpoint={`/folders/${sub.id}/`}
                      value={sub.is_favorite}
                      onChanged={refresh}
                    />
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {visible.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              {kindFilter
                ? kindMeta(kindFilter).plural
                : 'Conteúdo'}
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((doc) => {
                const selectionKey = `document:${doc.id}`
                const selecionado = isSelected(selectionKey)
                const meta = kindMeta(doc.kind)

                return (
                  <div
                    key={doc.id}
                    onClickCapture={(event) =>
                      handleClick(selectionKey, event, () =>
                        navigate(`${meta.route}/${doc.id}`),
                      )
                    }
                    onContextMenu={(event) =>
                      handleContextAction(selectionKey, event, {
                        type: 'document',
                        document: doc,
                      })
                    }
                    className="contents"
                  >
                    <DocumentCard
                      document={doc}
                      className={cn(
                        selecionado &&
                          'ring-2 ring-accent-500 ring-offset-0 bg-accent-50/60 dark:bg-accent-500/10',
                      )}
                    />
                  </div>
                )
              })}
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
                <li
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700 dark:text-ink-200">
                    {task.title}
                  </span>

                  <Badge
                    className={
                      TASK_STATUS[task.status]
                        ?.className
                    }
                  >
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
            <Trash2 size={14} />
            Excluir
          </button>

          <button
            onClick={clear}
            className="rounded p-1 text-ink-400 transition hover:text-white"
            title="Limpar seleção"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload?.type === 'document'
            ? documentMenu(menu.payload)
            : menu?.payload?.type === 'subfolder'
              ? subfolderMenu(menu.payload)
              : menu?.payload?.type === 'page'
                ? pageMenu()
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

      {/* Confirmação do lote. Mesmo `ConfirmDialog` do resto do app; o que
          muda é que aqui ele é aberto direto, sem passar pelo
          `requestDelete` — que apagaria o primeiro item antes de perguntar. */}
      <ConfirmDialog
        open={!!confirmarLote}
        title="Excluir itens selecionados"
        message={
          <>
            <strong>{confirmarLote} itens</strong> serão excluídos, com tudo que
            estiver dentro das pastas. Isso não pode ser desfeito.
          </>
        }
        confirmLabel="Excluir tudo"
        onClose={() => setConfirmarLote(null)}
        onConfirm={handleBulkDelete}
      />

      {deleteDialogs}
      {dialogs}
    </div>
  )
}
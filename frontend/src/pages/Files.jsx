import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, Paperclip, Trash2, X, Folder as FolderIcon } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { parseKey, useMultiSelect } from '@/hooks/useMultiSelect'
import { useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, EmptyState, ErrorState, ListSkeleton, Select, Modal } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import FilterBar from '@/components/filters/FilterBar'
import DestinationModal from '@/components/modals/DestinationModal'
import DocumentCard from '@/components/DocumentCard'
import { hasFilePayload } from '@/lib/dnd'
import { documentPath } from '@/lib/documents'
import { cn } from '@/lib/utils'

const FILE_KINDS = [
  { value: 'image', label: 'Imagens' },
  { value: 'audio', label: 'Áudios' },
  { value: 'video', label: 'Vídeos' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'document', label: 'Documentos' },
  { value: 'archive', label: 'Compactados' },
  { value: 'other', label: 'Outros' },
]

export default function Files() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [fileKind, setFileKind] = useState('')
  const [page, setPage] = useState(1)

  const debouncedQuery = useDebounced(query, 350)
  const { menu, openMenu, closeMenu } = useContextMenu()

  const [actionError, setActionError] = useState(null)

  // Estado para o Modal de Exclusão em Massa
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)

  const { data, loading, error, refetch } = useFetch('/documents/', {
    params: {
      kind: 'file',
      search: debouncedQuery || undefined,
      category: category || undefined,
      file_kind: fileKind || undefined,
      ordering: '-created_at',
      is_archived: false,
      page,
    },
  })

  const { buildMenu, dialogs: docActionDialogs } = useDocumentActions({ onChanged: refetch })
  const { refresh } = useWorkspace()

  // Mesma seleção do FolderDetail: a ordem das chaves é a ordem em que a
  // grade desenha os cartões, que é o que dá sentido ao intervalo do Shift.
  const arquivos = data?.results ?? []
  const selectableKeys = useMemo(
    () => arquivos.map((doc) => `document:${doc.id}`),
    [arquivos],
  )
  const { selected: selectedIds, isSelected, clear, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  // Hook de exclusão em cascata (Usado para exclusão ÚNICA)
  const { requestDelete, dialogs: deleteDialogs } = useCascadeDelete({
    onDeleted: () => {
      clear()
      refetch()
      refresh()
      window.dispatchEvent(new Event('notefy:moved'))
    },
    onError: setActionError,
  })

  useEffect(() => {
    const onMoved = () => refetch()
    window.addEventListener('notefy:moved', onMoved)
    return () => window.removeEventListener('notefy:moved', onMoved)
  }, [refetch])

  /* ------------------------------------------------------------------ */
  /* Envio de arquivos                                                  */
  /* ------------------------------------------------------------------ */
  const [pending, setPending] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const chooseDestination = (chosen) => {
    if (!chosen.length) return
    setUploadError(null)
    setPending(chosen)
  }

  const sendTo = async (folderId) => {
    const chosen = pending ?? []
    setPending(null)
    if (!chosen.length) return
    try {
      const body = new FormData()
      chosen.forEach((file) => body.append('files', file))
      body.append('folder', folderId)
      await api.post('/documents/upload/', body)
      refetch()
      refresh()
    } catch (err) {
      setUploadError(extractError(err))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lógica de Multi-Seleção e Exclusão                                 */
  /* ------------------------------------------------------------------ */
  const files = arquivos
  const totalPages = data?.total_pages ?? 1
  const hasFilters = query || category || fileKind

  const abrirMenu = (doc, event) => {
    const total = handleContextMenu(`document:${doc.id}`)
    openMenu(event, { document: doc, isMultiple: total > 1 })
  }

  // Função interna para apagar um item individual sem erros de 404
  const deleteOne = async (selectionKey) => {
    const { id: itemId } = parseKey(selectionKey)
    const endpoint = `/documents/${itemId}/`

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

  // Executa exclusão em massa através do Modal Customizado
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
      clear()
      setBulkDeleteModalOpen(false)
      setIsDeletingBulk(false)
      
      await refetch()
      refresh()
      window.dispatchEvent(new Event('notefy:moved'))
    }
  }

  // Avalia se abre o Hook nativo (para 1 item) ou o Modal de Massa (para vários)
  const handleBulkDeleteWithDialog = () => {
    if (selectedIds.length === 0) return

    if (selectedIds.length === 1) {
      const { id: itemId } = parseKey(selectedIds[0])

      const targetItem = files.find((item) => String(item.id) === String(itemId))

      if (targetItem) {
        setActionError(null)
        requestDelete({
          kind: 'document',
          id: targetItem.id,
          name: targetItem.title,
        })
        return
      }
    }

    setBulkDeleteModalOpen(true)
  }

  return (
    <div
      onDragEnter={(event) => {
        if (!hasFilePayload(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!hasFilePayload(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={(event) => {
        setDragging(false)
        const dropped = Array.from(event.dataTransfer.files ?? [])
        if (!dropped.length) return
        event.preventDefault()
        chooseDestination(dropped)
      }}
      className={cn('relative min-h-full pb-20', dragging && 'ring-2 ring-inset ring-accent-400')}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent-50/80 dark:bg-accent-500/10">
          <p className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-accent-700 shadow-pop dark:bg-ink-900 dark:text-accent-300">
            <FileUp size={16} />
            Soltar para escolher a pasta de destino
          </p>
        </div>
      )}

      <PageHeader
        title="Arquivos"
        subtitle={
          data
            ? `${data.count} arquivo(s) — envie novos e escolha a pasta de destino.`
            : 'Carregando...'
        }
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => chooseDestination(Array.from(e.target.files ?? []))}
            />
            <Button size="sm" icon={FileUp} onClick={() => fileInputRef.current?.click()}>
              Importar arquivo
            </Button>
          </>
        }
      >
        <FilterBar
          className="mt-4"
          query={query}
          onQueryChange={(v) => {
            setQuery(v)
            setPage(1)
          }}
          placeholder="Buscar arquivos..."
          category={category}
          onCategoryChange={(v) => {
            setCategory(v)
            setPage(1)
          }}
          extra={
            <Select
              value={fileKind}
              onChange={(e) => {
                setFileKind(e.target.value)
                setPage(1)
              }}
              className="h-9 w-auto py-0 text-sm"
              aria-label="Filtrar por formato"
            >
              <option value="">Todos os formatos</option>
              {FILE_KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          }
        />
      </PageHeader>

      <PageBody>
        {uploadError && <div className="mb-4"><ErrorState message={uploadError} /></div>}
        {actionError && <div className="mb-4"><ErrorState message={actionError} /></div>}

        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : files.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((doc) => {
                const selectionKey = `document:${doc.id}`
                const selecionado = isSelected(selectionKey)
                return (
                  // `contents`: o wrapper é só área de clique. Anel desenhado
                  // aqui seguia o raio do wrapper (14px) contra os 10px do
                  // cartão e sobrava nos cantos — e o `overflow-hidden`
                  // ainda cortava o que sobrava. O realce vai no cartão.
                  <div
                    key={doc.id}
                    onClickCapture={(e) =>
                      handleClick(selectionKey, e, () => navigate(documentPath(doc)))
                    }
                    onContextMenu={(e) => abrirMenu(doc, e)}
                    className="contents"
                  >
                    <DocumentCard
                      document={doc}
                      showFolder
                      className={cn(
                        selecionado &&
                          'ring-2 ring-accent-500 ring-offset-0 bg-accent-50/60 dark:bg-accent-500/10',
                      )}
                    />
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3 text-xs text-ink-500">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-ink-200 px-2.5 py-1 disabled:opacity-40 dark:border-ink-700"
                >
                  Anterior
                </button>
                <span>
                  Página {page} de {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-ink-200 px-2.5 py-1 disabled:opacity-40 dark:border-ink-700"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Paperclip}
            title={hasFilters ? 'Nenhum resultado' : 'Nenhum arquivo ainda'}
            description={
              hasFilters
                ? 'Tente outro termo ou remova os filtros.'
                : 'Use “Importar arquivo” ou arraste arquivos para cá — depois é só escolher a pasta.'
            }
            action={
              !hasFilters && (
                <Button icon={FileUp} onClick={() => fileInputRef.current?.click()}>
                  Importar arquivo
                </Button>
              )
            }
          />
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
            onClick={clear}
            className="rounded p-1 text-ink-400 transition hover:text-white"
            title="Limpar seleção"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <DestinationModal
        open={!!pending}
        kind="file"
        title="Enviar para qual pasta?"
        confirmLabel="Enviar"
        onClose={() => {
          setPending(null)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
        onPick={sendTo}
      />

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
            : menu?.payload?.document
              ? [
                  ...(menu.payload.document.folder
                    ? [
                        {
                          label: 'Ir para pasta',
                          icon: FolderIcon,
                          onClick: () => navigate(`/folders/${menu.payload.document.folder}`),
                        },
                        { separator: true },
                      ]
                    : []),
                  ...(typeof buildMenu === 'function' ? buildMenu(menu.payload.document) : []),
                ]
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
              Sim, excluir {selectedIds.length} arquivos
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Você está prestes a excluir <strong>{selectedIds.length}</strong> arquivos de forma permanente.
          Deseja continuar?
        </p>
      </Modal>
    </div>
  )
}
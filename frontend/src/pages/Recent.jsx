import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Trash2, X, Folder as FolderIcon } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { parseKey, useMultiSelect } from '@/hooks/useMultiSelect'
import { useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, EmptyState, ErrorState, ListSkeleton, Modal } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import DocumentCard from '@/components/DocumentCard'
import FilterBar from '@/components/filters/FilterBar'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { documentPath } from '@/lib/documents'
import { cn } from '@/lib/utils'

/**
 * Recentes.
 */
export default function Recent() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const debouncedQuery = useDebounced(query, 350)

  const { menu, openMenu, closeMenu } = useContextMenu()

  const [actionError, setActionError] = useState(null)

  // Estado para o Modal de Exclusão em Massa
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)

  const { refresh } = useWorkspace()

  const { data, loading, error, refetch } = useFetch('/documents/', {
    params: {
      search: debouncedQuery || undefined,
      category: category || undefined,
      ordering: '-updated_at',
      is_archived: false,
      page_size: 48,
    },
  })

  const documents = data?.results ?? []

  // Mesma seleção do FolderDetail, mesmo hook: aqui a lista é plana, então
  // a ordem das chaves é a ordem em que a grade desenha os cartões.
  const selectableKeys = useMemo(
    () => documents.map((doc) => `document:${doc.id}`),
    [documents],
  )

  const { selected: selectedIds, isSelected, clear, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  const { buildMenu, dialogs: docActionDialogs } = useDocumentActions({ onChanged: refetch })

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

      const targetItem = documents.find((item) => String(item.id) === String(itemId))

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
    <>
      <PageHeader
        title="Recentes"
        subtitle={data ? `${data.count} item(ns) no total` : 'Carregando...'}
      >
        <FilterBar
          className="mt-4"
          query={query}
          onQueryChange={setQuery}
          placeholder="Buscar entre os recentes..."
          category={category}
          onCategoryChange={setCategory}
        />
      </PageHeader>

      <PageBody className="pb-24">
        {actionError && <div className="mb-4"><ErrorState message={actionError} /></div>}

        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : documents.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {documents.map((doc) => {
              const selectionKey = `document:${doc.id}`
              const selecionado = isSelected(selectionKey)

              return (
                // `contents` porque o wrapper aqui é só área de clique: o
                // anel desenhado nele seguia o raio do wrapper (14px)
                // enquanto o cartão tem 10px, e sobrava nos cantos — e o
                // `overflow-hidden` ainda cortava o anel, que o Tailwind
                // desenha por FORA da caixa. O realce vai no cartão.
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
        ) : (
          <EmptyState
            icon={Clock}
            title={query || category ? 'Nenhum resultado' : 'Nada por aqui ainda'}
            description={
              query || category
                ? 'Tente outro termo ou remova o filtro.'
                : 'Assim que você criar conteúdo, ele aparece aqui em ordem de edição.'
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
              Sim, excluir {selectedIds.length} itens
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Você está prestes a excluir <strong>{selectedIds.length}</strong> itens de forma permanente.
          Deseja continuar?
        </p>
      </Modal>
    </>
  )
}
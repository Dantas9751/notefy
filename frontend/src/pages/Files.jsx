import { useEffect, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { EmptyState, ErrorState, ListSkeleton, Select } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import FilterBar from '@/components/filters/FilterBar'
import DocumentCard from '@/components/DocumentCard'

const FILE_KINDS = [
  { value: 'image', label: 'Imagens' },
  { value: 'audio', label: 'Áudios' },
  { value: 'video', label: 'Vídeos' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'document', label: 'Documentos' },
  { value: 'archive', label: 'Compactados' },
  { value: 'other', label: 'Outros' },
]

/**
 * Arquivos.
 *
 * A visão transversal de tudo que foi enviado, seja de qual pasta for —
 * é para isso que ela está na navegação global. Enviar novos arquivos
 * acontece dentro da pasta de destino, porque nada existe sem pasta.
 */
export default function Files() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [fileKind, setFileKind] = useState('')
  const [page, setPage] = useState(1)

  const debouncedQuery = useDebounced(query, 350)
  const { menu, openMenu, closeMenu } = useContextMenu()

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

  const { buildMenu, dialogs } = useDocumentActions({ onChanged: refetch })

  useEffect(() => {
    const onMoved = () => refetch()
    window.addEventListener('notefy:moved', onMoved)
    return () => window.removeEventListener('notefy:moved', onMoved)
  }, [refetch])

  const files = data?.results ?? []
  const totalPages = data?.total_pages ?? 1
  const hasFilters = query || category || fileKind

  return (
    <>
      <PageHeader
        title="Arquivos"
        subtitle={
          data
            ? `${data.count} arquivo(s) — envie novos de dentro de uma pasta.`
            : 'Carregando...'
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
        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : files.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  showFolder
                  onContextMenu={openMenu}
                />
              ))}
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
                : 'Abra uma pasta e arraste os arquivos para dentro dela.'
            }
          />
        )}
      </PageBody>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? buildMenu(menu.payload.document) : []}
      />
      {dialogs}
    </>
  )
}

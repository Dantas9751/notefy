import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import DocumentCard from '@/components/DocumentCard'
import FilterBar from '@/components/filters/FilterBar'
import { useDocumentActions } from '@/hooks/useDocumentActions'

/**
 * Recentes.
 *
 * A visão transversal: o que foi mexido por último, seja de qual categoria
 * for. Cada card mostra onde o item mora, porque fora da pasta o título
 * sozinho não localiza nada.
 */
export default function Recent() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const debouncedQuery = useDebounced(query, 350)

  const { menu, openMenu, closeMenu } = useContextMenu()

  const { data, loading, error, refetch } = useFetch('/documents/', {
    params: {
      search: debouncedQuery || undefined,
      category: category || undefined,
      ordering: '-updated_at',
      is_archived: false,
      page_size: 48,
    },
  })

  const { buildMenu, dialogs } = useDocumentActions({ onChanged: refetch })

  useEffect(() => {
    const onMoved = () => refetch()
    window.addEventListener('notefy:moved', onMoved)
    return () => window.removeEventListener('notefy:moved', onMoved)
  }, [refetch])

  const documents = data?.results ?? []

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

      <PageBody>
        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : documents.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                showFolder
                onContextMenu={openMenu}
              />
            ))}
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

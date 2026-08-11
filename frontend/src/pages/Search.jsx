import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckSquare, Folder as FolderIcon, SearchX } from 'lucide-react'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import FilterBar from '@/components/filters/FilterBar'
import { DOCUMENT_KINDS } from '@/lib/documents'
import { cn, formatRelative } from '@/lib/utils'

/**
 * Busca global.
 *
 * Os chips de tipo cobrem os cinco formatos de documento mais pastas e
 * tarefas — sete filtros que combinam livremente com categoria e data.
 */
const TYPE_META = {
  ...Object.fromEntries(
    Object.entries(DOCUMENT_KINDS).map(([kind, meta]) => [
      kind,
      { label: meta.plural, icon: meta.icon, accent: meta.accent },
    ]),
  ),
  folder: { label: 'Pastas', icon: FolderIcon, accent: '#78716C' },
  task: { label: 'Tarefas', icon: CheckSquare, accent: '#0EA5E9' },
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [types, setTypes] = useState(searchParams.getAll('type'))
  const [category, setCategory] = useState(searchParams.get('category') ?? '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') ?? '')
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') ?? '')

  const debouncedQuery = useDebounced(query, 350)

  // Reflete o estado dos filtros na URL para que a busca seja
  // compartilhável e sobreviva a um refresh.
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedQuery) next.set('q', debouncedQuery)
    types.forEach((t) => next.append('type', t))
    if (category) next.set('category', category)
    if (dateFrom) next.set('date_from', dateFrom)
    if (dateTo) next.set('date_to', dateTo)
    setSearchParams(next, { replace: true })
  }, [debouncedQuery, types, category, dateFrom, dateTo, setSearchParams])

  const { data, loading, error, refetch } = useFetch('/search/', {
    params: {
      q: debouncedQuery || undefined,
      type: types.length ? types : undefined,
      category: category || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    },
  })

  const toggleType = (type) =>
    setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))

  const results = data?.results ?? []
  const hasCriteria = debouncedQuery || types.length || category || dateFrom || dateTo

  return (
    <>
      <PageHeader
        title="Busca global"
        subtitle="Procure em notas, arquivos, planilhas, diagramas, canvas, pastas e tarefas ao mesmo tempo."
      >
        <div className="mt-4 space-y-3">
          <FilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Buscar em tudo..."
            category={category}
            onCategoryChange={setCategory}
            extra={
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="Data inicial"
                  className="input h-9 w-auto py-0 text-sm"
                />
                <span className="text-xs text-ink-400">até</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="Data final"
                  min={dateFrom || undefined}
                  className="input h-9 w-auto py-0 text-sm"
                />
              </>
            }
          />

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TYPE_META).map(([type, { label, icon: Icon, accent }]) => {
              const active = types.includes(type)
              const count = data?.counts?.[type]
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  style={active ? { borderColor: accent, color: accent } : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                    active
                      ? 'bg-white dark:bg-ink-900'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                  )}
                >
                  <Icon size={13} />
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="tabular-nums opacity-70">{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </PageHeader>

      <PageBody>
        {error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : loading ? (
          <ListSkeleton rows={6} />
        ) : results.length ? (
          <>
            <p className="mb-3 text-xs text-ink-400">
              {data.total} resultado(s)
              {debouncedQuery && <> para “{debouncedQuery}”</>}
            </p>

            <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {results.map((item) => {
                const meta = TYPE_META[item.type] ?? TYPE_META.note
                const Icon = meta.icon
                return (
                  <li key={`${item.type}-${item.id}`}>
                    <Link
                      to={item.url}
                      className="flex items-start gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-900"
                    >
                      <Icon
                        size={16}
                        className="mt-0.5 shrink-0"
                        style={{ color: item.color || meta.accent }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                            {item.title}
                          </p>
                          <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-400">{item.subtitle}</p>
                        {item.snippet && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-ink-500 dark:text-ink-400">
                            {item.snippet}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-ink-400">
                        {formatRelative(item.updated_at)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <EmptyState
            icon={SearchX}
            title={hasCriteria ? 'Nenhum resultado' : 'Comece a buscar'}
            description={
              hasCriteria
                ? 'Tente outro termo ou remova alguns filtros.'
                : 'Digite um termo ou combine filtros de tipo, categoria e data.'
            }
          />
        )}
      </PageBody>
    </>
  )
}

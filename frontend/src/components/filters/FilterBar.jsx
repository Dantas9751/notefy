import { Search, X } from 'lucide-react'
import { useWorkspace } from '@/context/WorkspaceContext'
import { Select } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Barra de pesquisa + filtros dinâmicos.
 *
 * As opções de categoria vêm do workspace (dados do usuário), e as de
 * status são passadas por quem usa a barra — assim o mesmo componente
 * serve documentos e tarefas, que têm conjuntos de status diferentes.
 *
 * Filtrar por categoria significa "o que está nas pastas dela": o item
 * não tem categoria própria, ela vem da pasta onde mora.
 */
export default function FilterBar({
  query,
  onQueryChange,
  placeholder = 'Buscar...',
  statusOptions,
  status,
  onStatusChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  sortOptions,
  extra,
  //: A busca tem filtros que não cabem nesta barra (datas e chips de tipo).
  //: Sem estes dois avisos o botão "Limpar" não aparecia quando só eles
  //: estavam ativos, e quando aparecia deixava os dois para trás.
  extraActive = false,
  onClearExtra,
  className,
}) {
  const { categoryList: categories } = useWorkspace()

  const hasFilters = Boolean(query || status || category || extraActive)

  const clearAll = () => {
    onQueryChange?.('')
    onStatusChange?.('')
    onCategoryChange?.('')
    onClearExtra?.()
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative min-w-[200px] flex-1">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
        <input
          value={query ?? ''}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder={placeholder}
          className="input pl-9"
          type="search"
        />
      </div>

      {statusOptions && (
        <Select
          value={status ?? ''}
          onChange={(e) => onStatusChange?.(e.target.value)}
          className="h-9 w-auto py-0 text-sm"
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      )}

      {onCategoryChange && (
        <Select
          value={category ?? ''}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="h-9 w-auto py-0 text-sm"
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      {sortOptions && (
        <Select
          value={sort ?? ''}
          onChange={(e) => onSortChange?.(e.target.value)}
          className="h-9 w-auto py-0 text-sm"
          aria-label="Ordenar"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      )}

      {extra}

      {hasFilters && (
        <button
          onClick={clearAll}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-500 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
        >
          <X size={13} />
          Limpar
        </button>
      )}
    </div>
  )
}

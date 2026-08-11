import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  Eraser,
  Filter,
  HelpCircle,
  MoveHorizontal,
  Plus,
  Sigma,
  Trash2,
  X,
} from 'lucide-react'
import {
  AGGREGATE_LABELS,
  FILTER_OPERATORS,
  FUNCTION_HELP,
  aggregate,
  columnLetter,
  displayValue,
  visibleRows,
} from '@/lib/formula'
import { cn } from '@/lib/utils'

/**
 * Planilha com colunas tipadas, fórmulas, resumo, ordenação e filtros.
 *
 * Todo o estado vive no `data` do documento; este componente é uma função
 * pura desse payload e devolve o novo payload em `onChange`. Assim salvar,
 * desfazer e o autosave da página funcionam sem cópia local dos dados.
 */

const COLUMN_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'longtext', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Moeda' },
  { value: 'percent', label: 'Porcentagem' },
  { value: 'date', label: 'Data' },
  { value: 'datetime', label: 'Data e hora' },
  { value: 'select', label: 'Seleção' },
  { value: 'multiselect', label: 'Seleção múltipla' },
  { value: 'checkbox', label: 'Caixa' },
  { value: 'rating', label: 'Avaliação' },
  { value: 'url', label: 'Link' },
  { value: 'email', label: 'E-mail' },
  { value: 'formula', label: 'Fórmula' },
]

const NUMERIC_TYPES = ['number', 'currency', 'percent', 'rating', 'formula']

const uid = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 9)}`

/* -------------------------------------------------------------------- */
/* Menu de coluna                                                       */
/* -------------------------------------------------------------------- */

function ColumnMenu({
  column,
  index,
  total,
  sort,
  onUpdate,
  onDelete,
  onClear,
  onAutoFit,
  onSort,
  onClose,
}) {
  const [name, setName] = useState(column.name)
  const numeric = NUMERIC_TYPES.includes(column.type)

  return (
    <>
      <div className="fixed inset-0 z-20" onMouseDown={onClose} aria-hidden />
      <div className="absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-64 overflow-y-auto rounded-md border border-ink-200 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-900">
        <label className="label">Nome</label>
        <input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onUpdate({ name: name.trim() || column.name })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onUpdate({ name: name.trim() || column.name })
              onClose()
            }
          }}
          className="input h-8 py-0 text-sm"
        />

        <label className="label mt-3">Tipo</label>
        <select
          value={column.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="input h-8 cursor-pointer py-0 text-sm"
        >
          {COLUMN_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {(column.type === 'select' || column.type === 'multiselect') && (
          <>
            <label className="label mt-3">Opções (uma por linha)</label>
            <textarea
              defaultValue={(column.options ?? []).join('\n')}
              onBlur={(e) =>
                onUpdate({
                  options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                })
              }
              rows={3}
              className="input py-1 text-sm"
            />
          </>
        )}

        {column.type === 'currency' && (
          <>
            <label className="label mt-3">Moeda</label>
            <select
              value={column.currency ?? 'BRL'}
              onChange={(e) => onUpdate({ currency: e.target.value })}
              className="input h-8 cursor-pointer py-0 text-sm"
            >
              <option value="BRL">Real (R$)</option>
              <option value="USD">Dólar (US$)</option>
              <option value="EUR">Euro (€)</option>
            </select>
          </>
        )}

        {numeric && column.type !== 'rating' && (
          <>
            <label className="label mt-3">Casas decimais</label>
            <input
              type="number"
              min={0}
              max={6}
              value={column.decimals ?? ''}
              placeholder="automático"
              onChange={(e) =>
                onUpdate({ decimals: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="input h-8 py-0 text-sm"
            />
          </>
        )}

        <label className="label mt-3">Resumo no rodapé</label>
        <select
          value={column.aggregate ?? 'none'}
          onChange={(e) => onUpdate({ aggregate: e.target.value })}
          className="input h-8 cursor-pointer py-0 text-sm"
        >
          {Object.entries(AGGREGATE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {column.type === 'formula' && (
          <p className="mt-3 rounded bg-ink-50 p-2 text-[11px] leading-relaxed text-ink-500 dark:bg-ink-800 dark:text-ink-400">
            Escreva a fórmula em cada célula. Ex.:{' '}
            <code className="font-mono">=SOMA(A1:A5)</code> ou{' '}
            <code className="font-mono">=SE(B2&gt;7; &quot;ok&quot;; &quot;revisar&quot;)</code>
          </p>
        )}

        <div className="mt-3 space-y-0.5 border-t border-ink-100 pt-2 dark:border-ink-800">
          <button
            type="button"
            onClick={() => {
              onSort(sort?.column === column.id && sort?.direction === 'asc' ? 'desc' : 'asc')
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            <ArrowDownAZ size={13} />
            {sort?.column === column.id && sort?.direction === 'asc'
              ? 'Ordenar Z → A'
              : 'Ordenar A → Z'}
          </button>
          <button
            type="button"
            onClick={() => {
              onAutoFit()
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            <MoveHorizontal size={13} />
            Ajustar largura ao conteúdo
          </button>
          <button
            type="button"
            onClick={() => {
              onClear()
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            <Eraser size={13} />
            Limpar valores da coluna
          </button>
          <button
            type="button"
            disabled={total <= 1}
            onClick={() => {
              onDelete()
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-500/10"
          >
            <Trash2 size={13} />
            Excluir coluna {columnLetter(index)}
          </button>
        </div>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------- */
/* Edição de célula                                                     */
/* -------------------------------------------------------------------- */

function CellInput({ column, value, onCommit, onCancel }) {
  const [draft, setDraft] = useState(
    Array.isArray(value) ? value.join(', ') : (value ?? ''),
  )

  if (column.type === 'select') {
    return (
      <select
        autoFocus
        value={draft}
        onChange={(e) => onCommit(e.target.value)}
        onBlur={onCancel}
        className="h-full w-full border-0 bg-transparent px-2 text-sm focus:outline-none"
      >
        <option value="">—</option>
        {(column.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  if (column.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="absolute z-30 max-h-48 w-full overflow-y-auto rounded border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900">
        {(column.options ?? []).map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-ink-50 dark:hover:bg-ink-800"
          >
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(e) =>
                onCommit(
                  e.target.checked
                    ? [...selected, option]
                    : selected.filter((v) => v !== option),
                )
              }
              className="rounded border-ink-300 text-accent-600"
            />
            {option}
          </label>
        ))}
        <button
          onClick={onCancel}
          className="mt-1 w-full rounded px-2 py-1 text-xs text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
        >
          Fechar
        </button>
      </div>
    )
  }

  if (column.type === 'rating') {
    const current = Number(draft) || 0
    return (
      <div className="flex h-full items-center gap-0.5 px-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onCommit(star === current ? 0 : star)}
            className={cn(
              'text-base leading-none transition',
              star <= current ? 'text-amber-400' : 'text-ink-300 hover:text-amber-300',
            )}
          >
            ★
          </button>
        ))}
      </div>
    )
  }

  const inputType =
    column.type === 'date'
      ? 'date'
      : column.type === 'datetime'
        ? 'datetime-local'
        : column.type === 'email'
          ? 'email'
          : column.type === 'url'
            ? 'url'
            : 'text'

  return (
    <input
      autoFocus
      type={inputType}
      inputMode={NUMERIC_TYPES.includes(column.type) ? 'decimal' : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(draft)
        }
        if (e.key === 'Escape') onCancel()
      }}
      className={cn(
        'h-full w-full border-0 bg-transparent px-2 text-sm focus:outline-none',
        column.type === 'formula' && 'font-mono text-[13px]',
      )}
    />
  )
}

/* -------------------------------------------------------------------- */
/* Barra de filtros                                                     */
/* -------------------------------------------------------------------- */

function FilterBar({ data, onChange }) {
  const columns = data?.columns ?? []
  const filters = data?.filters ?? []

  const update = (index, patch) =>
    onChange({
      filters: filters.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    })

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2 dark:border-ink-800">
      {filters.map((rule, index) => {
        const needsValue = !['filled', 'empty'].includes(rule.operator)
        return (
          <div
            key={index}
            className="flex items-center gap-1 rounded-md border border-ink-200 bg-ink-50 px-1.5 py-1 dark:border-ink-700 dark:bg-ink-800/60"
          >
            <select
              value={rule.column}
              onChange={(e) => update(index, { column: e.target.value })}
              className="border-0 bg-transparent text-xs focus:ring-0"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={rule.operator}
              onChange={(e) => update(index, { operator: e.target.value })}
              className="border-0 bg-transparent text-xs focus:ring-0"
            >
              {FILTER_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            {needsValue && (
              <input
                value={rule.value ?? ''}
                onChange={(e) => update(index, { value: e.target.value })}
                placeholder="valor"
                className="w-24 border-0 bg-transparent px-1 text-xs focus:ring-0"
              />
            )}
            <button
              onClick={() => onChange({ filters: filters.filter((_, i) => i !== index) })}
              aria-label="Remover filtro"
              className="rounded p-0.5 text-ink-400 hover:text-red-600"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}

      <button
        onClick={() =>
          onChange({
            filters: [
              ...filters,
              { column: columns[0]?.id, operator: 'contains', value: '' },
            ],
          })
        }
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
      >
        <Filter size={12} /> Filtro
      </button>
      {filters.length > 0 && (
        <button
          onClick={() => onChange({ filters: [] })}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <X size={12} /> Limpar todos
        </button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- */
/* Editor                                                               */
/* -------------------------------------------------------------------- */

export default function SpreadsheetEditor({ data, onChange }) {
  const columns = data?.columns ?? []
  const rows = data?.rows ?? []
  const sort = data?.sort ?? null
  const frozen = data?.frozen_columns ?? 0

  const [editing, setEditing] = useState(null)
  const [menuColumn, setMenuColumn] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  //: Coluna inteira selecionada pelo clique no cabeçalho.
  const [selectedColumn, setSelectedColumn] = useState(null)
  //: Arraste da divisória do cabeçalho para mudar a largura.
  const [resizing, setResizing] = useState(null)
  //: Reordenação de coluna arrastando o próprio cabeçalho.
  const [dragColumn, setDragColumn] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)

  const update = (patch) => onChange({ ...data, ...patch })

  const setCell = (rowId, colId, value) =>
    update({
      rows: rows.map((row) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [colId]: value } } : row,
      ),
    })

  const addRow = () => update({ rows: [...rows, { id: uid('r'), cells: {} }] })

  const addColumn = () =>
    update({
      columns: [
        ...columns,
        {
          id: uid('c'),
          name: `Coluna ${columns.length + 1}`,
          type: 'text',
          width: 160,
          aggregate: 'none',
        },
      ],
    })

  const updateColumn = (id, patch) =>
    update({ columns: columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  const deleteColumn = (id) =>
    update({
      columns: columns.filter((c) => c.id !== id),
      // As células da coluna removida ficariam órfãs no payload e
      // reapareceriam se uma coluna nova reaproveitasse o id.
      rows: rows.map((row) => {
        const { [id]: _removed, ...rest } = row.cells ?? {}
        return { ...row, cells: rest }
      }),
      sort: sort?.column === id ? null : sort,
      filters: (data?.filters ?? []).filter((f) => f.column !== id),
    })

  const deleteRow = (id) => update({ rows: rows.filter((r) => r.id !== id) })

  /* ------------------------------------------------------------------ */
  /* Cabeçalho: largura, seleção e ordem                                */
  /* ------------------------------------------------------------------ */

  // Arrastar a divisória entre dois cabeçalhos muda a largura, como no
  // Excel. O listener vive em `window` porque o ponteiro sai da célula
  // estreita da divisória assim que o arraste começa.
  useEffect(() => {
    if (!resizing) return undefined

    const onMove = (event) => {
      const width = Math.max(60, resizing.startWidth + (event.clientX - resizing.startX))
      updateColumn(resizing.id, { width: Math.round(width) })
    }
    const onUp = () => setResizing(null)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  /** Duplo clique na divisória ajusta a largura ao conteúdo. */
  const autoFitColumn = (column) => {
    const header = column.name.length
    const widest = rows.reduce((max, row) => {
      const { text } = displayValue(column, row, columns, rows)
      return Math.max(max, String(text).length)
    }, header)
    updateColumn(column.id, { width: Math.min(420, Math.max(80, widest * 8 + 42)) })
  }

  const moveColumn = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    const next = [...columns]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    // As fórmulas endereçam por POSIÇÃO (A, B, C...), então reordenar
    // muda o significado de cada letra. É o mesmo comportamento do Excel
    // ao recortar e inserir uma coluna, e o usuário vê o resultado na hora.
    update({ columns: next })
  }

  const clearColumn = (column) =>
    update({
      rows: rows.map((row) => {
        const { [column.id]: _cleared, ...rest } = row.cells ?? {}
        return { ...row, cells: rest }
      }),
    })

  // Ordenar e filtrar são VISÃO: o array de linhas não muda de ordem, senão
  // as referências das fórmulas (A1, A2...) apontariam para outras células.
  const shown = useMemo(() => visibleRows(data), [data])

  const summaries = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, aggregate(c, shown, columns)])),
    [columns, shown],
  )

  const hasSummary = Object.values(summaries).some(Boolean)
  const hiddenCount = rows.length - shown.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2 dark:border-ink-800">
        <button
          onClick={addColumn}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          <Plus size={13} /> Coluna
        </button>
        <button
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          <Plus size={13} /> Linha
        </button>

        {sort && (
          <button
            onClick={() => update({ sort: null })}
            className="inline-flex items-center gap-1 rounded-md border border-accent-300 bg-accent-50 px-2 py-1 text-xs text-accent-700 dark:border-accent-500/40 dark:bg-accent-500/15 dark:text-accent-300"
          >
            {sort.direction === 'desc' ? <ArrowUpAZ size={12} /> : <ArrowDownAZ size={12} />}
            {columns.find((c) => c.id === sort.column)?.name}
            <X size={11} />
          </button>
        )}

        <button
          onClick={() => update({ frozen_columns: frozen ? 0 : 1 })}
          title="Congelar a primeira coluna"
          className={cn(
            'rounded px-2 py-1 text-xs transition',
            frozen
              ? 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200'
              : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800',
          )}
        >
          Congelar 1ª
        </button>

        <div className="relative ml-auto flex items-center gap-2">
          <span className="text-[11px] text-ink-400">
            {shown.length} de {rows.length} linha(s)
            {hiddenCount > 0 && ` · ${hiddenCount} oculta(s)`} · {columns.length} coluna(s)
          </span>
          <button
            onClick={() => setShowHelp((v) => !v)}
            aria-label="Ajuda de fórmulas"
            className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
          >
            <HelpCircle size={14} />
          </button>

          {showHelp && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowHelp(false)} aria-hidden />
              <div className="absolute right-0 top-full z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-ink-200 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-900">
                <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  Fórmulas
                </p>
                <ul className="space-y-1">
                  {FUNCTION_HELP.map((fn) => (
                    <li key={fn.name} className="rounded px-1 py-0.5">
                      <code className="block font-mono text-[11px] text-accent-700 dark:text-accent-300">
                        {fn.name}
                      </code>
                      <span className="text-[11px] text-ink-500 dark:text-ink-400">
                        {fn.desc}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      <FilterBar data={data} onChange={(patch) => update(patch)} />

      {/* Grade */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-10 border-b border-r border-ink-200 bg-ink-50 px-1 py-1.5 text-[11px] font-medium text-ink-400 dark:border-ink-700 dark:bg-ink-900">
                #
              </th>
              {columns.map((column, index) => (
                <th
                  key={column.id}
                  style={{
                    width: column.width ?? 160,
                    minWidth: column.width ?? 160,
                    ...(index < frozen ? { left: 40, position: 'sticky', zIndex: 20 } : {}),
                  }}
                  className={cn(
                    'relative border-b border-r border-ink-200 bg-ink-50 p-0 text-left dark:border-ink-700 dark:bg-ink-900',
                    selectedColumn === column.id && 'bg-accent-100 dark:bg-accent-500/20',
                    dropIndex === index && 'border-l-2 border-l-accent-500',
                  )}
                  // Arrastar o cabeçalho reordena a coluna.
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', column.id)
                    setDragColumn(index)
                  }}
                  onDragOver={(e) => {
                    if (dragColumn === null) return
                    e.preventDefault()
                    setDropIndex(index)
                  }}
                  onDrop={(e) => {
                    if (dragColumn === null) return
                    e.preventDefault()
                    moveColumn(dragColumn, index)
                    setDragColumn(null)
                    setDropIndex(null)
                  }}
                  onDragEnd={() => {
                    setDragColumn(null)
                    setDropIndex(null)
                  }}
                >
                  <div className="flex w-full items-center">
                    {/* Clicar seleciona a coluna inteira; a seta abre o menu. */}
                    <button
                      onClick={() =>
                        setSelectedColumn(selectedColumn === column.id ? null : column.id)
                      }
                      onDoubleClick={() => setMenuColumn(column.id)}
                      title="Clique para selecionar a coluna · duplo clique abre as opções"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left transition hover:bg-ink-100 dark:hover:bg-ink-800"
                    >
                      <span className="font-mono text-[10px] text-ink-400">
                        {columnLetter(index)}
                      </span>
                      <span className="truncate text-xs font-medium text-ink-700 dark:text-ink-200">
                        {column.name}
                      </span>
                      {column.type === 'formula' && (
                        <Sigma size={11} className="shrink-0 text-accent-500" />
                      )}
                      {sort?.column === column.id &&
                        (sort.direction === 'desc' ? (
                          <ArrowUpAZ size={11} className="shrink-0 text-accent-500" />
                        ) : (
                          <ArrowDownAZ size={11} className="shrink-0 text-accent-500" />
                        ))}
                    </button>

                    <button
                      onClick={() => setMenuColumn(menuColumn === column.id ? null : column.id)}
                      aria-label={`Opções de ${column.name}`}
                      className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 dark:hover:bg-ink-700"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>

                  {/* Divisória: arrastar muda a largura, duplo clique
                      ajusta ao conteúdo. */}
                  <span
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setResizing({
                        id: column.id,
                        startX: e.clientX,
                        startWidth: column.width ?? 160,
                      })
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      autoFitColumn(column)
                    }}
                    title="Arraste para redimensionar · duplo clique ajusta ao conteúdo"
                    className={cn(
                      'absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize',
                      'hover:bg-accent-400',
                      resizing?.id === column.id && 'bg-accent-500',
                    )}
                  />

                  {menuColumn === column.id && (
                    <ColumnMenu
                      column={column}
                      index={index}
                      total={columns.length}
                      sort={sort}
                      onUpdate={(patch) => updateColumn(column.id, patch)}
                      onDelete={() => deleteColumn(column.id)}
                      onClear={() => clearColumn(column)}
                      onAutoFit={() => autoFitColumn(column)}
                      onSort={(direction) => update({ sort: { column: column.id, direction } })}
                      onClose={() => setMenuColumn(null)}
                    />
                  )}
                </th>
              ))}
              <th className="border-b border-ink-200 bg-ink-50 px-1 dark:border-ink-700 dark:bg-ink-900">
                <button
                  onClick={addColumn}
                  aria-label="Adicionar coluna"
                  className="rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
                >
                  <Plus size={13} />
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {shown.map((row) => {
              // O número visível é a posição REAL da linha: é ela que a
              // fórmula endereça, mesmo com a tabela ordenada ou filtrada.
              const realIndex = rows.findIndex((r) => r.id === row.id)
              return (
                <tr key={row.id} className="group">
                  <td className="sticky left-0 z-10 border-b border-r border-ink-200 bg-white px-1 text-center text-[11px] tabular-nums text-ink-400 dark:border-ink-700 dark:bg-ink-950">
                    <span className="group-hover:hidden">{realIndex + 1}</span>
                    <button
                      onClick={() => deleteRow(row.id)}
                      aria-label={`Excluir linha ${realIndex + 1}`}
                      className="hidden p-0.5 text-ink-400 transition hover:text-red-600 group-hover:inline-block"
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>

                  {columns.map((column, colIndex) => {
                    const isEditing = editing?.rowId === row.id && editing?.colId === column.id
                    const { text, error, raw } = displayValue(column, row, columns, rows)
                    const sticky =
                      colIndex < frozen
                        ? { left: 40, position: 'sticky', zIndex: 10 }
                        : undefined

                    if (column.type === 'checkbox') {
                      return (
                        <td
                          key={column.id}
                          style={sticky}
                          className="border-b border-r border-ink-200 bg-white text-center dark:border-ink-700 dark:bg-ink-950"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(raw)}
                            onChange={(e) => setCell(row.id, column.id, e.target.checked)}
                            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
                          />
                        </td>
                      )
                    }

                    return (
                      <td
                        key={column.id}
                        style={sticky}
                        onDoubleClick={() => setEditing({ rowId: row.id, colId: column.id })}
                        className={cn(
                          'relative h-8 cursor-cell border-b border-r border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-950',
                          isEditing && 'ring-1 ring-inset ring-accent-500',
                          error && 'bg-red-50 dark:bg-red-500/10',
                          // Coluna selecionada pelo cabeçalho fica realçada
                          // de ponta a ponta, como no Excel.
                          selectedColumn === column.id && 'bg-accent-50 dark:bg-accent-500/10',
                        )}
                      >
                        {isEditing ? (
                          <CellInput
                            column={column}
                            value={raw}
                            onCommit={(value) => {
                              setCell(row.id, column.id, value)
                              if (column.type !== 'multiselect') setEditing(null)
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <div
                            onClick={() => setEditing({ rowId: row.id, colId: column.id })}
                            title={error || undefined}
                            className={cn(
                              'flex h-8 items-center truncate px-2',
                              NUMERIC_TYPES.includes(column.type) &&
                                column.type !== 'rating' &&
                                'justify-end tabular-nums',
                              column.type === 'formula' && 'font-medium',
                              column.type === 'url' && 'text-accent-600 underline',
                              error && 'text-red-600 dark:text-red-400',
                            )}
                          >
                            {text}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="border-b border-ink-200 dark:border-ink-700" />
                </tr>
              )
            })}

            <tr>
              <td className="sticky left-0 border-r border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-950" />
              <td colSpan={columns.length + 1} className="p-0">
                <button
                  onClick={addRow}
                  className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-ink-400 transition hover:bg-ink-50 hover:text-ink-600 dark:hover:bg-ink-900"
                >
                  <Plus size={13} /> Nova linha
                </button>
              </td>
            </tr>
          </tbody>

          {hasSummary && (
            <tfoot className="sticky bottom-0">
              <tr className="bg-ink-50 dark:bg-ink-900">
                <td className="sticky left-0 border-r border-t border-ink-200 bg-ink-50 px-1 text-center text-[10px] text-ink-400 dark:border-ink-700 dark:bg-ink-900">
                  Σ
                </td>
                {columns.map((column) => {
                  const summary = summaries[column.id]
                  return (
                    <td
                      key={column.id}
                      className="border-r border-t border-ink-200 px-2 py-1.5 text-right dark:border-ink-700"
                    >
                      {summary && (
                        <>
                          <span className="mr-1 text-[10px] uppercase tracking-wide text-ink-400">
                            {summary.label}
                          </span>
                          <span className="text-xs font-medium tabular-nums text-ink-700 dark:text-ink-200">
                            {summary.text}
                          </span>
                        </>
                      )}
                    </td>
                  )
                })}
                <td className="border-t border-ink-200 dark:border-ink-700" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

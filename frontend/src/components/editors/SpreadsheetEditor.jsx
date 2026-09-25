import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { copiarTexto } from '@/lib/desktop'
import { cn } from '@/lib/utils'
import { useMenuSuspenso } from '@/hooks/useMenuSuspenso'
import {
  bordasDaSelecao,
  colar,
  dentroDeAlguma,
  deTSV,
  limpar,
  paraTSV,
  retangulo,
  uniao,
} from '@/lib/celulas'

/**
 * Contorno da seleção como `box-shadow`, um lado por vez.
 *
 * `box-shadow` desenha POR DENTRO da célula (`inset`): não empurra o
 * layout como `border` faria, e o traço fica alinhado com a grade. Só os
 * lados que fazem divisa com o lado de fora são desenhados, então blocos
 * vizinhos formam um contorno contínuo em vez de uma caixinha por célula.
 */
function contornoDaSelecao(bordas, cor, espessura) {
  if (!bordas) return undefined
  const linhas = []
  if (bordas.topo) linhas.push(`inset 0 ${espessura}px 0 0 ${cor}`)
  if (bordas.base) linhas.push(`inset 0 -${espessura}px 0 0 ${cor}`)
  if (bordas.esquerda) linhas.push(`inset ${espessura}px 0 0 0 ${cor}`)
  if (bordas.direita) linhas.push(`inset -${espessura}px 0 0 0 ${cor}`)
  return linhas.length ? linhas.join(', ') : undefined
}

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
  ancora,
  onUpdate,
  onDelete,
  onClear,
  onAutoFit,
  onSort,
  onClose,
}) {
  const [name, setName] = useState(column.name)
  const numeric = NUMERIC_TYPES.includes(column.type)

  // O menu vai para um portal no `body` em vez de ficar dentro do `<th>`.
  //
  // Dentro da tabela ele era filho de uma célula do cabeçalho, que já vive
  // num contexto de empilhamento próprio (thead sticky, e as colunas
  // congeladas com z-index maior). Um z-index alto AQUI dentro não vence
  // um irmão lá fora: o navegador compara os pais primeiro, então as
  // colunas seguintes passavam por cima da caixa. No body não há pai que
  // limite, e o menu fica acima de tudo.
  const menuRef = useRef(null)
  const [pos, setPos] = useState(() => ({
    left: ancora?.left ?? 0,
    top: ancora?.bottom ?? 0,
  }))

  useLayoutEffect(() => {
    if (!ancora || !menuRef.current) return
    const caixa = menuRef.current.getBoundingClientRect()
    setPos({
      // Não deixa vazar pela direita nem pelo fundo da janela.
      left: Math.max(8, Math.min(ancora.left, window.innerWidth - caixa.width - 8)),
      top: Math.max(8, Math.min(ancora.bottom + 4, window.innerHeight - caixa.height - 8)),
    })
  }, [ancora])

  // Posição fixa não acompanha a rolagem: rolar a planilha deixaria o
  // menu parado sobre uma coluna que já não é a dele. Fecha em vez disso.
  useEffect(() => {
    const fechar = () => onClose()
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    return () => {
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
    }
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onMouseDown={onClose} aria-hidden />
      <div
        ref={menuRef}
        style={{ left: pos.left, top: pos.top }}
        className="fixed z-[71] max-h-[70vh] w-64 overflow-y-auto rounded-md border border-ink-200 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-900"
      >
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
    </>,
    document.body,
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
        if (e.key === 'Escape') {
          onCancel()
          return
        }

        // Toda navegação grava antes de sair: sair de uma célula sem
        // gravar o que foi digitado perde trabalho silenciosamente.
        //
        // `criar` diz se bater na borda ESTENDE a planilha ou apenas para.
        // Enter e a seta para baixo criam linha — é o de sempre. A seta
        // para a direita cria coluna, pelo mesmo motivo. O Tab NÃO: ele
        // percorre célula a célula, e criar uma coluna a cada volta
        // enchia a planilha de colunas sem a pessoa perceber.
        const irPara = (direcao, criar = false) => {
          e.preventDefault()
          onCommit(draft, direcao, criar)
        }

        if (e.key === 'Enter') return irPara(e.shiftKey ? 'up' : 'down', !e.shiftKey)
        if (e.key === 'Tab') return irPara(e.shiftKey ? 'left' : 'right')
        if (e.key === 'ArrowUp') return irPara('up')
        if (e.key === 'ArrowDown') return irPara('down', true)

        // Esquerda/direita só saem da célula quando o cursor já está na
        // ponta do texto — no meio de uma palavra, a seta tem que andar o
        // cursor, que é o que se espera de um campo de texto.
        const alvo = e.currentTarget
        const naPonta =
          alvo.selectionStart === alvo.selectionEnd &&
          (e.key === 'ArrowLeft'
            ? alvo.selectionStart === 0
            : alvo.selectionStart === alvo.value.length)

        if (e.key === 'ArrowLeft' && naPonta) return irPara('left')
        if (e.key === 'ArrowRight' && naPonta) return irPara('right', true)
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
  //: Onde desenhar o menu da coluna. Como ele mora num portal, precisa da
  //: posição do cabeçalho que o abriu.
  const [menuAncora, setMenuAncora] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const { ref: ajudaRef, paraCima: ajudaParaCima } = useMenuSuspenso(showHelp)
  //: Coluna inteira selecionada pelo clique no cabeçalho.
  const [selectedColumn, setSelectedColumn] = useState(null)
  /**
   * Seleção de células num ÚNICO estado.
   *
   * `blocos` são os retângulos já fechados (Ctrl+clique) e `ancora`/`ponta`
   * descrevem o que está sendo desenhado agora. Estavam em três `useState`
   * separados, e cada gesto precisava de dois ou três `set` — como o React
   * agrupa as atualizações, o segundo clique ainda lia o estado do render
   * anterior e a seleção ficava um passo atrasada. Com um objeto só, cada
   * gesto é UMA transição calculada a partir do valor anterior.
   */
  const [selecao, setSelecao] = useState({ ancora: null, ponta: null, blocos: [] })
  const arrastandoCelulas = useRef(false)
  const gradeRef = useRef(null)
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

  /**
   * Move a edição para a célula vizinha.
   *
   * `visibleRows` e não `rows`: com filtro ou ordenação ativa, a ordem da
   * tela não é a do array, e descer pelo array levaria a uma linha que o
   * usuário não está vendo.
   *
   * `criar` decide o que acontece ao bater na borda de baixo ou da
   * direita: estender a planilha, ou simplesmente parar.
   *
   * Só Enter e as setas ↓ e → pedem `criar`. O Tab não: ele anda célula a
   * célula pela planilha inteira, e criar uma coluna toda vez que ele
   * chegasse na última enchia a grade de colunas sem a pessoa notar — o
   * gesto não deixa claro quando cria e quando só move.
   */
  const navigateCell = (direction, visibleRows, criar = false) => {
    if (!editing) return
    const rowIndex = visibleRows.findIndex((r) => r.id === editing.rowId)
    const colIndex = columns.findIndex((c) => c.id === editing.colId)
    if (rowIndex === -1 || colIndex === -1) return

    let nextRow = rowIndex
    let nextCol = colIndex
    if (direction === 'up') nextRow -= 1
    else if (direction === 'down') nextRow += 1
    else if (direction === 'left') nextCol -= 1
    else if (direction === 'right') nextCol += 1

    /**
     * Move a edição E a seleção juntas.
     *
     * A seleção precisa acompanhar: ela é quem pinta o fundo da âncora
     * (`bg-accent`), e o `editing` só desenha o anel. Movendo um sem o
     * outro, a célula de onde se saiu continuava pintada — dois lugares
     * parecendo ativos ao mesmo tempo. Quando a seta criava uma linha, o
     * fundo sobrava na linha de cima.
     */
    const irPara = (rowId, colId, linha, coluna) => {
      setEditing({ rowId, colId })
      setSelecao({ ancora: { linha, coluna }, ponta: { linha, coluna }, blocos: [] })
    }

    if (criar && nextRow >= visibleRows.length) {
      const novo = { id: uid('r'), cells: {} }
      update({ rows: [...rows, novo] })
      irPara(novo.id, editing.colId, visibleRows.length, colIndex)
      return
    }

    if (criar && nextCol >= columns.length) {
      const nova = novaColuna()
      update({ columns: [...columns, nova] })
      irPara(editing.rowId, nova.id, rowIndex, columns.length)
      return
    }

    // Bater na borda não faz nada: sair da grade seria perder a edição sem
    // o usuário ter pedido.
    if (nextRow < 0 || nextCol < 0) return
    if (nextRow >= visibleRows.length || nextCol >= columns.length) return
    irPara(visibleRows[nextRow].id, columns[nextCol].id, nextRow, nextCol)
  }

  /**
   * Molde de coluna nova.
   *
   * Num lugar só porque agora nascem colunas por dois caminhos — o botão
   * "Coluna" e a seta para a direita na última célula — e duas cópias
   * divergiriam no primeiro campo que alguém acrescentasse.
   */
  const novaColuna = () => ({
    id: uid('c'),
    name: `Coluna ${columns.length + 1}`,
    type: 'text',
    width: 160,
    aggregate: 'none',
  })

  const addColumn = () => update({ columns: [...columns, novaColuna()] })

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
  /** Abre o menu da coluna ancorado no cabeçalho que foi clicado. */
  const abrirMenuColuna = (id, elemento) => {
    const caixa = elemento.getBoundingClientRect()
    setMenuAncora({ left: caixa.left, bottom: caixa.bottom })
    setMenuColumn(id)
  }

  //: Estável: o menu registra listeners de scroll/resize com ele.
  const fecharMenuColuna = useCallback(() => setMenuColumn(null), [])

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

  /* ------------------------------------------------------------------ */
  /* Seleção de células e área de transferência                         */
  /*                                                                    */
  /* Os índices são da VISÃO (`shown`), não do array cru: com filtro ou  */
  /* ordenação ativos, copiar "as três primeiras linhas" tem de copiar   */
  /* o que está na tela.                                                */
  /* ------------------------------------------------------------------ */

  const { ancora, ponta, blocos } = selecao
  const area = useMemo(() => retangulo(ancora, ponta), [ancora, ponta])
  //: Tudo que está selecionado: os blocos fechados mais o atual.
  const areas = useMemo(
    () => (area ? [...blocos, area] : blocos),
    [blocos, area],
  )

  const iniciarSelecao = (linha, coluna, event) => {
    // preventDefault SEMPRE, antes de qualquer ramo: sem isso o navegador
    // começa a seleção de TEXTO da página. Com Shift ele estende essa
    // seleção nativa até o clique — era o "shift+clique pinta a página
    // inteira de azul". Vale também para o arraste comum, que senão
    // seleciona o texto das células por onde passa.
    event.preventDefault()
    // Sem o foco na grade, Ctrl+C/V e as setas iriam para o documento.
    gradeRef.current?.focus({ preventScroll: true })

    const estende = event.shiftKey
    const soma = event.ctrlKey || event.metaKey
    const alvo = { linha, coluna }

    setSelecao((antes) => {
      // Shift ESTENDE o bloco atual, mantendo a âncora onde estava.
      if (estende && antes.ancora) {
        return { ...antes, ponta: alvo }
      }
      // Ctrl FECHA o bloco atual e começa outro, somando à seleção.
      if (soma) {
        const atual = retangulo(antes.ancora, antes.ponta)
        return {
          ancora: alvo,
          ponta: alvo,
          blocos: atual ? [...antes.blocos, atual] : antes.blocos,
        }
      }
      // Clique normal recomeça do zero.
      return { ancora: alvo, ponta: alvo, blocos: [] }
    })

    setSelectedColumn(null)
    arrastandoCelulas.current = true
  }

  const estenderSelecao = (linha, coluna, event) => {
    // Só estende com o botão esquerdo AINDA apertado. `event.buttons` é a
    // verdade do momento; a flag sozinha não bastava, porque um `pointerup`
    // perdido (solto fora da janela) a deixava ligada e a seleção passava
    // a seguir o mouse solto.
    if (!arrastandoCelulas.current || !(event?.buttons & 1)) return
    setSelecao((antes) => ({ ...antes, ponta: { linha, coluna } }))
  }

  // O ponteiro costuma ser solto fora da célula (ou fora da tabela), então
  // quem encerra o arraste é a janela.
  useEffect(() => {
    const soltar = () => {
      arrastandoCelulas.current = false
    }
    window.addEventListener('pointerup', soltar)
    return () => window.removeEventListener('pointerup', soltar)
  }, [])

  /** Linhas da visão de volta para o array real, preservando a ordem crua. */
  const gravarLinhasVisiveis = (linhasDaVisao) => {
    const porId = new Map(linhasDaVisao.map((r) => [r.id, r]))
    update({ rows: rows.map((r) => porId.get(r.id) ?? r) })
  }

  const copiarSelecao = (event) => {
    if (!area) return
    // Com blocos soltos, copia a caixa que envolve todos: TSV não sabe
    // representar buracos, e é o que o Excel também faz.
    const texto = paraTSV(uniao(areas), shown, columns)
    if (event?.clipboardData) {
      event.clipboardData.setData('text/plain', texto)
      event.preventDefault()
    } else {
      copiarTexto(texto)
    }
  }

  const recortarSelecao = (event) => {
    if (!area) return
    copiarSelecao(event)
    // Recortar respeita os buracos: some só o que está marcado.
    let linhas = shown
    for (const bloco of areas) linhas = limpar(bloco, linhas, columns)
    gravarLinhasVisiveis(linhas)
  }

  const colarNaSelecao = (event) => {
    if (!area) return
    const texto = event?.clipboardData?.getData('text/plain')
    if (!texto) return
    event.preventDefault()
    const matriz = deTSV(texto)
    gravarLinhasVisiveis(
      colar(matriz, shown, columns, {
        linha: area.linhaInicio,
        coluna: area.colunaInicio,
      }),
    )
    // A seleção passa a cobrir o que foi colado, como no Excel.
    setSelecao((antes) => ({
      ...antes,
      ponta: {
        linha: Math.min(area.linhaInicio + matriz.length - 1, shown.length - 1),
        coluna: Math.min(
          area.colunaInicio + Math.max(...matriz.map((l) => l.length)) - 1,
          columns.length - 1,
        ),
      },
    }))
  }

  const teclasDaGrade = (event) => {
    // Enquanto edita, o input manda: Ctrl+C ali copia texto, não células.
    // E o Enter/Tab/Seta que navegam entre células já são tratados lá
    // dentro — deixar chegar aqui faria a grade processar o mesmo
    // keypress duas vezes (o CellInput faz onCommit e a grade também).
    if (editing) return
    if (!area) return

    const mod = event.ctrlKey || event.metaKey

    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelecao({
        ancora: { linha: 0, coluna: 0 },
        ponta: { linha: shown.length - 1, coluna: columns.length - 1 },
        blocos: [],
      })
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      let linhas = shown
      for (const bloco of areas) linhas = limpar(bloco, linhas, columns)
      gravarLinhasVisiveis(linhas)
      return
    }

    if (event.key === 'Escape') {
      setSelecao((antes) => ({ ...antes, ponta: antes.ancora, blocos: [] }))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const linha = shown[area.linhaInicio]
      const coluna = columns[area.colunaInicio]
      if (linha && coluna) setEditing({ rowId: linha.id, colId: coluna.id })
      return
    }

    const passos = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const passo = passos[event.key]
    if (!passo) {
      // Digitar com a célula selecionada entra na edição, como em
      // qualquer planilha. Sem isso, perder o clique-simples-edita
      // deixaria a grade muda ao teclado.
      if (!mod && event.key.length === 1) {
        const linha = shown[area.linhaInicio]
        const coluna = columns[area.colunaInicio]
        if (linha && coluna) {
          setCell(linha.id, coluna.id, event.key)
          setEditing({ rowId: linha.id, colId: coluna.id })
          event.preventDefault()
        }
      }
      return
    }

    event.preventDefault()
    const base = event.shiftKey ? (ponta ?? ancora) : ancora
    const linha = Math.min(Math.max(base.linha + passo[0], 0), shown.length - 1)
    const coluna = Math.min(Math.max(base.coluna + passo[1], 0), columns.length - 1)
    const alvo = { linha, coluna }
    // Shift+seta ESTENDE; seta sozinha move a seleção inteira.
    setSelecao((antes) =>
      event.shiftKey
        ? { ...antes, ponta: alvo }
        : { ancora: alvo, ponta: alvo, blocos: [] },
    )
  }

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
              <div
                ref={ajudaRef}
                className={cn(
                  'absolute right-0 z-30 max-h-72 w-72 overflow-y-auto rounded-md border border-ink-200 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-900',
                  ajudaParaCima ? 'bottom-full mb-1' : 'top-full mt-1',
                )}
              >
                <p className="px-1 pb-1.5 secao">
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
      <div
        ref={gradeRef}
        // `tabIndex` para a grade receber teclado sem depender de um input
        // focado — é assim que Ctrl+C/V e as setas funcionam sem editar.
        tabIndex={0}
        onKeyDown={teclasDaGrade}
        onCopy={copiarSelecao}
        onCut={recortarSelecao}
        onPaste={colarNaSelecao}
        // `select-none` é o que REALMENTE impede o navegador de selecionar
        // o texto das células ao arrastar. `preventDefault` no pointerdown
        // não faz isso: o arrasto de texto nasce de outro caminho interno
        // do navegador. É a mesma proteção que o quadro usa.
        //
        // A edição acontece dentro de <input>, que ignora `user-select`
        // do pai — copiar e selecionar texto ali continua funcionando.
        className="min-h-0 flex-1 select-none overflow-auto focus:outline-none"
      >
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
                      onDoubleClick={(e) => abrirMenuColuna(column.id, e.currentTarget)}
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
                      onClick={(e) =>
                        menuColumn === column.id
                          ? setMenuColumn(null)
                          : abrirMenuColuna(column.id, e.currentTarget)
                      }
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
                      ancora={menuAncora}
                      onUpdate={(patch) => updateColumn(column.id, patch)}
                      onDelete={() => deleteColumn(column.id)}
                      onClear={() => clearColumn(column)}
                      onAutoFit={() => autoFitColumn(column)}
                      onSort={(direction) => update({ sort: { column: column.id, direction } })}
                      onClose={fecharMenuColuna}
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
            {shown.map((row, linhaIndex) => {
              // O número visível é a posição REAL da linha: é ela que a
              // fórmula endereça, mesmo com a tabela ordenada ou filtrada.
              const realIndex = rows.findIndex((r) => r.id === row.id)
              return (
                <tr key={row.id}>
                  {/* `group` VIVE AQUI, no td do número — e não no tr
                      inteiro. Se ficasse no tr, `group-hover` ativaria
                      quando o mouse passasse por QUALQUER célula da linha,
                      fazendo o número virar lixeira em toda a faixa. */}
                  <td className="group sticky left-0 z-10 border-b border-r border-ink-200 bg-white px-1 text-center text-[11px] tabular-nums text-ink-400 dark:border-ink-700 dark:bg-ink-950">
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

                    const selecionada = dentroDeAlguma(areas, linhaIndex, colIndex)
                    const bordas = bordasDaSelecao(areas, linhaIndex, colIndex)
                    const ehAncora =
                      ancora?.linha === linhaIndex && ancora?.coluna === colIndex
                    // Contorno grosso na divisa do bloco; fio fino nas
                    // divisas internas, que é o que dá a leitura de
                    // "várias células escolhidas juntas".
                    const contorno = selecionada
                      ? [
                          contornoDaSelecao(bordas, 'rgb(var(--accent-500))', 2),
                          contornoDaSelecao(
                            {
                              topo: !bordas.topo,
                              base: !bordas.base,
                              esquerda: !bordas.esquerda,
                              direita: !bordas.direita,
                            },
                            'rgb(var(--accent-400) / 0.45)',
                            1,
                          ),
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : undefined

                    if (column.type === 'checkbox') {
                      return (
                        <td
                          key={column.id}
                          style={{ ...sticky, boxShadow: contorno }}
                          // A coluna de caixa de seleção participa da
                          // seleção como qualquer outra. Sem estes
                          // handlers ela era um buraco morto no meio da
                          // grade: arrastar por cima dela parava a
                          // seleção — e a planilha PADRÃO do app tem uma.
                          onPointerDown={(e) => {
                            if (e.button !== 0) return
                            iniciarSelecao(linhaIndex, colIndex, e)
                          }}
                          onPointerEnter={(e) => estenderSelecao(linhaIndex, colIndex, e)}
                          className={cn(
                            'h-8 border-b border-r border-ink-200 bg-white text-center dark:border-ink-700 dark:bg-ink-950',
                            // Sem preenchimento: quem marca a seleção é o
                            // contorno (`boxShadow`), igual às demais.
                            ehAncora && 'bg-accent-50/60 dark:bg-accent-500/10',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(raw)}
                            onChange={(e) => setCell(row.id, column.id, e.target.checked)}
                            // O clique na caixa marca a caixa e NÃO deve
                            // virar início de arrasto de seleção.
                            onPointerDown={(e) => e.stopPropagation()}
                            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
                          />
                        </td>
                      )
                    }

                    return (
                      <td
                        key={column.id}
                        style={{ ...sticky, boxShadow: isEditing ? undefined : contorno }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return
                          iniciarSelecao(linhaIndex, colIndex, e)
                        }}
                        onPointerEnter={(e) => estenderSelecao(linhaIndex, colIndex, e)}
                        onDoubleClick={() => setEditing({ rowId: row.id, colId: column.id })}
                        className={cn(
                          'relative h-8 cursor-cell border-b border-r border-ink-200 dark:border-ink-700',
                          // UM fundo só: `bg-white` e `bg-accent-*` são a
                          // MESMA propriedade CSS, e deixar as duas na
                          // classe fazia a ordem da folha decidir qual
                          // vence. A seleção NÃO pinta o fundo — ela é só
                          // contorno, para não esconder o conteúdo.
                          error
                            ? 'bg-red-50 dark:bg-red-500/10'
                            : selectedColumn === column.id
                              ? 'bg-accent-50 dark:bg-accent-500/10'
                              : 'bg-white dark:bg-ink-950',
                          isEditing && 'ring-1 ring-inset ring-accent-500',
                          // A âncora ganha um leve peso de fundo para se
                          // distinguir do resto do bloco.
                          ehAncora && !isEditing && 'bg-accent-50/60 dark:bg-accent-500/10',
                        )}
                      >
                        {isEditing ? (
                          <CellInput
                            column={column}
                            value={raw}
                            onCommit={(value, direcao, criar) => {
                              setCell(row.id, column.id, value)
                              if (direcao) navigateCell(direcao, shown, criar)
                              else if (column.type !== 'multiselect') setEditing(null)
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <div
                            // pointer-events-none: o clique tem de chegar
                            // ao `<td>` (que tem onPointerDown para
                            // seleção). Sem isso o `<div>` captura o
                            // pointer e a grade nunca sabe que o usuário
                            // clicou — select/shift/drag morrem aqui.
                            //
                            // Duplo clique continua funcionando porque o
                            // browser propaga dblclick para cima.
                            style={{ pointerEvents: 'none' }}
                            title={error || undefined}
                            className={cn(
                              // `h-full`, não `h-8`: com altura fixa igual
                              // à do `td` o conteúdo estourava a célula por
                              // causa da borda, e sobrava uma faixa pintada
                              // encostando na linha de cima.
                              'flex h-full items-center truncate px-2',
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
                          <span className="mr-1 secao">
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

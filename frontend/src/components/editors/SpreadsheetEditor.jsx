import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Eraser,
  Filter,
  MoveHorizontal,
  Plus,
  Scissors,
  Sigma,
  Trash2,
  X,
} from 'lucide-react'
import {
  AGGREGATE_LABELS,
  FILTER_OPERATORS,
  aggregate,
  ajustarAoExcluir,
  ajustarAoInserir,
  ajustarAoMover,
  celulaComFormula,
  columnLetter,
  comparableValue,
  deslocarFormula,
  displayValue,
  enderecoDe,
  funcaoPorNome,
  numeroOuNulo,
  referenciasDaFormula,
  reescreverFormulas,
  visibleRows,
} from '@/lib/formula'
import { atalhoDe } from '@/lib/history'
import { avisarErro } from '@/lib/avisoFlutuante'
import { copiarTexto } from '@/lib/desktop'
import { cn, uid } from '@/lib/utils'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { BarraDeFormula, CampoDeFormula } from './BarraDeFormula'
import BarraDaPlanilha, { formatosPara } from './BarraDaPlanilha'
import {
  bordasDaSelecao,
  colar,
  dentro,
  dentroDeAlguma,
  deTSV,
  estilizar,
  limpar,
  paraTSV,
  preencher,
  retangulo,
  transbordos,
  uniao,
} from '@/lib/celulas'
import { idioma, t } from '@/lib/i18n'

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
 *
 * Os formatos de coluna (`COLUMN_TYPES`) moram na barra de funções, que é
 * onde se escolhe o formato; o menu da coluna usa a mesma lista.
 */

const NUMERIC_TYPES = ['number', 'currency', 'percent', 'rating', 'formula']

/** Tipos que editam num controle próprio (lista, estrelas, calendário) em vez de texto. */
const TIPOS_COM_CONTROLE = ['select', 'multiselect', 'rating', 'date', 'datetime']

/** Tipos que a barra de fórmula só mostra: não há texto para escrever neles. */
const TIPOS_SEM_TEXTO = ['checkbox', 'multiselect', 'rating']

/**
 * Cores das referências enquanto a fórmula é escrita: a primeira citada é
 * azul, a segunda vermelha... como no Excel — a cor liga o pedaço da
 * fórmula à célula da grade.
 */
const CORES_DE_REFERENCIA = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2']

/** Depois destes caracteres, clicar numa célula CITA a célula na fórmula, em vez de sair da edição. */
const ANTES_DE_REFERENCIA = /[=(;,+\-*/^&<>:]$/

const vazia = (v) => v === undefined || v === null || v === ''

/** O conteúdo da célula como texto editável. */
function textoDaCelula(raw) {
  if (vazia(raw)) return ''
  if (Array.isArray(raw)) return raw.join(', ')
  if (typeof raw === 'boolean') return raw ? t('VERDADEIRO') : t('FALSO')
  return String(raw)
}

/**
 * Molde de coluna nova.
 *
 * Num lugar só porque nascem colunas por vários caminhos — o botão, o menu
 * de célula e a seta para a direita na última célula — e cópias
 * divergiriam no primeiro campo que alguém acrescentasse.
 */
const novaColuna = (n) => ({
  id: uid('c'),
  name: t('Coluna {n}', { n }),
  type: 'text',
  width: 160,
  aggregate: 'none',
})

//: Coluna dos números de linha: cabe o número e a lixeira ao lado.
const LARGURA_DO_NUMERO = 44
//: Coluna do "+" que cria coluna nova, no fim do cabeçalho.
const LARGURA_DO_MAIS = 32

const formatoDoResumo = () => new Intl.NumberFormat(idioma, { maximumFractionDigits: 4 })

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
  // Esc fecha também, como todo menu do app.
  useEffect(() => {
    const fechar = () => onClose()
    const tecla = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
      window.removeEventListener('keydown', tecla)
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
        <label className="label">{t('Nome')}</label>
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

        <label className="label mt-3">{t('Tipo')}</label>
        <select
          value={column.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="input h-8 cursor-pointer py-0 text-sm"
        >
          {formatosPara(column.type).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {(column.type === 'select' || column.type === 'multiselect') && (
          <>
            <label className="label mt-3">{t('Opções (uma por linha)')}</label>
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
            <label className="label mt-3">{t('Moeda')}</label>
            <select
              value={column.currency ?? 'BRL'}
              onChange={(e) => onUpdate({ currency: e.target.value })}
              className="input h-8 cursor-pointer py-0 text-sm"
            >
              <option value="BRL">{t('Real (R$)')}</option>
              <option value="USD">{t('Dólar (US$)')}</option>
              <option value="EUR">{t('Euro (€)')}</option>
            </select>
          </>
        )}

        {numeric && column.type !== 'rating' && (
          <>
            <label className="label mt-3">{t('Casas decimais')}</label>
            <input
              type="number"
              min={0}
              max={6}
              value={column.decimals ?? ''}
              placeholder={t('automático')}
              onChange={(e) =>
                onUpdate({ decimals: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="input h-8 py-0 text-sm"
            />
          </>
        )}

        <label className="label mt-3">{t('Resumo no rodapé')}</label>
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
            {t('Escreva a fórmula em cada célula. Ex.:')}{' '}
            <code className="font-mono">{t('=SOMA(A1:A5)')}</code> {t('ou')}{' '}
            <code className="font-mono">{t('=SE(B2>7; "ok"; "revisar")')}</code>
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
              ? t('Ordenar Z → A')
              : t('Ordenar A → Z')}
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
            {t('Ajustar largura ao conteúdo')}
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
            {t('Limpar valores da coluna')}
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
            {t('Excluir coluna')} {columnLetter(index)}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

/* -------------------------------------------------------------------- */
/* Edição com controle próprio (lista, estrelas, calendário)            */
/*                                                                      */
/* Texto, número e fórmula editam no `CampoDeFormula`, controlado pela  */
/* planilha. Estes tipos têm um controle que não é texto e guardam o    */
/* próprio rascunho; `onCommit(valor, { direcao, criar, blur })`.       */
/* -------------------------------------------------------------------- */

function CellInput({ column, value, onCommit, onCancel }) {
  const [draft, setDraft] = useState(value ?? '')

  if (column.type === 'select') {
    return (
      <select
        autoFocus
        value={draft}
        onChange={(e) => onCommit(e.target.value)}
        onBlur={() => onCancel(false)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel(true)}
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
                  { manter: true },
                )
              }
              className="rounded border-ink-300 text-accent-600"
            />
            {option}
          </label>
        ))}
        <button
          type="button"
          onClick={() => onCancel(true)}
          className="mt-1 w-full rounded px-2 py-1 text-xs text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
        >
          {t('Fechar')}
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
            type="button"
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

  // Data e data e hora: o calendário do navegador.
  return (
    <input
      autoFocus
      type={column.type === 'date' ? 'date' : 'datetime-local'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft, { blur: true })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel(true)
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(draft, { direcao: e.shiftKey ? 'up' : 'down', criar: !e.shiftKey })
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          onCommit(draft, { direcao: e.shiftKey ? 'left' : 'right' })
        }
      }}
      className="h-full w-full border-0 bg-transparent px-2 text-sm focus:outline-none"
    />
  )
}

/* -------------------------------------------------------------------- */
/* Barra de filtros                                                     */
/* -------------------------------------------------------------------- */

function FilterBar({ data, onChange, visiveis }) {
  const columns = data?.columns ?? []
  const filters = data?.filters ?? []
  const total = data?.rows?.length ?? 0

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
                placeholder={t('valor')}
                className="w-24 border-0 bg-transparent px-1 text-xs focus:ring-0"
              />
            )}
            <button
              onClick={() => onChange({ filters: filters.filter((_, i) => i !== index) })}
              aria-label={t('Remover filtro')}
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
        <Filter size={12} /> {t('Filtro')}
      </button>
      {filters.length > 0 && (
        <button
          onClick={() => onChange({ filters: [] })}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <X size={12} /> {t('Limpar todos')}
        </button>
      )}
      {/* Quantas linhas o filtro deixa à vista: é aqui que essa conta importa. */}
      <span className="ml-auto text-[11px] tabular-nums text-ink-400">
        {t('{shown} de {total} linha(s)', { shown: visiveis, total })}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------- */
/* Editor                                                               */
/* -------------------------------------------------------------------- */

//: Medidas de texto para o transbordo: o canvas mede sem tocar no layout.
const medidas = new Map()
let pincel = null
function larguraDoTexto(texto, negrito, fonte) {
  const chave = `${negrito ? 1 : 0}${fonte}|${texto}`
  if (!medidas.has(chave)) {
    pincel ??= document.createElement('canvas').getContext('2d')
    pincel.font = `${negrito ? 600 : 400} 14px ${fonte}`
    // ponytail: cache sem limite por sessão; vira LRU se planilhas enormes pesarem.
    medidas.set(chave, pincel.measureText(texto).width)
  }
  return medidas.get(chave)
}

/** O estilo da célula como CSS do texto. Com fundo, a letra fica escura nos dois temas. */
function cssDoTexto(estilo) {
  if (!estilo) return undefined
  const traco = [estilo.underline && 'underline', estilo.strike && 'line-through'].filter(Boolean).join(' ')
  return {
    fontWeight: estilo.bold ? 600 : undefined,
    fontStyle: estilo.italic ? 'italic' : undefined,
    textDecorationLine: traco || undefined,
    color: estilo.color ?? (estilo.fill ? '#1a1816' : undefined),
  }
}

const JUSTIFICAR = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }

export default function SpreadsheetEditor({
  data,
  onChange,
  onCommit,
  onUndo,
  onRedo,
  somenteLeitura = false,
  itensDoMenu = [],
  cabecalho = null,
  rodape = null,
}) {
  const columns = data?.columns ?? []
  const rows = data?.rows ?? []
  const sort = data?.sort ?? null
  const frozen = data?.frozen_columns ?? 0
  const filtros = data?.filters ?? []

  const raizRef = useRef(null)
  const gradeRef = useRef(null)
  //: O campo da célula em edição e o da barra de fórmula. Clicar numa
  //: célula enquanto escreve uma fórmula insere a referência no que estiver
  //: em uso.
  const celulaInputRef = useRef(null)
  const barraInputRef = useRef(null)

  /**
   * A edição em andamento: `{ rowId, colId, rascunho, origem, controle }`.
   *
   * O rascunho mora AQUI, e não dentro do campo: a barra de fórmula mostra
   * o mesmo texto enquanto se digita na célula, as referências da fórmula
   * pintam a grade, e clicar numa célula insere o endereço dela no texto.
   * `controle` marca os tipos com controle próprio (lista, calendário),
   * que guardam o rascunho sozinhos.
   *
   * Espelhado numa ref porque o `blur` que encerra a edição chega no meio
   * de outros eventos, antes de o React redesenhar.
   */
  const [editing, setEditing] = useState(null)
  const editingRef = useRef(null)
  editingRef.current = editing

  const [menuColumn, setMenuColumn] = useState(null)
  //: Onde desenhar o menu da coluna. Como ele mora num portal, precisa da
  //: posição do cabeçalho que o abriu.
  const [menuAncora, setMenuAncora] = useState(null)
  /**
   * Seleção de células num ÚNICO estado.
   *
   * `blocos` são os retângulos já fechados (Ctrl+clique) e `ancora`/`ponta`
   * descrevem o que está sendo desenhado agora. Estavam em três `useState`
   * separados, e cada gesto precisava de dois ou três `set` — como o React
   * agrupa as atualizações, o segundo clique ainda lia o estado do render
   * anterior e a seleção ficava um passo atrasada. Com um objeto só, cada
   * gesto é UMA transição calculada a partir do valor anterior.
   *
   * Começa no A1, como no Excel: sempre há uma célula ativa, e a barra de
   * funções tem sobre o que agir desde a abertura.
   */
  const [selecao, setSelecao] = useState(() => {
    const a1 = rows.length && columns.length ? { linha: 0, coluna: 0 } : null
    return { ancora: a1, ponta: a1, blocos: [] }
  })
  const arrastandoCelulas = useRef(false)
  //: Célula que já estava marcada quando o dedo desceu (ver o `onClick`).
  const celulaJaMarcada = useRef(null)
  //: Arraste da divisória do cabeçalho para mudar a largura.
  const [resizing, setResizing] = useState(null)
  //: Reordenação de coluna arrastando o próprio cabeçalho.
  const [dragColumn, setDragColumn] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)
  //: Arraste da alça de preenchimento: `{ origem, alvo }`, em posições da tela.
  const [preenchimento, setPreenchimento] = useState(null)
  const preenchimentoRef = useRef(null)
  preenchimentoRef.current = preenchimento
  //: Última referência inserida por clique na fórmula: o próximo clique a
  //: TROCA em vez de acrescentar outra, como no Excel.
  const refPendente = useRef(null)
  //: Arraste que estende a referência citada num intervalo (A1:A5).
  const apontando = useRef(null)
  //: O que esta planilha copiou por último — para colar ajustando as fórmulas.
  const copiaRef = useRef(null)
  //: Coluna onde começou uma sequência de Tab: o Enter volta para ela.
  const retornoDoTab = useRef(null)
  //: A seleção andou pelo teclado e precisa aparecer na tela.
  const rolarAteSelecao = useRef(false)
  const { menu, openMenu, closeMenu } = useContextMenu()
  //: A fonte do app (Aparência), para medir o texto que transborda.
  const fonteDaGrade = useMemo(() => getComputedStyle(document.body).fontFamily, [])

  /**
   * A versão mais nova do payload, mesmo antes de o React redesenhar.
   *
   * Um gesto que mudava duas coisas (gravar a célula E criar a linha nova
   * com o Enter na última linha) chamava `update` duas vezes a partir do
   * MESMO `data` antigo, e a segunda apagava a primeira: o valor digitado
   * sumia. Cada `update` agora parte do que o anterior deixou.
   */
  const dadosRef = useRef(data)
  dadosRef.current = data
  const atual = () => dadosRef.current ?? {}

  const update = (patch, { historico = true } = {}) => {
    if (somenteLeitura) return
    const next = { ...atual(), ...patch }
    dadosRef.current = next
    onChange(next)
    // Cada gesto vira um passo do desfazer; o arraste de largura só no fim.
    if (historico) onCommit?.(next)
  }

  // Ordenar e filtrar são VISÃO: o array de linhas não muda de ordem, senão
  // as referências das fórmulas (A1, A2...) apontariam para outras células.
  const shown = useMemo(() => visibleRows(data), [data])
  //: Posição gravada de cada linha — é ela que a fórmula endereça.
  const posicaoReal = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows])
  const real = (linha) => posicaoReal.get(shown[linha]?.id) ?? -1
  const linhaDaVisao = (rowId) => shown.findIndex((r) => r.id === rowId)

  const summaries = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, aggregate(c, shown, columns, rows)])),
    [columns, shown, rows],
  )
  const hasSummary = Object.values(summaries).some(Boolean)

  const { ancora, ponta, blocos } = selecao
  const area = useMemo(() => retangulo(ancora, ponta), [ancora, ponta])
  //: Tudo que está selecionado: os blocos fechados mais o atual.
  const areas = useMemo(() => (area ? [...blocos, area] : blocos), [blocos, area])

  // Síncrono, e não num `requestAnimationFrame`: o campo da célula ainda
  // está montado aqui, e o `blur` que isto provoca encontra a edição já
  // encerrada (`editingRef` nulo) — não grava duas vezes.
  const focarGrade = () => gradeRef.current?.focus({ preventScroll: true })

  //: Cursor pedido para o campo em uso, aplicado DEPOIS de o React escrever
  //: o texto novo nele (ver o `useLayoutEffect` abaixo).
  const cursorPedido = useRef(null)
  useLayoutEffect(() => {
    const posicao = cursorPedido.current
    if (posicao === null) return
    const campo = (editingRef.current?.origem === 'barra' ? barraInputRef : celulaInputRef).current
    if (!campo) return
    cursorPedido.current = null
    campo.focus()
    campo.setSelectionRange(posicao, posicao)
  })

  const selecionarCelula = (linha, coluna) => {
    setSelecao({ ancora: { linha, coluna }, ponta: { linha, coluna }, blocos: [] })
    rolarAteSelecao.current = true
  }

  /* ------------------------------------------------------------------ */
  /* Edição                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Abre a edição de uma célula.
   *
   * `rascunho` vem quando a edição começou por uma tecla: o que se digita
   * SUBSTITUI o conteúdo, como em toda planilha, mas nada é gravado antes
   * do Enter — o Esc devolve o valor que estava ali. Antes a primeira tecla
   * ia direto para a célula, e o Esc deixava ela lá.
   */
  const comecarEdicao = (linha, coluna, { rascunho, origem = 'celula' } = {}) => {
    if (somenteLeitura) return
    const row = shown[linha]
    const column = columns[coluna]
    if (!row || !column || column.type === 'checkbox') return
    const texto = rascunho ?? textoDaCelula(row.cells?.[column.id])
    const controle =
      origem === 'celula' && TIPOS_COM_CONTROLE.includes(column.type) && !String(texto).startsWith('=')
    const novo = {
      rowId: row.id,
      colId: column.id,
      rascunho: controle ? row.cells?.[column.id] : texto,
      origem,
      controle,
    }
    editingRef.current = novo
    setEditing(novo)
    setSelecao({ ancora: { linha, coluna }, ponta: { linha, coluna }, blocos: [] })
    refPendente.current = null
  }

  const mudarRascunho = (valor) => {
    if (!editingRef.current) return
    const novo = { ...editingRef.current, rascunho: valor }
    editingRef.current = novo
    setEditing(novo)
    refPendente.current = null
  }

  const cancelar = ({ focar = true } = {}) => {
    editingRef.current = null
    setEditing(null)
    refPendente.current = null
    if (focar) focarGrade()
  }

  /**
   * Grava a edição e, se pedido, anda para a vizinha — num `update` só.
   *
   * `criar` decide o que acontece ao bater na borda de baixo ou da
   * direita: estender a planilha, ou simplesmente parar. Só Enter e as
   * setas ↓ e → pedem: o Tab anda célula a célula pela planilha inteira,
   * e criar uma coluna toda vez que ele chegasse na última enchia a grade
   * de colunas sem a pessoa notar.
   *
   * Depois de gravar, a SELEÇÃO anda e a edição termina, como no Google
   * Planilhas: digitar na célula seguinte começa outra edição, e Enter ou
   * F2 edita o que já está nela.
   */
  const confirmar = ({ valor, direcao = null, criar = false, porTab = false, porEnter = false, focar = true, manter = false } = {}) => {
    const ed = editingRef.current
    if (!ed) return
    const dados = atual()
    let linhas = dados.rows ?? []
    let colunas = dados.columns ?? []
    const novoValor = valor !== undefined ? valor : ed.rascunho
    let mudou = false

    const linhaGravada = linhas.find((r) => r.id === ed.rowId)
    const anterior = linhaGravada?.cells?.[ed.colId]
    if (linhaGravada && novoValor !== anterior && !(vazia(anterior) && vazia(novoValor))) {
      linhas = linhas.map((r) => (r.id === ed.rowId ? { ...r, cells: { ...r.cells, [ed.colId]: novoValor } } : r))
      mudou = true
    }

    // Seleção múltipla grava a cada marcação e continua aberta.
    if (manter) {
      if (mudou) update({ rows: linhas })
      return
    }

    editingRef.current = null
    setEditing(null)
    refPendente.current = null

    const linhaAtual = linhaDaVisao(ed.rowId)
    const colunaAtual = colunas.findIndex((c) => c.id === ed.colId)
    let destino = { linha: linhaAtual, coluna: colunaAtual }

    if (direcao) {
      // Tab, Tab, Tab, Enter: volta para a coluna onde os Tabs começaram,
      // uma linha abaixo — o jeito de preencher uma tabela linha a linha.
      if (porTab && direcao === 'right' && retornoDoTab.current === null) retornoDoTab.current = colunaAtual
      let l = linhaAtual + (direcao === 'down' ? 1 : direcao === 'up' ? -1 : 0)
      let c = colunaAtual + (direcao === 'right' ? 1 : direcao === 'left' ? -1 : 0)
      if (porEnter && direcao === 'down' && retornoDoTab.current !== null) c = retornoDoTab.current
      if (!porTab) retornoDoTab.current = null

      let linhasNaTela = shown.length
      if (l >= linhasNaTela && criar) {
        linhas = [...linhas, { id: uid('r'), cells: {} }]
        mudou = true
        linhasNaTela += 1
        l = shown.length
      }
      if (c >= colunas.length && criar) {
        colunas = [...colunas, novaColuna(colunas.length + 1)]
        mudou = true
        c = colunas.length - 1
      }
      // Bater na borda não faz nada: sair da grade não é um destino.
      if (l >= 0 && l < linhasNaTela && c >= 0 && c < colunas.length) destino = { linha: l, coluna: c }
    }

    if (mudou) update(colunas === dados.columns ? { rows: linhas } : { rows: linhas, columns: colunas })
    selecionarCelula(destino.linha, destino.coluna)
    if (focar) focarGrade()
  }

  /** Teclas do campo de texto da célula. */
  const teclasDoEditor = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmar({ direcao: e.shiftKey ? 'up' : 'down', criar: !e.shiftKey, porEnter: true })
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      confirmar({ direcao: e.shiftKey ? 'left' : 'right', porTab: true })
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      confirmar({ direcao: e.key === 'ArrowUp' ? 'up' : 'down', criar: e.key === 'ArrowDown' })
      return
    }
    // Esquerda/direita só saem da célula quando o cursor já está na ponta
    // do texto — no meio de uma palavra, a seta tem que andar o cursor.
    const alvo = e.currentTarget
    const naPonta =
      alvo.selectionStart === alvo.selectionEnd &&
      (e.key === 'ArrowLeft' ? alvo.selectionStart === 0 : alvo.selectionStart === alvo.value.length)
    if (e.key === 'ArrowLeft' && naPonta) {
      e.preventDefault()
      confirmar({ direcao: 'left' })
    }
    if (e.key === 'ArrowRight' && naPonta) {
      e.preventDefault()
      confirmar({ direcao: 'right', criar: true })
    }
  }

  /** Teclas da barra de fórmula: lá as setas andam o cursor do texto. */
  const teclasDaBarra = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmar({ direcao: e.shiftKey ? 'up' : 'down', criar: !e.shiftKey, porEnter: true })
    } else if (e.key === 'Tab') {
      e.preventDefault()
      confirmar({ direcao: e.shiftKey ? 'left' : 'right', porTab: true })
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
    }
  }

  /* ------------------------------------------------------------------ */
  /* Citar células com o mouse enquanto se escreve a fórmula            */
  /* ------------------------------------------------------------------ */

  const campoEmUso = () =>
    (editingRef.current?.origem === 'barra' ? barraInputRef : celulaInputRef).current

  /** A fórmula está num ponto que pede uma referência (logo depois de `=`, `+`, `(`...)? */
  const podeCitar = () => {
    const ed = editingRef.current
    if (!ed || ed.controle) return false
    const column = columns.find((c) => c.id === ed.colId)
    const texto = String(ed.rascunho ?? '')
    if (!texto.startsWith('=') && column?.type !== 'formula') return false
    const campo = campoEmUso()
    if (!campo) return false
    const cursor = campo.selectionStart ?? texto.length
    if (refPendente.current?.fim === cursor) return true
    const antes = texto.slice(0, cursor).trimEnd()
    return antes === '' ? column?.type === 'formula' : ANTES_DE_REFERENCIA.test(antes)
  }

  /** Escreve no cursor o endereço da célula (ou do intervalo) apontado. */
  const citar = (inicio, fim, substituir = false) => {
    const ed = editingRef.current
    const campo = campoEmUso()
    if (!ed || !campo) return
    const texto = String(ed.rascunho ?? '')
    const [la, lb] = [real(inicio.linha), real(fim.linha)]
    const mesmo = inicio.linha === fim.linha && inicio.coluna === fim.coluna
    const endereco = mesmo
      ? enderecoDe(inicio.coluna, la)
      : `${enderecoDe(Math.min(inicio.coluna, fim.coluna), Math.min(la, lb))}:${enderecoDe(Math.max(inicio.coluna, fim.coluna), Math.max(la, lb))}`
    const cursor = campo.selectionStart ?? texto.length
    const pendente = refPendente.current
    const [de, ate] =
      pendente && (substituir || pendente.fim === cursor) ? [pendente.inicio, pendente.fim] : [cursor, campo.selectionEnd ?? cursor]
    const novoTexto = `${texto.slice(0, de)}${endereco}${texto.slice(ate)}`
    const fimNovo = de + endereco.length
    const novo = { ...ed, rascunho: novoTexto }
    editingRef.current = novo
    setEditing(novo)
    refPendente.current = { inicio: de, fim: fimNovo, ancora: inicio }
    cursorPedido.current = fimNovo
  }

  //: Referências da fórmula em edição, cada uma com a sua cor.
  const formulaEmEdicao = (() => {
    if (!editing || editing.controle) return null
    const texto = String(editing.rascunho ?? '')
    const column = columns.find((c) => c.id === editing.colId)
    if (texto.startsWith('=')) return texto
    return column?.type === 'formula' && texto ? `=${texto}` : null
  })()
  const referencias = useMemo(
    () =>
      referenciasDaFormula(formulaEmEdicao ?? '').map((r, i) => ({
        ...r,
        cor: CORES_DE_REFERENCIA[i % CORES_DE_REFERENCIA.length],
      })),
    [formulaEmEdicao],
  )
  const naReferencia = (ref, linha, coluna) => {
    const r = real(linha)
    return r !== -1 && coluna >= ref.colunaInicio && coluna <= ref.colunaFim && r >= ref.linhaInicio && r <= ref.linhaFim
  }

  /* ------------------------------------------------------------------ */
  /* Mudanças de forma: linhas e colunas                                */
  /*                                                                    */
  /* Toda inserção, exclusão e troca de lugar reescreve as fórmulas da   */
  /* planilha: a referência acompanha o DADO, como no Excel. Sem isso,   */
  /* excluir a linha 2 fazia `=A5` passar a ler o que era a linha 6.     */
  /* ------------------------------------------------------------------ */

  const addRow = () => update({ rows: [...(atual().rows ?? []), { id: uid('r'), cells: {} }] })

  const addColumn = () => {
    const colunas = atual().columns ?? []
    update({ columns: [...colunas, novaColuna(colunas.length + 1)] })
  }

  const inserirLinha = (linhaDaTela, onde) => {
    const dados = atual()
    const base = real(linhaDaTela)
    const indice = base === -1 ? (dados.rows ?? []).length : onde === 'acima' ? base : base + 1
    const linhas = [...dados.rows.slice(0, indice), { id: uid('r'), cells: {} }, ...dados.rows.slice(indice)]
    update({ rows: reescreverFormulas(dados.columns, linhas, (f) => ajustarAoInserir(f, 'linha', indice)) })
    const destino = onde === 'acima' ? linhaDaTela : linhaDaTela + 1
    selecionarCelula(destino, ancora?.coluna ?? 0)
  }

  const excluirLinhas = (indicesReais) => {
    const dados = atual()
    let linhas = dados.rows ?? []
    for (const indice of [...new Set(indicesReais)].filter((i) => i >= 0).sort((a, b) => b - a)) {
      linhas = linhas.filter((_, i) => i !== indice)
      linhas = reescreverFormulas(dados.columns, linhas, (f) => ajustarAoExcluir(f, 'linha', indice))
    }
    update({ rows: linhas })
    const primeira = Math.min(...areas.map((a) => a.linhaInicio), shown.length)
    if (area) selecionarCelula(Math.max(0, Math.min(primeira, linhas.length - 1)), ancora?.coluna ?? 0)
  }

  const inserirColuna = (indice) => {
    const dados = atual()
    const colunas = [...dados.columns.slice(0, indice), novaColuna(dados.columns.length + 1), ...dados.columns.slice(indice)]
    update({
      columns: colunas,
      rows: reescreverFormulas(colunas, dados.rows, (f) => ajustarAoInserir(f, 'coluna', indice)),
    })
    selecionarCelula(ancora?.linha ?? 0, indice)
  }

  const excluirColunas = (indices) => {
    const dados = atual()
    let colunas = dados.columns ?? []
    let linhas = dados.rows ?? []
    let ordenacao = dados.sort ?? null
    let regras = dados.filters ?? []
    for (const indice of [...new Set(indices)].sort((a, b) => b - a)) {
      const coluna = colunas[indice]
      if (!coluna || colunas.length <= 1) continue
      colunas = colunas.filter((_, i) => i !== indice)
      // As células da coluna removida ficariam órfãs no payload e
      // reapareceriam se uma coluna nova reaproveitasse o id. A
      // formatação delas também.
      linhas = linhas.map((row) => {
        const { [coluna.id]: _removida, ...resto } = row.cells ?? {}
        return { ...row, cells: resto }
      })
      linhas = estilizar(linhas, new Map(linhas.map((r) => [r.id, [coluna.id]])), () => ({}))
      linhas = reescreverFormulas(colunas, linhas, (f) => ajustarAoExcluir(f, 'coluna', indice))
      if (ordenacao?.column === coluna.id) ordenacao = null
      regras = regras.filter((f) => f.column !== coluna.id)
    }
    update({ columns: colunas, rows: linhas, sort: ordenacao, filters: regras })
    if (area) selecionarCelula(ancora.linha, Math.max(0, Math.min(ancora.coluna, colunas.length - 1)))
  }

  /**
   * Coluna com o formato novo, e as linhas ajustadas a ele.
   *
   * - Saindo do tipo Fórmula, a célula sem `=` viraria texto cru
   *   ("A1+B1"). O `=` na frente mantém a conta funcionando.
   * - Virando Lista sem opções, as opções saem do que já está escrito na
   *   coluna: a lista nasce pronta, e não vazia à espera de configuração.
   */
  const comFormato = (coluna, tipo, linhas) => {
    if (!tipo || tipo === coluna.type) return [coluna, linhas]
    const nova = { ...coluna, type: tipo }
    let novas = linhas
    if (coluna.type === 'formula') {
      novas = linhas.map((row) => {
        const raw = row.cells?.[coluna.id]
        if (vazia(raw) || String(raw).startsWith('=')) return row
        return { ...row, cells: { ...row.cells, [coluna.id]: `=${raw}` } }
      })
    }
    if ((tipo === 'select' || tipo === 'multiselect') && !coluna.options?.length) {
      const escritos = linhas.map((r) => r.cells?.[coluna.id]).filter((v) => typeof v === 'string' && v.trim() && !v.startsWith('='))
      nova.options = [...new Set(escritos.map((v) => v.trim()))].slice(0, 50)
    }
    if (tipo === 'currency' && !coluna.currency) nova.currency = String(idioma).startsWith('en') ? 'USD' : 'BRL'
    // O Geral mostra o número como foi digitado: casas fixas de antes
    // arredondariam só os resultados de conta, e ninguém saberia por quê.
    if (tipo === 'text') delete nova.decimals
    return [nova, novas]
  }

  const updateColumn = (id, patch, opcoes) => {
    const dados = atual()
    let linhas = dados.rows
    const colunas = dados.columns.map((c) => {
      if (c.id !== id) return c
      const [nova, novas] = comFormato(c, patch.type, linhas)
      linhas = novas
      return { ...nova, ...patch }
    })
    update({ columns: colunas, ...(linhas !== dados.rows ? { rows: linhas } : {}) }, opcoes)
  }

  const moveColumn = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    const dados = atual()
    const next = [...dados.columns]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    // As fórmulas endereçam por POSIÇÃO (A, B, C...): mover a coluna troca
    // a letra do dado, e cada referência segue o dado para a letra nova.
    update({
      columns: next,
      rows: reescreverFormulas(next, dados.rows, (f) => ajustarAoMover(f, 'coluna', fromIndex, toIndex)),
    })
  }

  const clearColumn = (column) =>
    update({
      rows: atual().rows.map((row) => {
        const { [column.id]: _cleared, ...rest } = row.cells ?? {}
        return { ...row, cells: rest }
      }),
    })

  const atualizarCelula = (rowId, colId, valor) =>
    update({
      rows: atual().rows.map((row) => (row.id === rowId ? { ...row, cells: { ...row.cells, [colId]: valor } } : row)),
    })

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
      updateColumn(resizing.id, { width: Math.round(width) }, { historico: false })
    }
    // O arraste inteiro é UM passo do desfazer, gravado ao soltar.
    const onUp = () => {
      setResizing(null)
      onCommit?.(atual())
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  /** Abre o menu da coluna ancorado no cabeçalho que foi clicado. */
  const abrirMenuColuna = (id, elemento) => {
    const caixa = elemento.getBoundingClientRect()
    setMenuAncora({ left: caixa.left, bottom: caixa.bottom })
    setMenuColumn(id)
  }

  //: Estável: o menu registra listeners de scroll/resize com ele.
  const fecharMenuColuna = useCallback(() => setMenuColumn(null), [])

  /** Duplo clique na divisória ajusta a largura ao conteúdo. */
  const autoFitColumn = (column) => {
    const header = column.name.length
    const widest = rows.reduce((max, row) => {
      const { text } = displayValue(column, row, columns, rows)
      return Math.max(max, String(text).length)
    }, header)
    updateColumn(column.id, { width: Math.min(420, Math.max(80, widest * 8 + 42)) })
  }

  /* ------------------------------------------------------------------ */
  /* Seleção de células e área de transferência                         */
  /*                                                                    */
  /* Os índices são da VISÃO (`shown`), não do array cru: com filtro ou  */
  /* ordenação ativos, copiar "as três primeiras linhas" tem de copiar   */
  /* o que está na tela.                                                */
  /* ------------------------------------------------------------------ */

  const iniciarSelecao = (linha, coluna, event) => {
    // preventDefault SEMPRE, antes de qualquer ramo: sem isso o navegador
    // começa a seleção de TEXTO da página. Com Shift ele estende essa
    // seleção nativa até o clique — era o "shift+clique pinta a página
    // inteira de azul". Vale também para o arraste comum, que senão
    // seleciona o texto das células por onde passa.
    event.preventDefault()
    // Sem o foco na grade, Ctrl+C/V e as setas iriam para o documento. Se
    // havia uma célula em edição, o `blur` daqui a grava.
    gradeRef.current?.focus({ preventScroll: true })
    retornoDoTab.current = null

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
        const atualBloco = retangulo(antes.ancora, antes.ponta)
        return {
          ancora: alvo,
          ponta: alvo,
          blocos: atualBloco ? [...antes.blocos, atualBloco] : antes.blocos,
        }
      }
      // Clique normal recomeça do zero.
      return { ancora: alvo, ponta: alvo, blocos: [] }
    })

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

  /** Clique no cabeçalho seleciona a coluna inteira; Shift estende, Ctrl soma. */
  const selecionarColuna = (coluna, event) => {
    if (!shown.length) return
    gradeRef.current?.focus({ preventScroll: true })
    const ultima = shown.length - 1
    setSelecao((antes) => {
      if (event.shiftKey && antes.ancora) {
        return { ...antes, ancora: { linha: 0, coluna: antes.ancora.coluna }, ponta: { linha: ultima, coluna } }
      }
      const nova = { ancora: { linha: 0, coluna }, ponta: { linha: ultima, coluna } }
      if (event.ctrlKey || event.metaKey) {
        const atualBloco = retangulo(antes.ancora, antes.ponta)
        return { ...nova, blocos: atualBloco ? [...antes.blocos, atualBloco] : antes.blocos }
      }
      return { ...nova, blocos: [] }
    })
  }

  /** Clique no número seleciona a linha inteira; Shift estende, Ctrl soma. */
  const selecionarLinha = (linha, event) => {
    if (!columns.length) return
    event.preventDefault()
    gradeRef.current?.focus({ preventScroll: true })
    const ultima = columns.length - 1
    setSelecao((antes) => {
      if (event.shiftKey && antes.ancora) {
        return { ...antes, ancora: { linha: antes.ancora.linha, coluna: 0 }, ponta: { linha, coluna: ultima } }
      }
      const nova = { ancora: { linha, coluna: 0 }, ponta: { linha, coluna: ultima } }
      if (event.ctrlKey || event.metaKey) {
        const atualBloco = retangulo(antes.ancora, antes.ponta)
        return { ...nova, blocos: atualBloco ? [...antes.blocos, atualBloco] : antes.blocos }
      }
      return { ...nova, blocos: [] }
    })
    arrastandoCelulas.current = false
  }

  // O ponteiro costuma ser solto fora da célula (ou fora da tabela), então
  // quem encerra os arrastes é a janela.
  useEffect(() => {
    const soltar = () => {
      arrastandoCelulas.current = false
      apontando.current = null
    }
    window.addEventListener('pointerup', soltar)
    return () => window.removeEventListener('pointerup', soltar)
  }, [])

  /** Linhas da visão de volta para o array real, preservando a ordem crua. */
  const gravarLinhasVisiveis = (linhasDaVisao) => {
    const porId = new Map(linhasDaVisao.map((r) => [r.id, r]))
    update({ rows: atual().rows.map((r) => porId.get(r.id) ?? r) })
  }

  /** TSV do que está selecionado, guardando de onde veio para colar ajustando fórmulas. */
  const textoDaSelecao = () => {
    const caixa = uniao(areas)
    if (!caixa) return ''
    // Com blocos soltos, copia a caixa que envolve todos: TSV não sabe
    // representar buracos, e é o que o Excel também faz.
    const texto = paraTSV(caixa, shown, columns)
    copiaRef.current = {
      texto: normalizarTSV(texto),
      caixa,
      reais: Array.from({ length: caixa.linhaFim - caixa.linhaInicio + 1 }, (_, i) => real(caixa.linhaInicio + i)),
    }
    return texto
  }

  const limparSelecao = () => {
    let linhas = shown
    for (const bloco of areas) linhas = limpar(bloco, linhas, columns)
    gravarLinhasVisiveis(linhas)
  }

  /**
   * Cola o texto na seleção.
   *
   * - Fórmula copiada DAQUI anda com a célula: `=A1*2` colado uma linha
   *   abaixo vira `=A2*2` (o `$` segura a parte que não deve andar).
   * - Um valor só, colado sobre várias células, preenche todas — o jeito
   *   rápido de pôr a mesma coisa numa coluna inteira.
   */
  const colarTexto = (texto) => {
    if (!area || !texto) return
    const matriz = deTSV(texto)
    const copia = copiaRef.current
    const daqui = copia && copia.texto === normalizarTSV(texto)
    // O que passa da borda cria linhas e colunas, como no Excel: colar uma
    // tabela de 15 linhas numa planilha de 10 perdia as 5 últimas calado.
    const dados = atual()
    const largura = Math.max(...matriz.map((l) => l.length))
    const novasColunas = Array.from({ length: Math.max(0, area.colunaInicio + largura - columns.length) }, (_, i) =>
      novaColuna(columns.length + i + 1),
    )
    const novasLinhas = Array.from({ length: Math.max(0, area.linhaInicio + matriz.length - shown.length) }, () => ({
      id: uid('r'),
      cells: {},
    }))
    const colunas = [...columns, ...novasColunas]
    //: Posição gravada da linha da tela; as novas entram no fim da planilha.
    const realDe = (l) => (l < shown.length ? real(l) : (dados.rows?.length ?? 0) + l - shown.length)
    const ajustar = (valor, linhaDestino, colunaDestino, linhaOrigem, colunaOrigem) => {
      const coluna = colunas[colunaDestino]
      if (!daqui || !coluna || !celulaComFormula(coluna, valor)) return valor
      return deslocarFormula(valor, realDe(linhaDestino) - linhaOrigem, colunaDestino - colunaOrigem)
    }

    if (matriz.length === 1 && matriz[0].length === 1 && areas.some((a) => a.linhaFim > a.linhaInicio || a.colunaFim > a.colunaInicio)) {
      const valor = matriz[0][0]
      const linhas = shown.map((r) => ({ ...r, cells: { ...(r.cells ?? {}) } }))
      for (const bloco of areas) {
        for (let l = bloco.linhaInicio; l <= bloco.linhaFim; l += 1) {
          for (let c = bloco.colunaInicio; c <= bloco.colunaFim; c += 1) {
            const coluna = columns[c]
            if (!coluna || !linhas[l]) continue
            linhas[l].cells[coluna.id] = ajustar(valor, l, c, copia?.reais?.[0] ?? real(l), copia?.caixa?.colunaInicio ?? c)
          }
        }
      }
      gravarLinhasVisiveis(linhas)
      return
    }

    const coladas = colar(
      matriz,
      [...shown, ...novasLinhas],
      colunas,
      { linha: area.linhaInicio, coluna: area.colunaInicio },
      (valor, dl, dc) =>
        ajustar(
          valor,
          area.linhaInicio + dl,
          area.colunaInicio + dc,
          copia?.reais?.[dl] ?? realDe(area.linhaInicio + dl),
          (copia?.caixa?.colunaInicio ?? area.colunaInicio) + dc,
        ),
    )
    // Um passo só do desfazer: células coladas, linhas e colunas novas.
    const porId = new Map(coladas.map((r) => [r.id, r]))
    update({
      rows: [...(dados.rows ?? []).map((r) => porId.get(r.id) ?? r), ...coladas.slice(shown.length)],
      ...(novasColunas.length ? { columns: colunas } : {}),
    })
    // A seleção passa a cobrir o que foi colado, como no Excel.
    setSelecao((antes) => ({
      ...antes,
      ponta: { linha: area.linhaInicio + matriz.length - 1, coluna: area.colunaInicio + largura - 1 },
    }))
  }

  // Ctrl+C/X/V chegam aqui só com a GRADE em foco: dentro do campo de
  // edição eles são do texto, e copiar a célula inteira no lugar do
  // trecho marcado seria um susto.
  const aoCopiar = (event) => {
    if (!area || event.target !== gradeRef.current) return
    event.clipboardData.setData('text/plain', textoDaSelecao())
    event.preventDefault()
  }

  const aoRecortar = (event) => {
    if (!area || event.target !== gradeRef.current || somenteLeitura) return
    aoCopiar(event)
    limparSelecao()
  }

  const aoColar = (event) => {
    if (event.target !== gradeRef.current || somenteLeitura) return
    const texto = event.clipboardData?.getData('text/plain')
    if (!texto) return
    event.preventDefault()
    colarTexto(texto)
  }

  /* ------------------------------------------------------------------ */
  /* Alça de preenchimento                                              */
  /* ------------------------------------------------------------------ */

  const aplicarPreenchimento = (origem, alvo) => {
    if (
      origem.linhaInicio === alvo.linhaInicio &&
      origem.linhaFim === alvo.linhaFim &&
      origem.colunaInicio === alvo.colunaInicio &&
      origem.colunaFim === alvo.colunaFim
    ) return
    gravarLinhasVisiveis(preencher(origem, alvo, shown, columns, real))
    setSelecao({
      ancora: { linha: alvo.linhaInicio, coluna: alvo.colunaInicio },
      ponta: { linha: alvo.linhaFim, coluna: alvo.colunaFim },
      blocos: [],
    })
  }

  /** Até onde a alça foi puxada: cresce num eixo só, o de maior distância. */
  const estenderPreenchimento = (linha, coluna) => {
    setPreenchimento((p) => {
      if (!p) return p
      const o = p.origem
      const distancias = {
        baixo: linha - o.linhaFim,
        cima: o.linhaInicio - linha,
        direita: coluna - o.colunaFim,
        esquerda: o.colunaInicio - coluna,
      }
      const [lado, quanto] = Object.entries(distancias).sort((a, b) => b[1] - a[1])[0]
      if (quanto <= 0) return { ...p, alvo: o }
      const alvo = {
        baixo: { ...o, linhaFim: linha },
        cima: { ...o, linhaInicio: linha },
        direita: { ...o, colunaFim: coluna },
        esquerda: { ...o, colunaInicio: coluna },
      }[lado]
      return { ...p, alvo }
    })
  }

  const preenchendo = !!preenchimento
  useEffect(() => {
    if (!preenchendo) return undefined
    const soltar = () => {
      const p = preenchimentoRef.current
      setPreenchimento(null)
      if (p) aplicarPreenchimento(p.origem, p.alvo)
    }
    window.addEventListener('pointerup', soltar)
    return () => window.removeEventListener('pointerup', soltar)
    // `aplicarPreenchimento` lê `shown` deste render: o arraste não muda dados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preenchendo])

  /* ------------------------------------------------------------------ */
  /* Teclado da grade                                                   */
  /* ------------------------------------------------------------------ */

  const teclasDaGrade = (event) => {
    // Só a grade em si: as teclas do campo de edição sobem até aqui, e o
    // Enter que já gravou a célula lá dentro abriria a edição da seguinte.
    if (event.target !== event.currentTarget || editingRef.current) return
    const mod = event.ctrlKey || event.metaKey
    const ultimaLinha = shown.length - 1
    const ultimaColuna = columns.length - 1
    if (ultimaLinha < 0 || ultimaColuna < 0) return

    if (!area) {
      // Nada selecionado ainda: a primeira seta começa no A1.
      if (event.key.startsWith('Arrow') || event.key === 'Enter') {
        event.preventDefault()
        selecionarCelula(0, 0)
      }
      return
    }

    const linha = shown[ancora.linha]
    const coluna = columns[ancora.coluna]

    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelecao({
        ancora: { linha: 0, coluna: 0 },
        ponta: { linha: ultimaLinha, coluna: ultimaColuna },
        blocos: [],
      })
      return
    }

    // Os atalhos de formatar do Excel: Ctrl+B/I/U, Ctrl+Shift+$ e Ctrl+Shift+%.
    if (mod && !event.altKey && !somenteLeitura) {
      const estilo = !event.shiftKey && { b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]
      if (estilo) {
        event.preventDefault()
        alternarEstilo(estilo)
        return
      }
      if (event.shiftKey && (event.key === '$' || event.key === '%')) {
        event.preventDefault()
        mudarFormato(event.key === '$' ? 'currency' : 'percent')
        return
      }
    }

    // Alt+= é a Soma automática do Excel.
    if (event.altKey && !mod && event.key === '=' && !somenteLeitura) {
      event.preventDefault()
      autoSoma(funcaoPorNome('SOMA'))
      return
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && !somenteLeitura) {
      event.preventDefault()
      limparSelecao()
      return
    }

    if (event.key === 'Escape') {
      setSelecao((antes) => ({ ...antes, ponta: antes.ancora, blocos: [] }))
      return
    }

    // Caixa: espaço (ou Enter) marca e desmarca, como num formulário.
    if (coluna?.type === 'checkbox' && (event.key === ' ' || event.key === 'Enter') && !somenteLeitura) {
      event.preventDefault()
      if (linha) atualizarCelula(linha.id, coluna.id, !linha.cells?.[coluna.id])
      return
    }

    // Avaliação: o número da tecla vira as estrelas, sem abrir nada.
    if (coluna?.type === 'rating' && /^[0-5]$/.test(event.key) && !mod && !somenteLeitura) {
      event.preventDefault()
      if (linha) atualizarCelula(linha.id, coluna.id, Number(event.key))
      return
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault()
      comecarEdicao(ancora.linha, ancora.coluna)
      return
    }

    // Movimento: setas (Ctrl vai até a borda), Home/End, PageUp/PageDown e
    // Tab. Shift estende a seleção — menos no Tab, onde volta uma célula.
    const base = event.shiftKey && event.key !== 'Tab' ? (ponta ?? ancora) : ancora
    let alvo = null
    const setas = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (setas[event.key]) {
      const [dl, dc] = setas[event.key]
      alvo = mod
        ? {
            linha: dl ? (dl < 0 ? 0 : ultimaLinha) : base.linha,
            coluna: dc ? (dc < 0 ? 0 : ultimaColuna) : base.coluna,
          }
        : { linha: base.linha + dl, coluna: base.coluna + dc }
    } else if (event.key === 'Home') {
      alvo = mod ? { linha: 0, coluna: 0 } : { linha: base.linha, coluna: 0 }
    } else if (event.key === 'End') {
      alvo = mod ? { linha: ultimaLinha, coluna: ultimaColuna } : { linha: base.linha, coluna: ultimaColuna }
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      alvo = { linha: base.linha + (event.key === 'PageDown' ? 10 : -10), coluna: base.coluna }
    } else if (event.key === 'Tab') {
      const proxima = base.coluna + (event.shiftKey ? -1 : 1)
      // Na ponta da linha o Tab sai da planilha: senão o teclado ficaria preso aqui.
      if (proxima < 0 || proxima > ultimaColuna) return
      alvo = { linha: base.linha, coluna: proxima }
    }

    if (alvo) {
      event.preventDefault()
      const limitado = {
        linha: Math.min(Math.max(alvo.linha, 0), ultimaLinha),
        coluna: Math.min(Math.max(alvo.coluna, 0), ultimaColuna),
      }
      retornoDoTab.current = null
      rolarAteSelecao.current = true
      setSelecao((antes) =>
        event.shiftKey && event.key !== 'Tab'
          ? { ...antes, ponta: limitado }
          : { ancora: limitado, ponta: limitado, blocos: [] },
      )
      return
    }

    // Digitar com a célula selecionada entra na edição, como em qualquer
    // planilha: o que se digita substitui o que estava.
    if (!mod && !event.altKey && event.key.length === 1 && !somenteLeitura) {
      event.preventDefault()
      comecarEdicao(ancora.linha, ancora.coluna, { rascunho: event.key })
    }
  }

  // Desfazer e refazer valem com o foco em qualquer ponto da planilha
  // (grade, barra de ferramentas) — menos nos campos de texto, onde
  // Ctrl+Z desfaz a digitação.
  useListenerDeJanela('keydown', (event) => {
    const foco = document.activeElement
    if (!raizRef.current?.contains(foco)) return
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(foco?.tagName)) return
    const acao = atalhoDe(event)
    if (acao === 'undo') {
      event.preventDefault()
      onUndo?.()
    } else if (acao === 'redo') {
      event.preventDefault()
      onRedo?.()
    }
  })

  // A seleção andou pelo teclado: traz a célula para dentro da tela. O
  // `scroll-padding` da grade desconta o cabeçalho e a 1ª coluna fixos.
  useEffect(() => {
    if (!rolarAteSelecao.current) return
    rolarAteSelecao.current = false
    const alvo = ponta ?? ancora
    if (!alvo) return
    gradeRef.current
      ?.querySelector(`[data-celula="${alvo.linha}:${alvo.coluna}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selecao, ancora, ponta])

  /* ------------------------------------------------------------------ */
  /* Menu de botão direito                                              */
  /* ------------------------------------------------------------------ */

  const abrirMenuDaCelula = (event, linha, coluna) => {
    // Clicar fora da seleção atual seleciona a célula clicada antes, como
    // no Excel: o menu age sobre o que está marcado.
    if (!dentroDeAlguma(areas, linha, coluna)) {
      setSelecao({ ancora: { linha, coluna }, ponta: { linha, coluna }, blocos: [] })
    }
    gradeRef.current?.focus({ preventScroll: true })
    openMenu(event, { linha, coluna })
  }

  /**
   * O que está marcado, para o menu de célula e a barra de funções: a caixa
   * que envolve a seleção, as linhas (na posição GRAVADA) e as colunas.
   */
  const marcadas = (reserva = null) => {
    const caixa = uniao(areas) ?? retangulo(reserva, reserva)
    if (!caixa) return null
    const linhasMarcadas = []
    for (const bloco of areas.length ? areas : [caixa]) {
      for (let l = bloco.linhaInicio; l <= bloco.linhaFim; l += 1) linhasMarcadas.push(real(l))
    }
    const colunasMarcadas = []
    for (let c = caixa.colunaInicio; c <= caixa.colunaFim; c += 1) colunasMarcadas.push(c)
    return { caixa, linhasMarcadas, colunasMarcadas, nLinhas: new Set(linhasMarcadas).size, nColunas: colunasMarcadas.length }
  }

  const itensDoMenuDaCelula = () => {
    const marcado = marcadas(menu?.payload)
    if (!marcado) return []
    const { caixa, linhasMarcadas, colunasMarcadas, nLinhas, nColunas } = marcado

    const copiar = () => copiarTexto(textoDaSelecao())
    const extras = itensDoMenu.length ? [{ separator: true }, ...itensDoMenu] : []
    if (somenteLeitura) return [{ label: t('Copiar'), icon: Copy, atalho: 'Ctrl+C', onClick: copiar }, ...extras]

    return [
      {
        label: t('Recortar'),
        icon: Scissors,
        atalho: 'Ctrl+X',
        onClick: () => {
          copiar()
          limparSelecao()
        },
      },
      { label: t('Copiar'), icon: Copy, atalho: 'Ctrl+C', onClick: copiar },
      {
        label: t('Colar'),
        icon: ClipboardPaste,
        atalho: 'Ctrl+V',
        onClick: async () => {
          try {
            colarTexto(await navigator.clipboard.readText())
          } catch {
            // O navegador pode negar a leitura da área de transferência
            // fora de um Ctrl+V; o atalho sempre funciona.
            avisarErro(t('O navegador não deixou ler a área de transferência. Use Ctrl+V.'))
          }
        },
      },
      { separator: true },
      { label: t('Inserir linha acima'), icon: BetweenHorizontalStart, onClick: () => inserirLinha(caixa.linhaInicio, 'acima') },
      { label: t('Inserir linha abaixo'), icon: BetweenHorizontalEnd, onClick: () => inserirLinha(caixa.linhaFim, 'abaixo') },
      {
        label: nLinhas > 1 ? t('Excluir {n} linhas', { n: nLinhas }) : t('Excluir linha'),
        icon: Trash2,
        danger: true,
        onClick: () => excluirLinhas(linhasMarcadas),
      },
      { separator: true },
      { label: t('Inserir coluna à esquerda'), icon: BetweenVerticalStart, onClick: () => inserirColuna(caixa.colunaInicio) },
      { label: t('Inserir coluna à direita'), icon: BetweenVerticalEnd, onClick: () => inserirColuna(caixa.colunaFim + 1) },
      {
        label: nColunas > 1 ? t('Excluir {n} colunas', { n: nColunas }) : t('Excluir coluna'),
        icon: Trash2,
        danger: true,
        // A planilha precisa de pelo menos uma coluna.
        disabled: nColunas >= columns.length,
        onClick: () => excluirColunas(colunasMarcadas),
      },
      { separator: true },
      { label: t('Limpar conteúdo'), icon: Eraser, atalho: 'Delete', onClick: limparSelecao },
      ...extras,
    ]
  }

  /* ------------------------------------------------------------------ */
  /* Barra de funções                                                   */
  /*                                                                    */
  /* Cada botão age sobre a seleção inteira, num passo só do desfazer.  */
  /* ------------------------------------------------------------------ */

  /** Ids das células marcadas, linha por linha, para `estilizar`. */
  const alvosDaSelecao = () => {
    const alvos = new Map()
    for (const bloco of areas) {
      for (let l = bloco.linhaInicio; l <= bloco.linhaFim; l += 1) {
        const row = shown[l]
        if (!row) continue
        const ids = alvos.get(row.id) ?? new Set()
        for (let c = bloco.colunaInicio; c <= bloco.colunaFim; c += 1) if (columns[c]) ids.add(columns[c].id)
        alvos.set(row.id, ids)
      }
    }
    return alvos
  }

  const estilizarSelecao = (mudar) => {
    if (!areas.length) return
    update({ rows: estilizar(atual().rows, alvosDaSelecao(), mudar) })
  }

  /** Negrito, itálico... liga ou desliga pelo estado da célula ATIVA, como no Excel. */
  const alternarEstilo = (chave) => {
    const ligar = !estiloDaAncora?.[chave]
    estilizarSelecao((e) => ({ ...e, [chave]: ligar }))
  }

  const formatarColunas = (mudar) => {
    const marcado = marcadas()
    if (!marcado) return
    const alvo = new Set(marcado.colunasMarcadas)
    const dados = atual()
    let linhas = dados.rows
    const colunas = dados.columns.map((c, i) => {
      if (!alvo.has(i)) return c
      const [nova, novas] = mudar(c, linhas)
      linhas = novas
      return nova
    })
    update({ columns: colunas, ...(linhas !== dados.rows ? { rows: linhas } : {}) })
  }

  const mudarFormato = (tipo) => formatarColunas((c, linhas) => comFormato(c, tipo, linhas))

  /**
   * Casas decimais a mais ou a menos. Partindo do automático, conta as
   * casas que a coluna já mostra (7,25 tem duas); no Geral, a coluna vira
   * Número, que é o formato onde casas decimais existem.
   */
  const mudarCasas = (passo) => {
    formatarColunas((c, linhas) => {
      const geral = c.type === 'text' || c.type === 'longtext'
      let base = c.decimals
      if (base === null || base === undefined) {
        base = c.type === 'currency' ? 2 : 0
        for (const row of linhas) {
          const valor = comparableValue(c, row, dadosRef.current.columns, linhas)
          const n = typeof valor === 'number' ? valor : numeroOuNulo(valor)
          if (n !== null) base = Math.max(base, Math.min(4, (String(n).split('.')[1] ?? '').length))
        }
      }
      return [{ ...c, ...(geral ? { type: 'number' } : {}), decimals: Math.max(0, Math.min(6, base + passo)) }, linhas]
    })
  }

  const ordenar = (direcao) => {
    if (!direcao) update({ sort: null })
    else if (colunaDaAncora) update({ sort: { column: colunaDaAncora.id, direction: direcao } })
  }

  // Filtro é jeito de olhar, não conteúdo: fica fora do desfazer, como na barra de filtros.
  const filtrarPelaColuna = () => {
    const coluna = colunaDaAncora ?? columns[0]
    if (!coluna) return
    update({ filters: [...(atual().filters ?? []), { column: coluna.id, operator: 'contains', value: '' }] }, { historico: false })
  }

  /**
   * Soma automática (Σ), como no Excel.
   *
   * Uma célula marcada: escreve `=SOMA(...)` nela, citando os números logo
   * ACIMA (ou, sem eles, à esquerda), e deixa a fórmula aberta para
   * conferir — Enter grava. Um intervalo marcado: põe a conta de cada
   * coluna na primeira linha vazia logo abaixo dele.
   */
  const autoSoma = (funcao) => {
    if (!area || somenteLeitura || !funcao) return
    const nome = String(idioma).startsWith('en') ? funcao.en : funcao.pt
    const separador = String(idioma).startsWith('en') ? ',' : ';'
    const linhasGravadas = atual().rows ?? []
    const temNumero = (linhaReal, coluna) => {
      const row = linhasGravadas[linhaReal]
      const column = columns[coluna]
      if (!row || !column) return false
      const valor = comparableValue(column, row, columns, linhasGravadas)
      return typeof valor === 'number' || numeroOuNulo(valor) !== null
    }
    // Endereço das células: intervalo quando são vizinhas, lista quando a
    // ordenação ou o filtro as espalharam pela planilha.
    const enderecos = (coluna, reais) => {
      const ordenados = [...reais].sort((a, b) => a - b)
      const vizinhas = ordenados.every((r, i) => i === 0 || r === ordenados[i - 1] + 1)
      if (ordenados.length > 1 && vizinhas) return `${enderecoDe(coluna, ordenados[0])}:${enderecoDe(coluna, ordenados.at(-1))}`
      return ordenados.map((r) => enderecoDe(coluna, r)).join(separador)
    }

    const unica = blocos.length === 0 && area.linhaInicio === area.linhaFim && area.colunaInicio === area.colunaFim
    if (unica) {
      const linhaReal = real(ancora.linha)
      const coluna = ancora.coluna
      let inicio = linhaReal
      while (inicio > 0 && temNumero(inicio - 1, coluna)) inicio -= 1
      let dentroDos = ''
      if (inicio < linhaReal) dentroDos = `${enderecoDe(coluna, inicio)}:${enderecoDe(coluna, linhaReal - 1)}`
      else {
        let esquerda = coluna
        while (esquerda > 0 && temNumero(linhaReal, esquerda - 1)) esquerda -= 1
        if (esquerda < coluna) dentroDos = `${enderecoDe(esquerda, linhaReal)}:${enderecoDe(coluna - 1, linhaReal)}`
      }
      const texto = `=${nome}(${dentroDos})`
      comecarEdicao(ancora.linha, ancora.coluna, { rascunho: texto })
      // Sem intervalo achado, o cursor espera dentro dos parênteses.
      cursorPedido.current = dentroDos ? texto.length : texto.length - 1
      return
    }

    // Intervalo: a primeira linha vazia abaixo dele em todas as colunas marcadas.
    const caixa = uniao(areas)
    const colunasDaConta = []
    for (let c = caixa.colunaInicio; c <= caixa.colunaFim; c += 1) if (columns[c]) colunasDaConta.push(c)
    const vaziaEm = (row) => colunasDaConta.every((c) => vazia(row?.cells?.[columns[c].id]))
    let destino = caixa.linhaFim + 1
    while (destino < shown.length && !vaziaEm(shown[destino])) destino += 1
    const dados = atual()
    let linhas = dados.rows
    let idDestino = shown[destino]?.id
    if (!idDestino) {
      idDestino = uid('r')
      linhas = [...linhas, { id: idDestino, cells: {} }]
    }
    const reais = []
    for (let l = caixa.linhaInicio; l <= caixa.linhaFim; l += 1) reais.push(real(l))
    linhas = linhas.map((row) => {
      if (row.id !== idDestino) return row
      const cells = { ...row.cells }
      for (const c of colunasDaConta) cells[columns[c].id] = `=${nome}(${enderecos(c, reais)})`
      return { ...row, cells }
    })
    update({ rows: linhas })
    const linhaNova = destino < shown.length ? destino : shown.length
    setSelecao({
      ancora: { linha: linhaNova, coluna: colunasDaConta[0] },
      ponta: { linha: linhaNova, coluna: colunasDaConta.at(-1) },
      blocos: [],
    })
    focarGrade()
  }

  /**
   * fx: escreve `=NOME(` na célula ativa — ou no cursor, se uma fórmula já
   * está sendo escrita — e deixa o cursor nos parênteses, com a dica dos
   * argumentos aparecendo.
   */
  const inserirFuncao = (funcao) => {
    if (somenteLeitura || !funcao) return
    const nome = String(idioma).startsWith('en') ? funcao.en : funcao.pt
    const ed = editingRef.current
    if (ed && !ed.controle && String(ed.rascunho ?? '').startsWith('=')) {
      const campo = campoEmUso()
      const texto = String(ed.rascunho)
      const cursor = campo?.selectionStart ?? texto.length
      const novo = `${texto.slice(0, cursor)}${nome}(${texto.slice(campo?.selectionEnd ?? cursor)}`
      mudarRascunho(novo)
      cursorPedido.current = cursor + nome.length + 1
      return
    }
    if (!ancora) return
    const texto = `=${nome}(`
    comecarEdicao(ancora.linha, ancora.coluna, { rascunho: texto })
    cursorPedido.current = texto.length
  }

  /* ------------------------------------------------------------------ */
  /* Barra de fórmula                                                   */
  /* ------------------------------------------------------------------ */

  const colunaDaAncora = ancora ? columns[ancora.coluna] : null
  const linhaDaAncora = ancora ? shown[ancora.linha] : null
  const valorDaAncora = linhaDaAncora && colunaDaAncora ? displayValue(colunaDaAncora, linhaDaAncora, columns, rows) : null
  const estiloDaAncora = colunaDaAncora ? linhaDaAncora?.styles?.[colunaDaAncora.id] : undefined

  const endereco = (() => {
    if (editing) {
      const l = linhaDaVisao(editing.rowId)
      return enderecoDe(columns.findIndex((c) => c.id === editing.colId), real(l))
    }
    if (!area) return ''
    const unica = area.linhaInicio === area.linhaFim && area.colunaInicio === area.colunaFim
    const inicio = enderecoDe(area.colunaInicio, real(area.linhaInicio))
    return unica ? inicio : `${inicio}:${enderecoDe(area.colunaFim, real(area.linhaFim))}`
  })()

  /** "C10" + Enter no campo de endereço: vai até a célula. */
  const irPara = (texto) => {
    const casou = /^\s*([A-Za-z]+)(\d+)\s*$/.exec(texto ?? '')
    if (!casou) return
    const coluna = casou[1].toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
    const linhaReal = Number(casou[2]) - 1
    const linha = shown.findIndex((r) => posicaoReal.get(r.id) === linhaReal)
    if (linha === -1 || coluna < 0 || coluna >= columns.length) return
    selecionarCelula(linha, coluna)
    focarGrade()
  }

  /** Soma, média e contagem do que está marcado, como na barra de status do Excel. */
  const resumo = useMemo(() => {
    if (!areas.length) return null
    let celulas = 0
    let preenchidas = 0
    let soma = 0
    let numeros = 0
    for (const bloco of areas) {
      for (let l = bloco.linhaInicio; l <= bloco.linhaFim; l += 1) {
        for (let c = bloco.colunaInicio; c <= bloco.colunaFim; c += 1) {
          const coluna = columns[c]
          const linha = shown[l]
          if (!coluna || !linha) continue
          celulas += 1
          const valor = comparableValue(coluna, linha, columns, rows)
          if (vazia(valor) || valor === false) continue
          preenchidas += 1
          const n = typeof valor === 'number' ? valor : numeroOuNulo(valor)
          if (n !== null && coluna.type !== 'checkbox') {
            soma += n
            numeros += 1
          }
        }
      }
    }
    if (celulas < 2) return null
    const f = formatoDoResumo()
    return [
      ...(numeros ? [[AGGREGATE_LABELS.sum, f.format(soma)], [AGGREGATE_LABELS.avg, f.format(soma / numeros)]] : []),
      [AGGREGATE_LABELS.filled, String(preenchidas)],
    ]
  }, [areas, shown, columns, rows])

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  const larguraCongelada = columns.slice(0, frozen).reduce((soma, c) => soma + (c.width ?? 160), 0)
  const umaArea = blocos.length === 0 && area
  const alcaVisivel = umaArea && !editing && !somenteLeitura && !preenchimento

  const marcado = marcadas()

  /**
   * Largura que o texto da célula pede, se ele puder transbordar para as
   * vizinhas (0 se não pode): número, erro, texto alinhado ao centro ou com
   * quebra de linha ficam na própria célula, como no Excel.
   */
  const larguraPedida = (column, estilo, { text, error, numerico }) => {
    if (!text || error || numerico || estilo?.wrap || (estilo?.align && estilo.align !== 'left')) return 0
    if (column.type === 'checkbox' || column.type === 'rating' || NUMERIC_TYPES.includes(column.type)) return 0
    const texto = String(text)
    // Texto curto nem chega perto da borda: não precisa medir.
    if (texto.length * 4 + 16 <= (column.width ?? 160)) return 0
    return larguraDoTexto(texto, estilo?.bold, fonteDaGrade) + 16
  }

  // Depois de um botão da barra o teclado volta para a grade, para seguir
  // com as setas (ou outro Ctrl+B) sem clicar numa célula de novo. Quem
  // abriu a edição (Σ, fx) fica com o foco no campo.
  const voltarFoco = () => {
    if (!editingRef.current && !gradeRef.current?.contains(document.activeElement)) focarGrade()
  }
  const comFoco = (acoes) =>
    Object.fromEntries(
      Object.entries(acoes).map(([nome, acao]) => [
        nome,
        (...args) => {
          acao(...args)
          voltarFoco()
        },
      ]),
    )

  return (
    <div ref={raizRef} className="flex min-h-0 flex-1 flex-col">
      {/* A barra de funções no mesmo lugar da barra da nota: no topo, acima
          do título. Somente leitura não tem o que formatar, como na nota. */}
      {!somenteLeitura && (
        <div className="shrink-0 border-b border-ink-150 bg-white/95 dark:border-ink-800 dark:bg-ink-950/95">
          <BarraDaPlanilha
            estado={{
              ativa: !!colunaDaAncora && !!linhaDaAncora,
              tipo: colunaDaAncora?.type,
              estilo: estiloDaAncora ?? {},
              letra: columnLetter(ancora?.coluna ?? 0),
              indice: ancora?.coluna ?? 0,
              ordenada: !!sort,
              filtros: filtros.length,
              congeladas: frozen,
              nLinhas: marcado?.nLinhas ?? 1,
              nColunas: marcado?.nColunas ?? 1,
              podeExcluirColunas: (marcado?.nColunas ?? 1) < columns.length,
            }}
            acoes={comFoco({
              desfazer: () => onUndo?.(),
              refazer: () => onRedo?.(),
              formato: mudarFormato,
              casas: mudarCasas,
              alternar: alternarEstilo,
              estilo: (patch) => estilizarSelecao((e) => ({ ...e, ...patch })),
              inserirLinha: (onde) =>
                marcado ? inserirLinha(onde === 'acima' ? marcado.caixa.linhaInicio : marcado.caixa.linhaFim, onde) : addRow(),
              inserirColuna: (lado) =>
                marcado ? inserirColuna(lado === 'esquerda' ? marcado.caixa.colunaInicio : marcado.caixa.colunaFim + 1) : addColumn(),
              excluirLinhas: () => marcado && excluirLinhas(marcado.linhasMarcadas),
              excluirColunas: () => marcado && excluirColunas(marcado.colunasMarcadas),
              limparConteudo: limparSelecao,
              limparFormatacao: () => estilizarSelecao(() => ({})),
              ordenar,
              filtrar: filtrarPelaColuna,
              congelar: (n) => update({ frozen_columns: n }),
              autoSoma,
              inserirFuncao,
            })}
          />
        </div>
      )}

      {cabecalho}

      <div className="mt-3 flex min-h-0 flex-1 flex-col px-4 pb-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-200 dark:border-ink-800">
          {/* Os filtros só ocupam uma faixa quando existem: o botão de criar
              mora na barra de funções. Filtro é jeito de olhar, não conteúdo:
              não ocupa passo do desfazer a cada letra digitada no valor. */}
          {filtros.length > 0 && (
            <FilterBar data={data} visiveis={shown.length} onChange={(patch) => update(patch, { historico: false })} />
          )}

          <BarraDeFormula
            endereco={endereco}
            valor={editing && !editing.controle ? editing.rascunho : textoDaCelula(linhaDaAncora?.cells?.[colunaDaAncora?.id])}
            somenteLeitura={somenteLeitura || !ancora || TIPOS_SEM_TEXTO.includes(colunaDaAncora?.type)}
            erro={!editing ? valorDaAncora?.error : null}
            resumo={!editing ? resumo : null}
            campoRef={barraInputRef}
            onIrPara={irPara}
            onComecar={() => {
              const ed = editingRef.current
              if (ed && ed.origem !== 'barra') {
                const novo = { ...ed, origem: 'barra', controle: false, rascunho: ed.controle ? textoDaCelula(ed.rascunho) : ed.rascunho }
                editingRef.current = novo
                setEditing(novo)
              } else if (!ed && ancora) {
                comecarEdicao(ancora.linha, ancora.coluna, { origem: 'barra' })
              }
            }}
            onMudar={mudarRascunho}
            onTeclar={teclasDaBarra}
            onSair={(motivo) => {
              if (motivo === 'blur') {
                if (editingRef.current?.origem === 'barra') confirmar({ focar: false })
              } else focarGrade()
            }}
          />

          {/* Grade */}
          <div
            ref={gradeRef}
            // `tabIndex` para a grade receber teclado sem depender de um input
            // focado — é assim que Ctrl+C/V e as setas funcionam sem editar.
            tabIndex={0}
            role="grid"
            aria-label={t('Planilha')}
            onKeyDown={teclasDaGrade}
            onCopy={aoCopiar}
            onCut={aoRecortar}
            onPaste={aoColar}
            style={{
              // A célula trazida para a tela pelo teclado não pode parar
              // escondida embaixo do cabeçalho, da 1ª coluna ou do rodapé fixos.
              scrollPaddingTop: 34,
              scrollPaddingLeft: LARGURA_DO_NUMERO + larguraCongelada,
              scrollPaddingBottom: hasSummary ? 34 : 0,
            }}
            // `select-none` é o que REALMENTE impede o navegador de selecionar
            // o texto das células ao arrastar. `preventDefault` no pointerdown
            // não faz isso: o arrasto de texto nasce de outro caminho interno
            // do navegador. É a mesma proteção que o quadro usa.
            //
            // A edição acontece dentro de <input>, que ignora `user-select`
            // do pai — copiar e selecionar texto ali continua funcionando.
            className="min-h-0 flex-1 select-none overflow-auto focus:outline-none"
          >
            {/* Largura FIXA, a soma das colunas: a coluna tem a largura que a
                pessoa escolheu, como no Excel. No layout automático um texto
                comprido alargava a coluna inteira até caber. */}
            <table
              className="table-fixed border-collapse text-sm"
              style={{ width: LARGURA_DO_NUMERO + columns.reduce((soma, c) => soma + (c.width ?? 160), 0) + LARGURA_DO_MAIS }}
            >
              <thead className="sticky top-0 z-10">
                <tr>
                  <th
                    style={{ width: LARGURA_DO_NUMERO, minWidth: LARGURA_DO_NUMERO }}
                    className="sticky left-0 z-20 border-b border-r border-ink-200 bg-ink-50 px-1 py-1.5 text-[11px] font-medium text-ink-400 dark:border-ink-700 dark:bg-ink-900"
                  >
                    #
                  </th>
                  {columns.map((column, index) => {
                    const marcada = areas.some((a) => index >= a.colunaInicio && index <= a.colunaFim)
                    return (
                      <th
                        key={column.id}
                        style={{
                          width: column.width ?? 160,
                          minWidth: column.width ?? 160,
                          ...(index < frozen ? { left: LARGURA_DO_NUMERO, position: 'sticky', zIndex: 20 } : {}),
                        }}
                        className={cn(
                          'relative border-b border-r border-ink-200 p-0 text-left dark:border-ink-700',
                          // O cabeçalho de quem está selecionado acende, como no
                          // Excel: é o que diz em que coluna se está.
                          marcada ? 'bg-accent-100/70 dark:bg-accent-500/20' : 'bg-ink-50 dark:bg-ink-900',
                          dropIndex === index && 'border-l-2 border-l-accent-500',
                        )}
                        // Arrastar o cabeçalho reordena a coluna.
                        draggable={!somenteLeitura}
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
                        onContextMenu={(e) => {
                          if (!shown.length) return
                          if (!dentroDeAlguma(areas, 0, index)) selecionarColuna(index, e)
                          openMenu(e, { linha: 0, coluna: index })
                        }}
                      >
                        <div className="flex w-full items-center">
                          {/* Clicar seleciona a coluna inteira; a seta abre o menu. */}
                          <button
                            type="button"
                            onClick={(e) => selecionarColuna(index, e)}
                            onDoubleClick={(e) => abrirMenuColuna(column.id, e.currentTarget)}
                            title={t('Clique para selecionar a coluna · duplo clique abre as opções')}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left transition hover:bg-ink-100 dark:hover:bg-ink-800"
                          >
                            <span className={cn('font-mono text-[10px]', marcada ? 'font-semibold text-accent-700 dark:text-accent-300' : 'text-ink-400')}>
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
                            type="button"
                            onClick={(e) =>
                              menuColumn === column.id
                                ? setMenuColumn(null)
                                : abrirMenuColuna(column.id, e.currentTarget)
                            }
                            aria-label={t('Opções de {name}', { name: column.name })}
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
                          title={t('Arraste para redimensionar · duplo clique ajusta ao conteúdo')}
                          className={cn(
                            'absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none',
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
                            onDelete={() => excluirColunas([index])}
                            onClear={() => clearColumn(column)}
                            onAutoFit={() => autoFitColumn(column)}
                            onSort={(direction) => update({ sort: { column: column.id, direction } })}
                            onClose={fecharMenuColuna}
                          />
                        )}
                      </th>
                    )
                  })}
                  <th className="border-b border-ink-200 bg-ink-50 px-1 dark:border-ink-700 dark:bg-ink-900">
                    <button
                      type="button"
                      onClick={addColumn}
                      aria-label={t('Adicionar coluna')}
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
                  const realIndex = posicaoReal.get(row.id) ?? linhaIndex
                  const linhaMarcada = areas.some((a) => linhaIndex >= a.linhaInicio && linhaIndex <= a.linhaFim)
                  // O que cada célula mostra, e quanto do texto comprido passa
                  // por cima das vizinhas vazias, como no Excel.
                  const exibidos = columns.map((column) => displayValue(column, row, columns, rows))
                  const emEdicaoNaLinha = editing?.rowId === row.id ? editing.colId : null
                  const { estende, semBorda } = transbordos(
                    columns.map((c) => c.width ?? 160),
                    columns.map((c) => c.type !== 'checkbox' && c.id !== emEdicaoNaLinha && vazia(row.cells?.[c.id])),
                    columns.map((c, i) => (c.id === emEdicaoNaLinha ? 0 : larguraPedida(c, row.styles?.[c.id], exibidos[i]))),
                    frozen,
                  )
                  return (
                    <tr key={row.id}>
                      {/* Número da linha: clicar seleciona a linha inteira. A
                          lixeira aparece AO LADO do número no hover — antes ela
                          tomava o lugar dele, e quem clicava no número para
                          selecionar a linha a excluía. */}
                      <td
                        onPointerDown={(e) => e.button === 0 && selecionarLinha(linhaIndex, e)}
                        onContextMenu={(e) => {
                          if (!dentroDeAlguma(areas, linhaIndex, 0)) selecionarLinha(linhaIndex, e)
                          openMenu(e, { linha: linhaIndex, coluna: 0 })
                        }}
                        className={cn(
                          'group sticky left-0 z-10 cursor-pointer border-b border-r border-ink-200 px-1 text-center text-[11px] tabular-nums dark:border-ink-700',
                          linhaMarcada
                            ? 'bg-accent-100/70 font-semibold text-accent-700 dark:bg-accent-500/20 dark:text-accent-300'
                            : 'bg-white text-ink-400 dark:bg-ink-950',
                        )}
                      >
                        {/* O número fica sempre no mesmo lugar; a lixeira ocupa a
                            faixa reservada à direita, sem empurrar nada. */}
                        <span className="block pr-3">{realIndex + 1}</span>
                        {!somenteLeitura && (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => excluirLinhas([realIndex])}
                            aria-label={t('Excluir linha {valor}', { valor: realIndex + 1 })}
                            title={t('Excluir linha {valor}', { valor: realIndex + 1 })}
                            className={cn(
                              'absolute right-0.5 top-1/2 hidden -translate-y-1/2 p-0.5 text-ink-400 transition hover:text-red-600 group-hover:block',
                              ancora?.linha === linhaIndex && '[@media(hover:none)]:block',
                            )}
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </td>

                      {columns.map((column, colIndex) => {
                        const emEdicao = editing?.rowId === row.id && editing?.colId === column.id
                        const { text, error, raw, numerico } = exibidos[colIndex]
                        const estilo = row.styles?.[column.id]
                        const sticky =
                          colIndex < frozen
                            ? { left: LARGURA_DO_NUMERO, position: 'sticky', zIndex: 10 }
                            : undefined

                        const selecionada = dentroDeAlguma(areas, linhaIndex, colIndex)
                        const bordas = bordasDaSelecao(areas, linhaIndex, colIndex)
                        const ehAncora =
                          ancora?.linha === linhaIndex && ancora?.coluna === colIndex
                        // Contorno grosso na divisa do bloco; fio fino nas
                        // divisas internas, que é o que dá a leitura de
                        // "várias células escolhidas juntas".
                        const contornos = []
                        if (selecionada && !emEdicao) {
                          contornos.push(
                            contornoDaSelecao(bordas, 'rgb(var(--accent-500))', 2),
                            contornoDaSelecao(
                              { topo: !bordas.topo, base: !bordas.base, esquerda: !bordas.esquerda, direita: !bordas.direita },
                              'rgb(var(--accent-400) / 0.45)',
                              1,
                            ),
                          )
                        }
                        // Referências da fórmula em edição: cada uma com a sua cor.
                        let tinta
                        for (const ref of referencias) {
                          if (!naReferencia(ref, linhaIndex, colIndex)) continue
                          contornos.push(
                            contornoDaSelecao(
                              {
                                topo: !naReferencia(ref, linhaIndex - 1, colIndex),
                                base: !naReferencia(ref, linhaIndex + 1, colIndex),
                                esquerda: !naReferencia(ref, linhaIndex, colIndex - 1),
                                direita: !naReferencia(ref, linhaIndex, colIndex + 1),
                              },
                              ref.cor,
                              2,
                            ),
                          )
                          tinta = `${ref.cor}14`
                        }
                        // Prévia do preenchimento: o que a alça vai ocupar ao soltar.
                        const noPreenchimento =
                          preenchimento && dentro(preenchimento.alvo, linhaIndex, colIndex) && !dentro(preenchimento.origem, linhaIndex, colIndex)
                        if (noPreenchimento) {
                          contornos.push(contornoDaSelecao(bordasDaSelecao([preenchimento.alvo], linhaIndex, colIndex), '#9ca3af', 1))
                        }
                        const boxShadow = contornos.filter(Boolean).join(', ') || undefined
                        const temAlca = alcaVisivel && linhaIndex === area.linhaFim && colIndex === area.colunaFim

                        const comuns = {
                          'data-celula': `${linhaIndex}:${colIndex}`,
                          onPointerDown: (e) => {
                            if (e.button !== 0) return
                            // Clique DENTRO do campo em edição é dele: anda o
                            // cursor do texto. Antes ele virava seleção de
                            // célula, e a edição fechava a cada clique no texto.
                            if (e.target.closest('input, select, textarea, button')) return
                            // Escrevendo uma fórmula: o clique CITA a célula.
                            if (podeCitar()) {
                              e.preventDefault()
                              const ponto = { linha: linhaIndex, coluna: colIndex }
                              const base = e.shiftKey && refPendente.current ? refPendente.current.ancora : ponto
                              citar(base, ponto, e.shiftKey)
                              apontando.current = base
                              return
                            }
                            celulaJaMarcada.current = ehAncora ? `${row.id}:${column.id}` : null
                            iniciarSelecao(linhaIndex, colIndex, e)
                          },
                          onPointerEnter: (e) => {
                            if (!(e.buttons & 1)) return
                            if (apontando.current) {
                              citar(apontando.current, { linha: linhaIndex, coluna: colIndex }, true)
                              return
                            }
                            if (preenchimentoRef.current) {
                              estenderPreenchimento(linhaIndex, colIndex)
                              return
                            }
                            estenderSelecao(linhaIndex, colIndex, e)
                          },
                          onContextMenu: (e) => abrirMenuDaCelula(e, linhaIndex, colIndex),
                        }

                        // A alça de preenchimento: o quadradinho no canto da seleção.
                        const alca = temAlca && (
                          <span
                            onPointerDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setPreenchimento({ origem: area, alvo: area })
                            }}
                            // Duplo clique preenche até o fim da planilha, como no Excel.
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              aplicarPreenchimento(area, { ...area, linhaFim: shown.length - 1 })
                            }}
                            title={t('Arraste para preencher · duplo clique preenche até o fim')}
                            className="absolute -bottom-[4px] -right-[4px] z-20 h-[7px] w-[7px] cursor-crosshair border border-white bg-accent-500 dark:border-ink-950"
                          />
                        )

                        if (column.type === 'checkbox') {
                          return (
                            <td
                              key={column.id}
                              {...comuns}
                              style={{ ...sticky, boxShadow, backgroundColor: tinta ?? estilo?.fill }}
                              className={cn(
                                'relative h-8 border-b border-r border-ink-200 bg-white text-center dark:border-ink-700 dark:bg-ink-950',
                                ehAncora && 'bg-accent-50/60 dark:bg-accent-500/10',
                                noPreenchimento && 'bg-ink-100/60 dark:bg-ink-800/40',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(comparableValue(column, row, columns, rows))}
                                onChange={(e) => atualizarCelula(row.id, column.id, e.target.checked)}
                                // A caixa marca no clique, mas não fica com o
                                // foco: o teclado continua na grade (setas,
                                // espaço para marcar a selecionada).
                                tabIndex={-1}
                                onMouseDown={(e) => e.preventDefault()}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
                              />
                              {alca}
                            </td>
                          )
                        }

                        const previa = emEdicao && editing.origem === 'barra'
                        // Número à direita e texto à esquerda, a menos que a
                        // célula tenha alinhamento próprio (barra de funções).
                        const numeroAqui = numerico || (NUMERIC_TYPES.includes(column.type) && column.type !== 'rating')
                        const alinhar = estilo?.align ?? (numeroAqui ? 'right' : null)
                        return (
                          <td
                            key={column.id}
                            {...comuns}
                            style={{
                              ...sticky,
                              boxShadow,
                              backgroundColor: tinta ?? estilo?.fill,
                              // A divisória some embaixo do texto que transborda.
                              ...(semBorda[colIndex] ? { borderRightColor: 'transparent' } : {}),
                            }}
                            // No toque, tocar de novo na célula marcada edita: o
                            // toque duplo depende do intervalo, e quem toca devagar
                            // ficava sem jeito de escrever. No `click`, e não no
                            // `pointerdown`, para rolar a grade não abrir a edição.
                            onClick={(e) => {
                              if (e.nativeEvent.pointerType !== 'touch') return
                              if (celulaJaMarcada.current !== `${row.id}:${column.id}`) return
                              comecarEdicao(linhaIndex, colIndex)
                            }}
                            onDoubleClick={() => comecarEdicao(linhaIndex, colIndex)}
                            className={cn(
                              'relative h-8 cursor-cell border-b border-r border-ink-200 dark:border-ink-700',
                              // UM fundo só: `bg-white` e `bg-accent-*` são a
                              // MESMA propriedade CSS, e deixar as duas na
                              // classe fazia a ordem da folha decidir qual
                              // vence. A seleção NÃO pinta o fundo — ela é só
                              // contorno, para não esconder o conteúdo.
                              error && !emEdicao
                                ? 'bg-red-50 dark:bg-red-500/10'
                                : noPreenchimento
                                  ? 'bg-ink-100/60 dark:bg-ink-800/40'
                                  : ehAncora && !emEdicao
                                    ? 'bg-accent-50/60 dark:bg-accent-500/10'
                                    : 'bg-white dark:bg-ink-950',
                              emEdicao && 'ring-2 ring-inset ring-accent-500',
                            )}
                          >
                            {emEdicao && editing.controle ? (
                              <CellInput
                                column={column}
                                value={raw}
                                onCommit={(valor, { direcao, criar, blur, manter } = {}) =>
                                  confirmar({ valor, direcao, criar, manter, focar: !blur })
                                }
                                onCancel={(porTecla) => cancelar({ focar: porTecla })}
                              />
                            ) : emEdicao && !previa ? (
                              <CampoDeFormula
                                campoRef={celulaInputRef}
                                valor={editing.rascunho}
                                onMudar={mudarRascunho}
                                onTeclar={teclasDoEditor}
                                autoFocus
                                onBlur={() => editingRef.current?.origem === 'celula' && confirmar({ focar: false })}
                                aria-label={t('Editar {endereco}', { endereco })}
                                className="h-full w-full border-0 bg-transparent px-2 text-sm focus:outline-none"
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
                                //
                                // Texto que transborda fica MAIS LARGO que a
                                // célula e acima das vizinhas (`z-index`), que
                                // pintam o fundo delas por baixo dele.
                                style={{
                                  pointerEvents: 'none',
                                  ...(!previa ? cssDoTexto(estilo) : {}),
                                  ...(estende[colIndex] && !previa
                                    ? { width: (column.width ?? 160) + estende[colIndex], position: 'relative', zIndex: 1 }
                                    : {}),
                                }}
                                title={error || undefined}
                                className={cn(
                                  // `h-full`, não `h-8`: com altura fixa igual
                                  // à do `td` o conteúdo estourava a célula por
                                  // causa da borda, e sobrava uma faixa pintada
                                  // encostando na linha de cima.
                                  'flex h-full items-center px-2',
                                  estilo?.wrap && !previa ? 'whitespace-pre-wrap break-words py-1' : 'truncate',
                                  !previa && JUSTIFICAR[alinhar],
                                  numeroAqui && !previa && 'tabular-nums',
                                  column.type === 'url' && !previa && 'text-accent-600 underline',
                                  previa && 'font-mono text-[13px]',
                                  error && !previa && 'text-red-600 dark:text-red-400',
                                )}
                              >
                                {previa ? editing.rascunho : text}
                              </div>
                            )}
                            {alca}
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
                      type="button"
                      onClick={addRow}
                      className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-ink-400 transition hover:bg-ink-50 hover:text-ink-600 dark:hover:bg-ink-900"
                    >
                      <Plus size={13} /> {t('Nova linha')}
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
        {rodape}
      </div>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        // Fechado o menu, o teclado volta para a grade: escolher "Inserir
        // linha" e seguir com as setas, sem precisar clicar de novo.
        onClose={() => {
          closeMenu()
          focarGrade()
        }}
        items={menu ? itensDoMenuDaCelula() : []}
      />
    </div>
  )
}

/** TSV comparável depois de ida e volta pela área de transferência (que troca \n por \r\n). */
function normalizarTSV(texto) {
  return String(texto ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
}

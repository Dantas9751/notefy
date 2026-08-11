import { nodeRect } from '@/lib/graph'
import { cn } from '@/lib/utils'

/**
 * Alças de redimensionamento.
 *
 * `fx`/`fy` são a posição relativa dentro do nó (0 = borda inicial,
 * 0.5 = meio, 1 = borda final), e o `id` diz quais lados aquela alça
 * move — é o que o editor usa para recalcular x/y/w/h.
 */
const RESIZE_HANDLES = [
  { id: 'nw', fx: 0, fy: 0, cursor: 'cursor-nwse-resize' },
  { id: 'n', fx: 0.5, fy: 0, cursor: 'cursor-ns-resize' },
  { id: 'ne', fx: 1, fy: 0, cursor: 'cursor-nesw-resize' },
  { id: 'e', fx: 1, fy: 0.5, cursor: 'cursor-ew-resize' },
  { id: 'se', fx: 1, fy: 1, cursor: 'cursor-nwse-resize' },
  { id: 's', fx: 0.5, fy: 1, cursor: 'cursor-ns-resize' },
  { id: 'sw', fx: 0, fy: 1, cursor: 'cursor-nesw-resize' },
  { id: 'w', fx: 0, fy: 0.5, cursor: 'cursor-ew-resize' },
]

/**
 * Desenho de um nó em SVG.
 *
 * Um `switch` sobre `shape` cobre as famílias UML (classe, ator, caso de
 * uso, sequência, atividade, ER), o fluxograma e as formas livres do
 * whiteboard. O componente é o mesmo nos dois editores: só o `type` muda.
 */

/* -------------------------------------------------------------------- */
/* Texto                                                                */
/* -------------------------------------------------------------------- */

function wrapText(text, maxChars) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  words.forEach((word) => {
    if ((`${current} ${word}`).trim().length > maxChars) {
      if (current) lines.push(current)
      current = word
    } else {
      current = (`${current} ${word}`).trim()
    }
  })
  if (current) lines.push(current)
  return lines
}

function TextBlock({ text, rect, className, startY = 22, lineHeight = 15, maxLines = 8, x = 10 }) {
  const lines = wrapText(text, Math.max(10, Math.floor(rect.w / 7))).slice(0, maxLines)
  return lines.map((line, i) => (
    <text key={i} x={x} y={startY + i * lineHeight} className={className}>
      {line}
    </text>
  ))
}

function CenteredLabel({ text, rect, className, dy = 4 }) {
  const lines = wrapText(text, Math.max(8, Math.floor(rect.w / 7))).slice(0, 3)
  const start = rect.h / 2 + dy - ((lines.length - 1) * 14) / 2
  return lines.map((line, i) => (
    <text
      key={i}
      x={rect.w / 2}
      y={start + i * 14}
      textAnchor="middle"
      className={className}
    >
      {line}
    </text>
  ))
}

/* -------------------------------------------------------------------- */
/* Formas compostas                                                     */
/* -------------------------------------------------------------------- */

const STEREOTYPE = {
  interface: '«interface»',
  abstract: '«abstract»',
  enum: '«enumeration»',
  boundary: '«boundary»',
  control: '«control»',
  entity: '«entity»',
}

function Compartment({ node, rect, accent }) {
  const fields = node.fields ?? []
  const methods = node.methods ?? []
  const stereotype = node.stereotype || STEREOTYPE[node.type]

  const headerH = stereotype ? 42 : 30
  const bodyH = rect.h - headerH
  const fieldsH = fields.length && methods.length ? bodyH * 0.5 : fields.length ? bodyH : 0

  return (
    <>
      <rect
        width={rect.w}
        height={rect.h}
        rx={3}
        className="fill-white dark:fill-ink-900"
        stroke={accent}
        strokeWidth={1.5}
      />
      <rect width={rect.w} height={headerH} rx={3} fill={accent} fillOpacity={0.12} />
      {stereotype && (
        <text x={rect.w / 2} y={15} textAnchor="middle" className="fill-ink-400 text-[9px] italic">
          {stereotype}
        </text>
      )}
      <text
        x={rect.w / 2}
        y={stereotype ? 33 : 20}
        textAnchor="middle"
        className={cn(
          'fill-ink-900 text-[12px] font-semibold dark:fill-ink-50',
          node.type === 'abstract' && 'italic',
        )}
      >
        {node.text || 'Classe'}
      </text>

      <line x1={0} y1={headerH} x2={rect.w} y2={headerH} stroke={accent} strokeWidth={1} />

      {fields.map((field, i) => (
        <text key={`f${i}`} x={8} y={headerH + 15 + i * 14} className="fill-ink-600 text-[10px] dark:fill-ink-300">
          {field}
        </text>
      ))}

      {methods.length > 0 && fields.length > 0 && (
        <line
          x1={0}
          y1={headerH + fieldsH}
          x2={rect.w}
          y2={headerH + fieldsH}
          stroke={accent}
          strokeWidth={1}
          strokeOpacity={0.5}
        />
      )}

      {methods.map((method, i) => (
        <text
          key={`m${i}`}
          x={8}
          y={headerH + fieldsH + 15 + i * 14}
          className="fill-ink-600 text-[10px] dark:fill-ink-300"
        >
          {method}
        </text>
      ))}
    </>
  )
}

function Actor({ node, rect, accent }) {
  const cx = rect.w / 2
  return (
    <>
      <circle cx={cx} cy={16} r={13} fill="none" stroke={accent} strokeWidth={2} />
      <line x1={cx} y1={29} x2={cx} y2={62} stroke={accent} strokeWidth={2} />
      <line x1={cx - 20} y1={40} x2={cx + 20} y2={40} stroke={accent} strokeWidth={2} />
      <line x1={cx} y1={62} x2={cx - 16} y2={86} stroke={accent} strokeWidth={2} />
      <line x1={cx} y1={62} x2={cx + 16} y2={86} stroke={accent} strokeWidth={2} />
      <text x={cx} y={rect.h - 4} textAnchor="middle" className="fill-ink-800 text-[11px] font-medium dark:fill-ink-100">
        {node.text || 'Ator'}
      </text>
    </>
  )
}

function Lifeline({ node, rect, accent }) {
  const headH = 44
  return (
    <>
      <rect width={rect.w} height={headH} rx={3} className="fill-white dark:fill-ink-900" stroke={accent} strokeWidth={1.5} />
      <CenteredLabel
        text={node.text || 'Objeto'}
        rect={{ ...rect, h: headH }}
        className="fill-ink-900 text-[11px] font-medium dark:fill-ink-50"
      />
      {/* A linha tracejada que desce é o que distingue uma linha de vida
          de uma caixa qualquer no diagrama de sequência. */}
      <line
        x1={rect.w / 2}
        y1={headH}
        x2={rect.w / 2}
        y2={rect.h}
        stroke={accent}
        strokeWidth={1.5}
        strokeDasharray="6 5"
      />
    </>
  )
}

function Fragment({ node, rect, accent }) {
  const tagW = 66
  const tagH = 22
  return (
    <>
      <rect width={rect.w} height={rect.h} className="fill-transparent" stroke={accent} strokeWidth={1.5} />
      <path
        d={`M0,0 L${tagW},0 L${tagW},${tagH - 8} L${tagW - 10},${tagH} L0,${tagH} Z`}
        fill={accent}
        fillOpacity={0.15}
        stroke={accent}
        strokeWidth={1.2}
      />
      <text x={8} y={15} className="fill-ink-700 text-[10px] font-semibold dark:fill-ink-200">
        {node.label || 'alt'}
      </text>
      <text x={tagW + 8} y={15} className="fill-ink-500 text-[10px] dark:fill-ink-400">
        {node.text || ''}
      </text>
    </>
  )
}

/* -------------------------------------------------------------------- */
/* Nó                                                                   */
/* -------------------------------------------------------------------- */

export default function GraphNode({
  node,
  palette,
  selected,
  connecting,
  onPointerDown,
  onDoubleClick,
  onStartConnection,
  onResize,
}) {
  const rect = nodeRect(node, palette)
  const preset = palette[node.type] ?? { shape: 'rect' }
  const accent = node.color || '#6366F1'
  const fill = node.fill

  const surface = (extra = {}) => ({
    className: fill ? undefined : 'fill-white dark:fill-ink-900',
    fill: fill || undefined,
    stroke: accent,
    strokeWidth: 1.5,
    ...extra,
  })

  const body = () => {
    switch (preset.shape) {
      case 'compartment':
        return <Compartment node={node} rect={rect} accent={accent} />
      case 'actor':
        return <Actor node={node} rect={rect} accent={accent} />
      case 'lifeline':
        return <Lifeline node={node} rect={rect} accent={accent} />
      case 'fragment':
        return <Fragment node={node} rect={rect} accent={accent} />

      case 'sticky':
        return (
          <>
            <rect
              width={rect.w}
              height={rect.h}
              rx={2}
              fill={fill || '#FEF08A'}
              stroke="rgba(0,0,0,0.08)"
            />
            {/* Dobra no canto: dá o volume que faz o post-it parecer papel. */}
            <path d={`M${rect.w - 22},${rect.h} L${rect.w},${rect.h - 22} L${rect.w},${rect.h} Z`} fill="rgba(0,0,0,0.10)" />
            <TextBlock
              text={node.text || ''}
              rect={rect}
              className="fill-ink-800 text-[12px]"
              startY={26}
              lineHeight={17}
            />
          </>
        )

      case 'ellipse':
        return (
          <>
            <ellipse cx={rect.w / 2} cy={rect.h / 2} rx={rect.w / 2 - 1} ry={rect.h / 2 - 1} {...surface()} />
            <CenteredLabel text={node.text || preset.label} rect={rect} className="fill-ink-800 text-[11px] font-medium dark:fill-ink-100" />
          </>
        )

      case 'key-ellipse':
        return (
          <>
            <ellipse cx={rect.w / 2} cy={rect.h / 2} rx={rect.w / 2 - 1} ry={rect.h / 2 - 1} {...surface()} />
            <CenteredLabel text={node.text || 'chave'} rect={rect} className="fill-ink-800 text-[11px] font-medium underline dark:fill-ink-100" />
          </>
        )

      case 'diamond':
        return (
          <>
            <polygon
              points={`${rect.w / 2},1 ${rect.w - 1},${rect.h / 2} ${rect.w / 2},${rect.h - 1} 1,${rect.h / 2}`}
              {...surface()}
            />
            <CenteredLabel text={node.text || preset.label} rect={rect} className="fill-ink-800 text-[10px] dark:fill-ink-100" />
          </>
        )

      case 'rounded':
        return (
          <>
            <rect width={rect.w} height={rect.h} rx={Math.min(18, rect.h / 3)} {...surface()} />
            <CenteredLabel text={node.text || preset.label} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'stadium':
        return (
          <>
            <rect width={rect.w} height={rect.h} rx={rect.h / 2} {...surface()} />
            <CenteredLabel text={node.text || preset.label} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'double-rect':
        return (
          <>
            <rect width={rect.w} height={rect.h} {...surface()} />
            <rect x={4} y={4} width={rect.w - 8} height={rect.h - 8} fill="none" stroke={accent} strokeWidth={1.2} />
            <CenteredLabel text={node.text || 'Entidade'} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'parallelogram':
        return (
          <>
            <polygon
              points={`${rect.w * 0.18},1 ${rect.w - 1},1 ${rect.w * 0.82},${rect.h - 1} 1,${rect.h - 1}`}
              {...surface()}
            />
            <CenteredLabel text={node.text || 'Entrada'} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'trapezoid':
        return (
          <>
            <polygon
              points={`${rect.w * 0.15},1 ${rect.w * 0.85},1 ${rect.w - 1},${rect.h - 1} 1,${rect.h - 1}`}
              {...surface()}
            />
            <CenteredLabel text={node.text || 'Manual'} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'delay':
        return (
          <>
            <path
              d={`M1,1 L${rect.w * 0.7},1 A${rect.h / 2},${rect.h / 2} 0 0 1 ${rect.w * 0.7},${rect.h - 1} L1,${rect.h - 1} Z`}
              {...surface()}
            />
            <CenteredLabel text={node.text || 'Espera'} rect={{ ...rect, w: rect.w * 0.8 }} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'cylinder':
        return (
          <>
            <path
              d={`M1,14 A${rect.w / 2 - 1},13 0 0 1 ${rect.w - 1},14 L${rect.w - 1},${rect.h - 14} A${rect.w / 2 - 1},13 0 0 1 1,${rect.h - 14} Z`}
              {...surface()}
            />
            <ellipse cx={rect.w / 2} cy={14} rx={rect.w / 2 - 1} ry={13} fill="none" stroke={accent} strokeWidth={1.5} />
            <CenteredLabel text={node.text || 'Dados'} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'document':
        return (
          <>
            <path
              d={`M1,1 L${rect.w - 1},1 L${rect.w - 1},${rect.h - 16} Q${rect.w * 0.75},${rect.h - 2} ${rect.w / 2},${rect.h - 12} Q${rect.w * 0.25},${rect.h - 22} 1,${rect.h - 12} Z`}
              {...surface()}
            />
            <CenteredLabel text={node.text || 'Documento'} rect={{ ...rect, h: rect.h - 12 }} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'hexagon':
        return (
          <>
            <polygon
              points={`${rect.w * 0.22},1 ${rect.w * 0.78},1 ${rect.w - 1},${rect.h / 2} ${rect.w * 0.78},${rect.h - 1} ${rect.w * 0.22},${rect.h - 1} 1,${rect.h / 2}`}
              {...surface()}
            />
            <CenteredLabel text={node.text || 'Hexágono'} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'triangle':
        return (
          <>
            <polygon points={`${rect.w / 2},1 ${rect.w - 1},${rect.h - 1} 1,${rect.h - 1}`} {...surface()} />
            <CenteredLabel text={node.text || ''} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" dy={14} />
          </>
        )

      case 'star': {
        const cx = rect.w / 2
        const cy = rect.h / 2
        const outer = Math.min(cx, cy) - 2
        const inner = outer * 0.42
        const points = Array.from({ length: 10 }, (_, i) => {
          const radius = i % 2 ? inner : outer
          const angle = (Math.PI / 5) * i - Math.PI / 2
          return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
        }).join(' ')
        return <polygon points={points} {...surface()} />
      }

      case 'arrow-shape':
        return (
          <polygon
            points={`1,${rect.h * 0.3} ${rect.w * 0.65},${rect.h * 0.3} ${rect.w * 0.65},1 ${rect.w - 1},${rect.h / 2} ${rect.w * 0.65},${rect.h - 1} ${rect.w * 0.65},${rect.h * 0.7} 1,${rect.h * 0.7}`}
            {...surface()}
          />
        )

      case 'bar':
        return <rect width={rect.w} height={rect.h} rx={rect.h / 2} fill={accent} />

      case 'filled-circle':
        return <circle cx={rect.w / 2} cy={rect.h / 2} r={Math.min(rect.w, rect.h) / 2 - 2} fill={accent} />

      case 'end-circle':
        return (
          <>
            <circle cx={rect.w / 2} cy={rect.h / 2} r={Math.min(rect.w, rect.h) / 2 - 2} fill="none" stroke={accent} strokeWidth={2} />
            <circle cx={rect.w / 2} cy={rect.h / 2} r={Math.min(rect.w, rect.h) / 2 - 8} fill={accent} />
          </>
        )

      case 'boundary':
        return (
          <>
            <line x1={6} y1={10} x2={6} y2={rect.h - 24} stroke={accent} strokeWidth={2} />
            <circle cx={rect.w / 2 + 6} cy={(rect.h - 14) / 2} r={Math.min(rect.w / 2 - 12, (rect.h - 24) / 2)} fill="none" stroke={accent} strokeWidth={1.8} />
            <line x1={6} y1={(rect.h - 14) / 2} x2={20} y2={(rect.h - 14) / 2} stroke={accent} strokeWidth={2} />
            <text x={rect.w / 2} y={rect.h - 3} textAnchor="middle" className="fill-ink-800 text-[10px] dark:fill-ink-100">
              {node.text || 'Fronteira'}
            </text>
          </>
        )

      case 'control':
        return (
          <>
            <circle cx={rect.w / 2} cy={(rect.h - 14) / 2} r={Math.min(rect.w, rect.h - 24) / 2 - 2} fill="none" stroke={accent} strokeWidth={1.8} />
            <path d={`M${rect.w / 2 - 6},4 L${rect.w / 2},12 L${rect.w / 2 + 6},4`} fill="none" stroke={accent} strokeWidth={1.8} />
            <text x={rect.w / 2} y={rect.h - 3} textAnchor="middle" className="fill-ink-800 text-[10px] dark:fill-ink-100">
              {node.text || 'Controle'}
            </text>
          </>
        )

      case 'entity':
        return (
          <>
            <circle cx={rect.w / 2} cy={(rect.h - 20) / 2} r={Math.min(rect.w, rect.h - 26) / 2 - 2} fill="none" stroke={accent} strokeWidth={1.8} />
            <line x1={rect.w / 2 - 18} y1={rect.h - 20} x2={rect.w / 2 + 18} y2={rect.h - 20} stroke={accent} strokeWidth={2} />
            <text x={rect.w / 2} y={rect.h - 4} textAnchor="middle" className="fill-ink-800 text-[10px] dark:fill-ink-100">
              {node.text || 'Entidade'}
            </text>
          </>
        )

      case 'component':
        return (
          <>
            <rect x={10} width={rect.w - 10} height={rect.h} {...surface()} />
            <rect x={1} y={16} width={20} height={13} {...surface({ strokeWidth: 1.2 })} />
            <rect x={1} y={40} width={20} height={13} {...surface({ strokeWidth: 1.2 })} />
            <text x={(rect.w + 10) / 2 + 5} y={rect.h / 2 + 4} textAnchor="middle" className="fill-ink-800 text-[11px] font-medium dark:fill-ink-100">
              {node.text || 'Componente'}
            </text>
          </>
        )

      case 'cube':
        return (
          <>
            <polygon points={`1,14 14,1 ${rect.w - 1},1 ${rect.w - 1},${rect.h - 14} ${rect.w - 14},${rect.h - 1} 1,${rect.h - 1}`} {...surface()} />
            <polyline points={`1,14 ${rect.w - 14},14 ${rect.w - 1},1`} fill="none" stroke={accent} strokeWidth={1.2} />
            <line x1={rect.w - 14} y1={14} x2={rect.w - 14} y2={rect.h - 1} stroke={accent} strokeWidth={1.2} />
            <text x={(rect.w - 14) / 2} y={rect.h / 2 + 4} textAnchor="middle" className="fill-ink-800 text-[11px] dark:fill-ink-100">
              {node.text || 'Nó'}
            </text>
          </>
        )

      case 'package':
        return (
          <>
            <path d={`M1,18 L1,1 L70,1 L70,18 L${rect.w - 1},18 L${rect.w - 1},${rect.h - 1} L1,${rect.h - 1} Z`} {...surface()} />
            <text x={8} y={14} className="fill-ink-700 text-[10px] font-medium dark:fill-ink-200">
              {node.text || 'pacote'}
            </text>
          </>
        )

      case 'cloud':
        return (
          <>
            <path
              d={`M${rect.w * 0.25},${rect.h - 10} a${rect.w * 0.18},${rect.h * 0.2} 0 0 1 0,-${rect.h * 0.36} a${rect.w * 0.2},${rect.h * 0.24} 0 0 1 ${rect.w * 0.28},-${rect.h * 0.2} a${rect.w * 0.22},${rect.h * 0.26} 0 0 1 ${rect.w * 0.34},${rect.h * 0.12} a${rect.w * 0.16},${rect.h * 0.2} 0 0 1 0,${rect.h * 0.44} Z`}
              {...surface()}
            />
            <CenteredLabel text={node.text || ''} rect={rect} className="fill-ink-800 text-[11px] dark:fill-ink-100" />
          </>
        )

      case 'note':
        return (
          <>
            <path d={`M1,1 L${rect.w - 16},1 L${rect.w - 1},16 L${rect.w - 1},${rect.h - 1} L1,${rect.h - 1} Z`} className="fill-amber-50 dark:fill-amber-500/10" stroke={accent} strokeWidth={1.5} />
            <path d={`M${rect.w - 16},1 L${rect.w - 16},16 L${rect.w - 1},16`} fill="none" stroke={accent} strokeWidth={1.5} />
            <TextBlock text={node.text || 'Anotação'} rect={rect} className="fill-ink-700 text-[10px] dark:fill-ink-200" />
          </>
        )

      case 'group':
        return (
          <>
            <rect width={rect.w} height={rect.h} rx={10} fill={accent} fillOpacity={0.06} stroke={accent} strokeWidth={1.5} strokeDasharray="8 5" />
            <text x={12} y={20} className="text-[11px] font-semibold" fill={accent}>
              {node.text || 'Área'}
            </text>
          </>
        )

      case 'image':
        return node.url ? (
          <image href={node.url} width={rect.w} height={rect.h} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <>
            <rect width={rect.w} height={rect.h} rx={6} className="fill-ink-100 dark:fill-ink-800" stroke={accent} strokeWidth={1.5} strokeDasharray="5 4" />
            <CenteredLabel text="Cole uma URL de imagem" rect={rect} className="fill-ink-400 text-[10px]" />
          </>
        )

      case 'bare':
        return (
          <TextBlock
            text={node.text || 'Texto'}
            rect={rect}
            x={2}
            startY={20}
            lineHeight={18}
            className="fill-ink-900 text-[14px] dark:fill-ink-50"
          />
        )

      case 'bare-large':
        return (
          <text x={2} y={rect.h / 2 + 8} className="fill-ink-900 text-[22px] font-semibold dark:fill-ink-50">
            {node.text || 'Título'}
          </text>
        )

      default:
        return (
          <>
            <rect width={rect.w} height={rect.h} rx={preset.shape === 'rect' ? 4 : 8} {...surface()} />
            {node.type === 'link' || node.type === 'document' ? (
              <>
                <text x={12} y={26} className="fill-ink-900 text-[12px] font-medium dark:fill-ink-50">
                  {(node.text || (node.type === 'link' ? 'Link' : 'Documento')).slice(0, 26)}
                </text>
                <text x={12} y={46} className="fill-ink-400 text-[10px]">
                  {(node.url || node.documentId || '—').slice(0, 34)}
                </text>
              </>
            ) : (
              <TextBlock
                text={node.text || preset.label || ''}
                rect={rect}
                className="fill-ink-700 text-[11px] dark:fill-ink-200"
                startY={24}
                lineHeight={16}
              />
            )}
          </>
        )
    }
  }

  return (
    <g
      transform={`translate(${rect.x}, ${rect.y})`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="cursor-move"
    >
      {selected && (
        <rect
          x={-5}
          y={-5}
          width={rect.w + 10}
          height={rect.h + 10}
          rx={8}
          fill="none"
          className="stroke-accent-500"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      {body()}

      {selected && (
        <>
          {/* Alça de conexão — fica ACIMA da borda direita para não
              disputar espaço com a alça de redimensionar do meio. */}
          <circle
            cx={rect.w + 14}
            cy={rect.h / 2}
            r={6}
            className={cn(
              'cursor-crosshair fill-accent-500 stroke-white stroke-2',
              connecting && 'fill-emerald-500',
            )}
            onPointerDown={(e) => {
              e.stopPropagation()
              onStartConnection(e)
            }}
          />

          {/* Oito alças, como em qualquer editor gráfico: os cantos mudam
              as duas dimensões, as bordas mudam só uma. */}
          {RESIZE_HANDLES.map((handle) => (
            <rect
              key={handle.id}
              x={rect.w * handle.fx - 4}
              y={rect.h * handle.fy - 4}
              width={8}
              height={8}
              rx={1.5}
              className={cn('fill-white stroke-accent-500 stroke-[1.5]', handle.cursor)}
              onPointerDown={(e) => {
                e.stopPropagation()
                onResize?.(e, handle.id)
              }}
            />
          ))}
        </>
      )}
    </g>
  )
}

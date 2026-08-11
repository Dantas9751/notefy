import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Brush,
  Circle,
  Eraser,
  Highlighter,
  Maximize,
  Minus,
  MousePointer2,
  Palette,
  PenLine,
  Plus,
  Slash,
  Square,
  Trash2,
  Triangle,
  Type,
  X,
} from 'lucide-react'
import {
  DRAWABLE_SHAPES,
  NODE_COLORS,
  STICKY_COLORS,
  STROKE_TOOLS,
  STROKE_WIDTHS,
  clampZoom,
  edgeGeometry,
  edgePath,
  fitViewport,
  nodeRect,
  paletteFor,
  rectBetween,
  strokeHitsPoint,
  strokePath,
  toWorld,
  uid,
} from '@/lib/graph'
import { cn } from '@/lib/utils'
import GraphNode from './GraphNode'

/**
 * Motor de nós e setas, compartilhado por Diagrama e Canvas.
 *
 * A mecânica é idêntica nos dois — arrastar move, a alça conecta, duplo
 * clique edita, Ctrl+roda dá zoom. O canvas ganha por cima as ferramentas
 * de quadro branco (caneta, marca-texto, borracha), que o diagrama não
 * mostra: lá o traço à mão livre só atrapalharia o rigor das formas.
 */

const GRID = 20
const ERASER_TOLERANCE = 10

const MARKERS = {
  arrow: 'arrow',
  'open-arrow': 'open-arrow',
  triangle: 'triangle',
  'diamond-filled': 'diamond-filled',
  'diamond-hollow': 'diamond-hollow',
  crowfoot: 'crowfoot',
  bar: 'bar',
  'circle-bar': 'circle-bar',
  cross: 'cross',
}

export default function GraphEditor({ kind, data, onChange }) {
  const palette = useMemo(() => paletteFor(kind), [kind])
  const isCanvas = kind === 'canvas'

  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []
  const strokes = data?.strokes ?? []
  const viewport = data?.viewport ?? { x: 0, y: 0, zoom: 1 }

  const svgRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [drag, setDrag] = useState(null)
  const [connecting, setConnecting] = useState(null)
  const [edgeType, setEdgeType] = useState(palette.defaultEdge)
  const [editingNode, setEditingNode] = useState(null)
  const [openGroup, setOpenGroup] = useState(palette.groups[0]?.id)

  // Ferramentas do whiteboard. `select` é o modo do diagrama e o padrão
  // do canvas: desenhar só começa quando o usuário escolhe uma caneta,
  // uma forma ou o texto.
  const [tool, setTool] = useState('select')
  const [inkColor, setInkColor] = useState('#1a1816')
  const [inkWidth, setInkWidth] = useState(3)
  const [drawing, setDrawing] = useState(null)
  //: Retângulo elástico enquanto o usuário arrasta para desenhar a forma.
  const [rubber, setRubber] = useState(null)

  const isStrokeTool = tool in STROKE_TOOLS
  const isShapeTool = DRAWABLE_SHAPES.includes(tool)

  const update = useCallback((patch) => onChange({ ...data, ...patch }), [data, onChange])
  const setViewport = useCallback((next) => update({ viewport: next }), [update])

  const pointerWorld = useCallback(
    (event) => {
      const box = svgRef.current.getBoundingClientRect()
      return toWorld({ x: event.clientX - box.left, y: event.clientY - box.top }, viewport)
    },
    [viewport],
  )

  /* ------------------------------------------------------------------ */
  /* Criação                                                            */
  /* ------------------------------------------------------------------ */
  /** Monta um nó do tipo pedido; `bounds` vem do arraste, quando houver. */
  const buildNode = (type, bounds) => {
    const preset = palette.nodes[type]
    return {
      id: uid('n'),
      type,
      x: Math.round((bounds?.x ?? 0) / GRID) * GRID,
      y: Math.round((bounds?.y ?? 0) / GRID) * GRID,
      w: Math.max(20, Math.round((bounds?.w ?? preset.w) / 10) * 10),
      h: Math.max(20, Math.round((bounds?.h ?? preset.h) / 10) * 10),
      text: '',
      color: NODE_COLORS[nodes.length % NODE_COLORS.length],
      ...(type === 'sticky' ? { fill: STICKY_COLORS[nodes.length % STICKY_COLORS.length] } : {}),
      ...(['class', 'interface', 'abstract', 'enum'].includes(type)
        ? { fields: [], methods: [] }
        : {}),
    }
  }

  const addNode = (type) => {
    const preset = palette.nodes[type]
    // Nasce no centro da área visível, e não em (0,0), que poderia estar
    // fora da tela depois de o usuário navegar pelo quadro.
    const box = svgRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 }
    const middle = toWorld({ x: box.width / 2, y: box.height / 2 }, viewport)

    const node = buildNode(type, {
      x: middle.x - preset.w / 2,
      y: middle.y - preset.h / 2,
      w: preset.w,
      h: preset.h,
    })
    update({ nodes: [...nodes, node] })
    setSelected(node.id)
    setTool('select')
    setEditingNode(node.id)
  }

  const updateNode = (id, patch) =>
    update({ nodes: nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })

  const deleteNode = (id) =>
    update({
      nodes: nodes.filter((n) => n.id !== id),
      // Arestas órfãs quebrariam a renderização e o backend as rejeita.
      edges: edges.filter((e) => e.from !== id && e.to !== id),
    })

  const deleteEdge = (id) => update({ edges: edges.filter((e) => e.id !== id) })

  /* ------------------------------------------------------------------ */
  /* Ponteiro                                                           */
  /* ------------------------------------------------------------------ */
  const handleNodePointerDown = (event, node) => {
    if (tool !== 'select') return
    event.stopPropagation()
    setSelected(node.id)
    const world = pointerWorld(event)
    setDrag({ mode: 'move', id: node.id, dx: world.x - node.x, dy: world.y - node.y })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleResizeStart = (event, node, handle) => {
    setSelected(node.id)
    setDrag({
      mode: 'resize',
      id: node.id,
      handle,
      // Guarda o retângulo e o ponteiro do início: redimensionar é
      // sempre relativo ao gesto, e recalcular a partir do estado atual
      // acumularia erro a cada evento.
      origin: pointerWorld(event),
      rect: nodeRect(node, palette.nodes),
    })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  /** Novo retângulo conforme a alça arrastada. */
  const resizedRect = (drag, world) => {
    const { rect, origin, handle } = drag
    const dx = world.x - origin.x
    const dy = world.y - origin.y

    let { x, y, w, h } = rect
    if (handle.includes('e')) w = rect.w + dx
    if (handle.includes('s')) h = rect.h + dy
    // Puxar pela borda esquerda/superior move a origem e encolhe na mesma
    // medida — senão a forma escaparia do cursor.
    if (handle.includes('w')) {
      x = rect.x + dx
      w = rect.w - dx
    }
    if (handle.includes('n')) {
      y = rect.y + dy
      h = rect.h - dy
    }

    const snap = (v) => Math.round(v / 10) * 10
    // Trava no mínimo sem deixar a origem passar do lado oposto.
    if (w < 20) {
      if (handle.includes('w')) x = rect.x + rect.w - 20
      w = 20
    }
    if (h < 20) {
      if (handle.includes('n')) y = rect.y + rect.h - 20
      h = 20
    }
    return { x: snap(x), y: snap(y), w: snap(w), h: snap(h) }
  }

  const handleCanvasPointerDown = (event) => {
    if (event.target !== svgRef.current && !event.target.dataset.canvasBackground) return

    if (tool === 'select') {
      setSelected(null)
      setDrag({ mode: 'pan', startX: event.clientX, startY: event.clientY, origin: viewport })
      return
    }

    const world = pointerWorld(event)

    // Texto: um clique cria a caixa e já abre a edição, como num editor
    // de imagem — não faz sentido arrastar para dimensionar algo vazio.
    if (tool === 'text') {
      const node = buildNode('text', { x: world.x, y: world.y })
      update({ nodes: [...nodes, node] })
      setSelected(node.id)
      setEditingNode(node.id)
      setTool('select')
      return
    }

    if (isShapeTool) {
      setRubber({ origin: world, current: world })
      return
    }

    if (tool === 'eraser') {
      setDrawing({ tool: 'eraser' })
      eraseAt(world)
      return
    }

    setDrawing({
      id: uid('s'),
      tool,
      color: inkColor,
      // Marca-texto e marcador têm espessura própria; a caneta usa a
      // escolhida na barra.
      width: tool === 'pen' ? inkWidth : STROKE_TOOLS[tool].width,
      points: [[Math.round(world.x), Math.round(world.y)]],
    })
  }

  const eraseAt = (world) => {
    const remaining = strokes.filter(
      (stroke) => !strokeHitsPoint(stroke, world, ERASER_TOLERANCE),
    )
    if (remaining.length !== strokes.length) update({ strokes: remaining })
  }

  const handlePointerMove = (event) => {
    if (rubber) {
      setRubber({ ...rubber, current: pointerWorld(event) })
      return
    }

    if (drawing) {
      const world = pointerWorld(event)
      if (drawing.tool === 'eraser') {
        eraseAt(world)
        return
      }
      // Descarta amostras muito próximas: o ponteiro emite dezenas de
      // eventos por segundo e o traço viraria um payload gigante.
      const last = drawing.points[drawing.points.length - 1]
      if (Math.hypot(world.x - last[0], world.y - last[1]) < 2) return
      setDrawing({
        ...drawing,
        points: [...drawing.points, [Math.round(world.x), Math.round(world.y)]],
      })
      return
    }

    if (connecting) {
      setConnecting((c) => ({ ...c, to: pointerWorld(event) }))
      return
    }
    if (!drag) return

    if (drag.mode === 'pan') {
      setViewport({
        ...viewport,
        x: drag.origin.x + (event.clientX - drag.startX),
        y: drag.origin.y + (event.clientY - drag.startY),
      })
      return
    }

    const world = pointerWorld(event)
    if (drag.mode === 'resize') {
      updateNode(drag.id, resizedRect(drag, world))
      return
    }

    // Encaixe na grade: mantém o desenho alinhado sem precisar de régua.
    updateNode(drag.id, {
      x: Math.round((world.x - drag.dx) / GRID) * GRID,
      y: Math.round((world.y - drag.dy) / GRID) * GRID,
    })
  }

  const handlePointerUp = (event) => {
    if (rubber) {
      const bounds = rectBetween(rubber.origin, rubber.current)
      setRubber(null)
      // Um clique sem arraste vira a forma no tamanho padrão, em vez de
      // criar algo de 2px que o usuário nem consegue selecionar.
      const preset = palette.nodes[tool]
      const node = buildNode(
        tool,
        bounds.w < 12 || bounds.h < 12
          ? { x: bounds.x, y: bounds.y, w: preset.w, h: preset.h }
          : bounds,
      )
      update({ nodes: [...nodes, node] })
      setSelected(node.id)
      setTool('select')
      return
    }

    if (drawing) {
      if (drawing.tool !== 'eraser' && drawing.points.length >= 2) {
        update({ strokes: [...strokes, drawing] })
      }
      setDrawing(null)
      return
    }

    if (connecting) {
      const world = pointerWorld(event)
      const target = nodes.find((n) => {
        const rect = nodeRect(n, palette.nodes)
        return (
          world.x >= rect.x && world.x <= rect.x + rect.w &&
          world.y >= rect.y && world.y <= rect.y + rect.h
        )
      })

      if (target && target.id !== connecting.from) {
        const duplicate = edges.some(
          (e) => e.from === connecting.from && e.to === target.id && e.type === edgeType,
        )
        if (!duplicate) {
          update({
            edges: [
              ...edges,
              { id: uid('e'), type: edgeType, from: connecting.from, to: target.id, label: '' },
            ],
          })
        }
      }
      setConnecting(null)
    }
    setDrag(null)
  }

  const handleWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const box = svgRef.current.getBoundingClientRect()
    const px = event.clientX - box.left
    const py = event.clientY - box.top
    const zoom = clampZoom(viewport.zoom * (event.deltaY < 0 ? 1.1 : 0.9))
    // Zoom ancorado no cursor: o ponto sob o mouse não se move.
    setViewport({
      zoom,
      x: px - (px - viewport.x) * (zoom / viewport.zoom),
      y: py - (py - viewport.y) * (zoom / viewport.zoom),
    })
  }

  /* ------------------------------------------------------------------ */
  /* Teclado                                                            */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const onKeyDown = (event) => {
      const typing =
        ['INPUT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable
      if (typing) return

      if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        event.preventDefault()
        deleteNode(selected)
        setSelected(null)
      }
      if (event.key === 'Escape') {
        setSelected(null)
        setConnecting(null)
        setEditingNode(null)
        setTool('select')
      }
      if (isCanvas && !event.metaKey && !event.ctrlKey) {
        const shortcuts = {
          v: 'select', p: 'pen', m: 'marker', h: 'highlighter',
          e: 'eraser', t: 'text', r: 'rect', o: 'ellipse', l: 'line_shape',
        }
        if (shortcuts[event.key]) setTool(shortcuts[event.key])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const zoomBy = (factor) => setViewport({ ...viewport, zoom: clampZoom(viewport.zoom * factor) })

  const fit = () => {
    const box = svgRef.current?.getBoundingClientRect()
    if (box) setViewport(fitViewport(nodes, strokes, palette.nodes, box.width, box.height))
  }

  const selectedNode = nodes.find((n) => n.id === selected)
  const editing = nodes.find((n) => n.id === editingNode)

  return (
    <div className="flex min-h-0 flex-1">
      {/* Paleta */}
      <div className="w-48 shrink-0 overflow-y-auto border-r border-ink-100 p-2 dark:border-ink-800">
        {isCanvas && (
          <>
            <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Ferramentas
            </p>
            <div className="grid grid-cols-5 gap-1">
              {[
                { id: 'select', icon: MousePointer2, title: 'Selecionar (V)' },
                { id: 'pen', icon: PenLine, title: 'Caneta (P)' },
                { id: 'marker', icon: Brush, title: 'Marcador (M)' },
                { id: 'highlighter', icon: Highlighter, title: 'Marca-texto (H)' },
                { id: 'eraser', icon: Eraser, title: 'Borracha (E)' },
                { id: 'text', icon: Type, title: 'Texto (T) — clique para escrever' },
                { id: 'rect', icon: Square, title: 'Retângulo (R) — arraste para desenhar' },
                { id: 'ellipse', icon: Circle, title: 'Elipse (O) — arraste para desenhar' },
                { id: 'triangle', icon: Triangle, title: 'Triângulo — arraste para desenhar' },
                { id: 'line_shape', icon: Slash, title: 'Linha (L) — arraste para desenhar' },
              ].map((item) => (
                <button
                  key={item.id}
                  title={item.title}
                  onClick={() => setTool(item.id)}
                  className={cn(
                    'flex items-center justify-center rounded-md p-2 transition',
                    tool === item.id
                      ? 'bg-accent-600 text-white'
                      : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800',
                  )}
                >
                  <item.icon size={14} />
                </button>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {['#1a1816', ...NODE_COLORS.slice(0, 8)].map((color) => (
                <button
                  key={color}
                  onClick={() => setInkColor(color)}
                  style={{ backgroundColor: color }}
                  aria-label={`Tinta ${color}`}
                  className={cn(
                    'h-5 w-5 rounded-full border-2 transition',
                    inkColor === color ? 'border-accent-500' : 'border-transparent',
                  )}
                />
              ))}
            </div>

            {tool === 'pen' && (
              <div className="mt-2 flex items-center gap-1.5 px-1">
                <span className="text-[10px] text-ink-400">Espessura</span>
                {STROKE_WIDTHS.map((width) => (
                  <button
                    key={width}
                    onClick={() => setInkWidth(width)}
                    aria-label={`Espessura ${width}`}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded transition',
                      inkWidth === width ? 'bg-accent-100 dark:bg-accent-500/25' : 'hover:bg-ink-100 dark:hover:bg-ink-800',
                    )}
                  >
                    <span
                      className="rounded-full bg-ink-600 dark:bg-ink-300"
                      style={{ width: Math.min(width, 12), height: Math.min(width, 12) }}
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <p className="px-1 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          Formas
        </p>
        {palette.groups.map((group) => (
          <div key={group.id} className="mb-1">
            <button
              onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
              className="flex w-full items-center justify-between rounded px-1.5 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              {group.label}
              <Plus
                size={11}
                className={cn('transition-transform', openGroup === group.id && 'rotate-45')}
              />
            </button>
            {openGroup === group.id && (
              <div className="space-y-0.5 pt-0.5">
                {Object.entries(group.types).map(([type, preset]) => (
                  <button
                    key={type}
                    onClick={() => addNode(type)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <p className="px-1 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          Conector
        </p>
        {palette.edgeGroups.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-400">
              {group.label}
            </p>
            {Object.entries(group.types).map(([type, preset]) => (
              <button
                key={type}
                onClick={() => setEdgeType(type)}
                className={cn(
                  'flex w-full items-center rounded-md px-2 py-1 text-left text-xs transition',
                  edgeType === type
                    ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                    : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        ))}

        <p className="mt-3 rounded bg-ink-50 p-2 text-[10px] leading-relaxed text-ink-400 dark:bg-ink-800/60">
          {isCanvas
            ? 'Caneta desenha à mão livre. Forma: arraste para definir o tamanho. Texto: clique e escreva. No modo seleção, arraste para mover, puxe a bolinha para conectar e o quadradinho para redimensionar.'
            : 'Arraste para mover. Puxe a bolinha para conectar e o quadradinho para redimensionar. Duplo clique edita.'}{' '}
          Ctrl+roda dá zoom. Delete apaga.
        </p>
      </div>

      {/* Área de desenho */}
      <div className="relative min-w-0 flex-1">
        <svg
          ref={svgRef}
          className={cn(
            'h-full w-full touch-none select-none bg-ink-50/40 dark:bg-ink-900/30',
            tool === 'eraser' && 'cursor-cell',
            tool === 'text' && 'cursor-text',
            (isStrokeTool || isShapeTool) && tool !== 'eraser' && 'cursor-crosshair',
          )}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        >
          <defs>
            <pattern
              id="grid"
              width={GRID * viewport.zoom}
              height={GRID * viewport.zoom}
              patternUnits="userSpaceOnUse"
              x={viewport.x}
              y={viewport.y}
            >
              <circle cx={1} cy={1} r={1} className="fill-ink-300/50 dark:fill-ink-700/50" />
            </pattern>

            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-ink-500 dark:fill-ink-400" />
            </marker>
            <marker id="open-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10" fill="none" className="stroke-ink-500 dark:stroke-ink-400" strokeWidth={1.5} />
            </marker>
            <marker id="triangle" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
              <path d="M 0 0 L 12 6 L 0 12 z" className="fill-white stroke-ink-500 dark:fill-ink-900 dark:stroke-ink-400" strokeWidth={1.5} />
            </marker>
            <marker id="diamond-filled" viewBox="0 0 14 10" refX="1" refY="5" markerWidth="12" markerHeight="10" orient="auto-start-reverse">
              <path d="M 0 5 L 7 0 L 14 5 L 7 10 z" className="fill-ink-500 dark:fill-ink-400" />
            </marker>
            <marker id="diamond-hollow" viewBox="0 0 14 10" refX="1" refY="5" markerWidth="12" markerHeight="10" orient="auto-start-reverse">
              <path d="M 0 5 L 7 0 L 14 5 L 7 10 z" className="fill-white stroke-ink-500 dark:fill-ink-900 dark:stroke-ink-400" strokeWidth={1.5} />
            </marker>
            <marker id="crowfoot" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <path d="M 0 0 L 12 6 M 0 12 L 12 6 M 0 6 L 12 6" fill="none" className="stroke-ink-500 dark:stroke-ink-400" strokeWidth={1.3} />
            </marker>
            <marker id="bar" viewBox="0 0 6 12" refX="3" refY="6" markerWidth="6" markerHeight="12" orient="auto-start-reverse">
              <path d="M 3 0 L 3 12" className="stroke-ink-500 dark:stroke-ink-400" strokeWidth={1.6} />
            </marker>
            <marker id="circle-bar" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <circle cx="5" cy="6" r="3.5" fill="none" className="stroke-ink-500 dark:stroke-ink-400" strokeWidth={1.3} />
              <path d="M 12 0 L 12 12" className="stroke-ink-500 dark:stroke-ink-400" strokeWidth={1.4} />
            </marker>
            <marker id="cross" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="10" markerHeight="10" orient="auto">
              <path d="M 1 1 L 11 11 M 11 1 L 1 11" className="stroke-red-500" strokeWidth={1.8} />
            </marker>
          </defs>

          <rect width="100%" height="100%" fill="url(#grid)" data-canvas-background="true" />

          <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            {/* Traços à mão livre ficam ATRÁS dos nós: o desenho é fundo,
                as formas são conteúdo. */}
            {strokes.map((stroke) => (
              <path
                key={stroke.id}
                d={strokePath(stroke.points)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={STROKE_TOOLS[stroke.tool]?.opacity ?? 1}
              />
            ))}
            {drawing?.points?.length > 1 && (
              <path
                d={strokePath(drawing.points)}
                fill="none"
                stroke={drawing.color}
                strokeWidth={drawing.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={STROKE_TOOLS[drawing.tool]?.opacity ?? 1}
              />
            )}

            {edges.map((edge) => {
              const geometry = edgeGeometry(edge, nodes, palette.nodes)
              if (!geometry) return null
              const preset = palette.edges[edge.type] ?? {}
              const d = edgePath(geometry, preset.curved)
              const midX = (geometry.start.x + geometry.end.x) / 2
              const midY = (geometry.start.y + geometry.end.y) / 2

              return (
                <g key={edge.id} className="group">
                  {/* Traço largo e invisível: alvo de clique confortável
                      numa linha de 1.5px. */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    onDoubleClick={() => deleteEdge(edge.id)}
                  />
                  <path
                    d={d}
                    fill="none"
                    className="stroke-ink-500 dark:stroke-ink-400"
                    strokeWidth={1.5}
                    strokeDasharray={preset.dash ?? undefined}
                    markerEnd={preset.head && preset.head !== 'none' ? `url(#${MARKERS[preset.head]})` : undefined}
                    markerStart={preset.tail ? `url(#${MARKERS[preset.tail]})` : undefined}
                  />
                  {edge.label && (
                    <text x={midX} y={midY - 6} textAnchor="middle" className="fill-ink-500 text-[10px] dark:fill-ink-400">
                      {edge.label}
                    </text>
                  )}
                  {/* Multiplicidade nas pontas — o que torna um diagrama ER
                      ou de classes legível de verdade. */}
                  {edge.source_label && (
                    <text x={geometry.start.x} y={geometry.start.y - 8} textAnchor="middle" className="fill-ink-400 text-[9px]">
                      {edge.source_label}
                    </text>
                  )}
                  {edge.target_label && (
                    <text x={geometry.end.x} y={geometry.end.y - 8} textAnchor="middle" className="fill-ink-400 text-[9px]">
                      {edge.target_label}
                    </text>
                  )}
                </g>
              )
            })}

            {connecting && (
              <line
                x1={connecting.origin.x}
                y1={connecting.origin.y}
                x2={connecting.to?.x ?? connecting.origin.x}
                y2={connecting.to?.y ?? connecting.origin.y}
                className="stroke-accent-500"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            )}

            {/* Prévia elástica: mostra o tamanho da forma antes de soltar,
                que é o que torna o gesto previsível. */}
            {rubber && (() => {
              const preview = rectBetween(rubber.origin, rubber.current)
              return (
                <rect
                  x={preview.x}
                  y={preview.y}
                  width={preview.w}
                  height={preview.h}
                  fill="none"
                  className="stroke-accent-500"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              )
            })()}

            {nodes.map((node) => (
              <GraphNode
                key={node.id}
                node={node}
                palette={palette.nodes}
                selected={selected === node.id}
                connecting={connecting?.from === node.id}
                onPointerDown={(e) => handleNodePointerDown(e, node)}
                onDoubleClick={() => setEditingNode(node.id)}
                onResize={(e, handle) => handleResizeStart(e, node, handle)}
                onStartConnection={(e) => {
                  const rect = nodeRect(node, palette.nodes)
                  setConnecting({
                    from: node.id,
                    origin: { x: rect.x + rect.w, y: rect.y + rect.h / 2 },
                    to: pointerWorld(e),
                  })
                }}
              />
            ))}
          </g>
        </svg>

        {/* Controles de zoom */}
        <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-md border border-ink-200 bg-white/95 p-0.5 shadow-subtle backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
          <button onClick={() => zoomBy(0.9)} aria-label="Diminuir zoom" className="rounded p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800">
            <Minus size={14} />
          </button>
          <span className="w-11 text-center text-[11px] tabular-nums text-ink-500">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button onClick={() => zoomBy(1.1)} aria-label="Aumentar zoom" className="rounded p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800">
            <Plus size={14} />
          </button>
          <button onClick={fit} aria-label="Enquadrar tudo" className="rounded p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800">
            <Maximize size={14} />
          </button>
        </div>

        {isCanvas && strokes.length > 0 && (
          <button
            onClick={() => update({ strokes: [] })}
            className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white/95 px-2.5 py-1.5 text-xs text-ink-500 shadow-subtle backdrop-blur transition hover:text-red-600 dark:border-ink-700 dark:bg-ink-900/95"
          >
            <Eraser size={13} />
            Limpar desenho ({strokes.length})
          </button>
        )}

        {nodes.length === 0 && strokes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-ink-400">
              {isCanvas
                ? 'Escolha uma caneta para desenhar ou uma forma na lateral.'
                : 'Escolha uma forma na lateral para começar.'}
            </p>
          </div>
        )}
      </div>

      {/* Inspetor */}
      {(editing || selectedNode) && (
        <NodeInspector
          node={editing ?? selectedNode}
          kind={kind}
          edges={edges}
          onChange={(patch) => updateNode((editing ?? selectedNode).id, patch)}
          onChangeEdge={(id, patch) =>
            update({ edges: edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
          }
          onDeleteEdge={deleteEdge}
          onDelete={() => {
            deleteNode((editing ?? selectedNode).id)
            setSelected(null)
            setEditingNode(null)
          }}
          onClose={() => setEditingNode(null)}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- */
/* Inspetor                                                             */
/* -------------------------------------------------------------------- */

function NodeInspector({ node, kind, edges, onChange, onChangeEdge, onDeleteEdge, onDelete, onClose }) {
  const hasCompartments = ['class', 'interface', 'abstract', 'enum'].includes(node.type)
  const connected = edges.filter((e) => e.from === node.id || e.to === node.id)
  const isSticky = node.type === 'sticky'

  return (
    <div className="w-60 shrink-0 overflow-y-auto border-l border-ink-100 p-3 dark:border-ink-800">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          {node.type}
        </span>
        <button
          onClick={onClose}
          aria-label="Fechar inspetor"
          className="rounded p-1 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
        >
          <X size={14} />
        </button>
      </div>

      <label className="label">Texto</label>
      <textarea
        value={node.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={isSticky ? 4 : 2}
        autoFocus
        className="input py-1.5 text-sm"
      />

      {(node.type === 'link' || node.type === 'image') && (
        <>
          <label className="label mt-3">URL</label>
          <input
            value={node.url ?? ''}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://"
            className="input h-8 py-0 text-sm"
          />
        </>
      )}

      {node.type === 'fragment' && (
        <>
          <label className="label mt-3">Operador</label>
          <select
            value={node.label ?? 'alt'}
            onChange={(e) => onChange({ label: e.target.value })}
            className="input h-8 cursor-pointer py-0 text-sm"
          >
            {['alt', 'opt', 'loop', 'par', 'critical', 'ref'].map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </>
      )}

      {hasCompartments && (
        <>
          <label className="label mt-3">Estereótipo</label>
          <input
            value={node.stereotype ?? ''}
            onChange={(e) => onChange({ stereotype: e.target.value })}
            placeholder="«entity»"
            className="input h-8 py-0 text-sm"
          />

          <label className="label mt-3">Atributos (um por linha)</label>
          <textarea
            defaultValue={(node.fields ?? []).join('\n')}
            onBlur={(e) =>
              onChange({ fields: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })
            }
            rows={3}
            placeholder="- nome: String"
            className="input py-1.5 font-mono text-[12px]"
          />

          <label className="label mt-3">Métodos (um por linha)</label>
          <textarea
            defaultValue={(node.methods ?? []).join('\n')}
            onBlur={(e) =>
              onChange({ methods: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })
            }
            rows={3}
            placeholder="+ salvar(): void"
            className="input py-1.5 font-mono text-[12px]"
          />
        </>
      )}

      <label className="label mt-3">{isSticky ? 'Papel' : 'Cor'}</label>
      <div className="flex flex-wrap gap-1.5">
        {(isSticky ? STICKY_COLORS : NODE_COLORS).map((color) => (
          <button
            key={color}
            onClick={() => onChange(isSticky ? { fill: color } : { color })}
            style={{ backgroundColor: color }}
            aria-label={`Cor ${color}`}
            className={cn(
              'h-6 w-6 rounded-full border-2 transition',
              (isSticky ? node.fill : node.color) === color
                ? 'border-ink-900 dark:border-white'
                : 'border-transparent',
            )}
          />
        ))}
      </div>

      {!isSticky && (
        <>
          <label className="label mt-3 flex items-center gap-1">
            <Palette size={11} /> Preenchimento
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onChange({ fill: null })}
              className={cn(
                'h-6 w-6 rounded-full border-2 text-[10px] text-ink-400',
                !node.fill ? 'border-ink-900 dark:border-white' : 'border-ink-200 dark:border-ink-700',
              )}
            >
              ×
            </button>
            {STICKY_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onChange({ fill: color })}
                style={{ backgroundColor: color }}
                aria-label={`Preenchimento ${color}`}
                className={cn(
                  'h-6 w-6 rounded-full border-2 transition',
                  node.fill === color ? 'border-ink-900 dark:border-white' : 'border-transparent',
                )}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="label">Largura</label>
          <input
            type="number"
            value={node.w ?? 160}
            min={40}
            step={10}
            onChange={(e) => onChange({ w: Number(e.target.value) })}
            className="input h-8 py-0 text-sm"
          />
        </div>
        <div>
          <label className="label">Altura</label>
          <input
            type="number"
            value={node.h ?? 90}
            min={24}
            step={10}
            onChange={(e) => onChange({ h: Number(e.target.value) })}
            className="input h-8 py-0 text-sm"
          />
        </div>
      </div>

      {connected.length > 0 && (
        <>
          <label className="label mt-4">Conexões</label>
          <div className="space-y-2">
            {connected.map((edge) => (
              <div key={edge.id} className="rounded-md border border-ink-200 p-1.5 dark:border-ink-700">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-ink-400">
                    {edge.type}
                  </span>
                  <button
                    onClick={() => onDeleteEdge(edge.id)}
                    aria-label="Remover conexão"
                    className="rounded p-0.5 text-ink-400 transition hover:text-red-600"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <input
                  value={edge.label ?? ''}
                  onChange={(e) => onChangeEdge(edge.id, { label: e.target.value })}
                  placeholder="rótulo"
                  className="input h-7 py-0 text-xs"
                />
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <input
                    value={edge.source_label ?? ''}
                    onChange={(e) => onChangeEdge(edge.id, { source_label: e.target.value })}
                    placeholder="origem (1)"
                    className="input h-7 py-0 text-xs"
                  />
                  <input
                    value={edge.target_label ?? ''}
                    onChange={(e) => onChangeEdge(edge.id, { target_label: e.target.value })}
                    placeholder="destino (0..*)"
                    className="input h-7 py-0 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        onClick={onDelete}
        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
      >
        <Trash2 size={13} />
        Excluir {kind === 'diagram' ? 'forma' : 'objeto'}
      </button>
    </div>
  )
}

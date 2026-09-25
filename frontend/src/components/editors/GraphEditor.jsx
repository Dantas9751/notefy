import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxSelect,
  Brush,
  Circle,
  Copy,
  Eraser,
  Highlighter,
  Maximize,
  Minus,
  Moon,
  MousePointer2,
  Palette,
  PenLine,
  Plus,
  Slash,
  Square,
  Sun,
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
  brushPath,
  clampZoom,
  edgeGeometry,
  edgePath,
  eraseFromStroke,
  fitViewport,
  nodeRect,
  paletteFor,
  rectBetween,
  strokePath,
  toWorld,
  uid,
} from '@/lib/graph'
import api, { extractError } from '@/lib/api'
import { hasItemPayload, limparDragPayload, readDragPayload } from '@/lib/dnd'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { cn } from '@/lib/utils'
import { atalhoDe } from '@/lib/history'
import ColorWheel from '@/components/ui/ColorWheel'
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

//: Cores de tinta padrão do canvas. A lista vive AQUI porque a
//: personalizada (rodinha de cores) tem que saber o que é "padrão" para
//: acender a borda certa — igual ao Settings.
const CORES_TINTA = ['#1a1816', ...NODE_COLORS.slice(0, 8)]

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

/**
 * Cursor de lápis para as ferramentas de traço.
 *
 * SVG embutido em vez de `crosshair`: a mira genérica é a mesma de mover,
 * conectar e desenhar forma, então ela não dizia NADA sobre qual
 * ferramenta estava valendo. O contorno escuro sobre preenchimento branco
 * mantém a ponta visível nos dois temas do quadro, e o ponto de ação
 * (2 18) é a ponta do lápis, não o centro da imagem.
 */
const CURSOR_LAPIS = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
    '<path d="M2 18l1.2-4.2L13.4 3.6a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L6.2 16.8 2 18z" ' +
    'fill="#fff" stroke="#1a1816" stroke-width="1.4" stroke-linejoin="round"/></svg>',
)}") 2 18, crosshair`

export default function GraphEditor({
  kind,
  data,
  onChange,
  onCommit,
  onUndo,
  onRedo,
  //: Documento que hospeda a imagem colada. Sem ele o Ctrl+V de
  //: imagem não faz nada — um upload sem dono viraria arquivo solto.
  documentId,
  //: Abre um documento a partir de um nó ligado a ele.
  onAbrirDocumento,
  //: Para onde mandar a falha do upload da imagem colada. O `catch`
  //: engolia o erro: a pessoa colava um print e o quadro seguia vazio,
  //: sem nada dizendo que o envio falhou.
  onError,
}) {
  const palette = useMemo(() => paletteFor(kind), [kind])
  const isCanvas = kind === 'canvas'

  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []
  const strokes = data?.strokes ?? []
  const viewport = data?.viewport ?? { x: 0, y: 0, zoom: 1 }

  // O quadro no instante em que alguém perguntar, e não o do render que
  // capturou o fechamento. Só importa para quem volta DEPOIS de um
  // `await` — é o mesmo remendo que o `DocumentEditor` faz com `docRef`.
  const dataRef = useRef(data)
  dataRef.current = data

  const svgRef = useRef(null)
  //: Seleção múltipla: um conjunto de ids. Clique troca, Ctrl+clique
  //: alterna, e a ferramenta de área seleciona o lote de uma vez.
  const [selecionados, setSelecionados] = useState([])
  //: Os traços da caneta selecionados — objetos à parte dos nós: a área
  //: de seleção pega os dois, e mover/apagar/copiar vale para ambos.
  const [strokesSelecionados, setStrokesSelecionados] = useState([])
  const [drag, setDrag] = useState(null)
  const [connecting, setConnecting] = useState(null)
  const [edgeType, setEdgeType] = useState(palette.defaultEdge)
  const [editingNode, setEditingNode] = useState(null)
  //: Grupos de formas abertos na paleta. Conjunto, e não um id só: o
  //: "Conteúdo" e o "Formas" não disputam a mesma vaga — colar um post-it
  //: e um retângulo pede os dois abertos lado a lado.
  const [openGroups, setOpenGroups] = useState(() => new Set([palette.groups[0]?.id]))
  //: Retângulo elástico da seleção de área (mundo). `somar` diz se a área
  //: acrescenta à seleção atual (Ctrl+arrastar) ou a substitui (ferramenta).
  const [selectRect, setSelectRect] = useState(null)
  //: Menu de botão direito sobre um nó, em pixels de tela do quadro.
  const [menu, setMenu] = useState(null)
  //: Cópia de nós/arestas entre Ctrl+C e Ctrl+V. Vive só nesta instância
  //: do editor — cada quadro tem o seu.
  const clipboardRef = useRef(null)

  // Ferramentas do whiteboard. `select` é o modo do diagrama e o padrão
  // do canvas: desenhar só começa quando o usuário escolhe uma caneta,
  // uma forma ou o texto.
  const [tool, setTool] = useState('select')
  const [inkColor, setInkColor] = useState('#1a1816')
  // Espessura POR FERRAMENTA. Antes só a caneta tinha escolha e marcador e
  // marca-texto ficavam presos no valor da constante — quem queria um
  // marca-texto fino não tinha como pedir. Cada ferramenta lembra a sua.
  const [inkWidths, setInkWidths] = useState(() => ({
    pen: STROKE_TOOLS.pen.width,
    marker: STROKE_TOOLS.marker.width,
    highlighter: STROKE_TOOLS.highlighter.width,
  }))
  // Percentual, como vem das preferências. Vira fração na hora de desenhar.
  const [inkOpacity, setInkOpacity] = useState(
    Math.round(STROKE_TOOLS.highlighter.opacity * 100),
  )
  const [eraserRadius, setEraserRadius] = useState(ERASER_TOLERANCE)
  const [drawing, setDrawing] = useState(null)
  //: Retângulo elástico enquanto o usuário arrasta para desenhar a forma.
  const [rubber, setRubber] = useState(null)
  // Posição do ponteiro dentro do svg, em pixels de tela — só para
  // desenhar a prévia da borracha por cima de tudo, fora do grupo que
  // leva o transform do viewport.
  const [pointer, setPointer] = useState(null)
  // Timer do commit adiado do inspetor: cada tecla gera um update, mas
  // gravar sessenta snapshots por segundo de digitação é desperdício.
  // O commit vai 400 ms depois da última tecla, e o undo pula de edição
  // em edição, não de caractere em caractere.
  const inspectorCommitRef = useRef(null)

  /* ------------------------------------------------------------------ */
  /* Preferências das ferramentas de traço                              */
  /*                                                                    */
  /* Ficam na conta, não no documento: é preferência de ferramenta, e    */
  /* quem gosta de caneta fina quer caneta fina no próximo quadro        */
  /* também. Só o canvas usa — o diagrama não desenha à mão livre.       */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!isCanvas) return
    let vivo = true
    api
      .get('/me/preferences/')
      .then(({ data: prefs }) => {
        if (!vivo) return
        setInkWidths((atual) => ({ ...atual, pen: prefs.canvas_pen_size ?? atual.pen }))
        if (prefs.canvas_highlighter_opacity) setInkOpacity(prefs.canvas_highlighter_opacity)
        if (prefs.canvas_eraser_radius) setEraserRadius(prefs.canvas_eraser_radius)
      })
      .catch(() => {
        // Preferência é conforto, não requisito: falhar aqui deixa os
        // padrões da constante valendo e o desenho continua funcionando.
      })
    return () => {
      vivo = false
    }
  }, [isCanvas])

  // Grava com atraso: os controles são slider e botão, e salvar a cada
  // pixel arrastado geraria uma requisição por quadro de animação.
  const primeiroSalvamento = useRef(true)
  useEffect(() => {
    if (!isCanvas) return undefined
    if (primeiroSalvamento.current) {
      primeiroSalvamento.current = false
      return undefined
    }
    const timer = setTimeout(() => {
      api
        .patch('/me/preferences/', {
          canvas_pen_size: inkWidths.pen,
          canvas_highlighter_opacity: inkOpacity,
          canvas_eraser_radius: eraserRadius,
        })
        .catch(() => {})
    }, 600)
    return () => clearTimeout(timer)
  }, [isCanvas, inkWidths.pen, inkOpacity, eraserRadius])

  /* ------------------------------------------------------------------ */
  /* Tema do quadro                                                     */
  /*                                                                    */
  /* Mora no payload porque é propriedade DAQUELE desenho: dois canvas   */
  /* abertos podem ter temas diferentes, e nenhum deles mexe na sidebar  */
  /* nem nas notas. Ausente = "system", que é como todo quadro salvo     */
  /* antes desta feature se comporta.                                   */
  /* ------------------------------------------------------------------ */
  const boardTheme = data?.theme ?? 'system'

  const trocarTema = () => {
    // Ciclo curto de dois estados a partir do que está VALENDO na tela:
    // partir de "system" alternando para o oposto do que se vê evita o
    // clique que aparentemente não faz nada.
    const vendoEscuro =
      boardTheme === 'dark' ||
      (boardTheme === 'system' && document.documentElement.classList.contains('dark'))
    update({ theme: vendoEscuro ? 'light' : 'dark' })
  }

  const isStrokeTool = tool in STROKE_TOOLS
  const isShapeTool = DRAWABLE_SHAPES.includes(tool)

  //: Formas do CANVAS não têm texto: o rótulo embutido não existe nelas
  //: (linha, seta, estrela não desenham texto nenhum), então editar só
  //: criaria conteúdo invisível. No diagrama todas as formas têm rótulo.
  const permiteTexto = (node) => !(isCanvas && DRAWABLE_SHAPES.includes(node.type))

  //: Foco do editor. Com o painel "abrir ao lado", DOIS editores ficam
  //: montados e os dois escutam o teclado do window — sem isto, Ctrl+Z
  //: desfazia nos dois ao mesmo tempo. O editor só responde ao teclado
  //: depois que um clique caiu dentro dele.
  const focado = useRef(false)

  // `update` devolve o estado que produziu: o commit que fecha o gesto
  // precisa exatamente DESTE objeto. Ler o documento da última render
  // empilharia o estado ANTERIOR ao update final — o primeiro gesto da
  // sessão era engolido pelo `Object.is` do `empilhar` e cada desfazer
  // comia dois gestos de uma vez.
  // Parte do quadro AGORA (`dataRef`), e não do `data` que este render
  // capturou. Para quem chama de forma síncrona os dois são a mesma
  // coisa; para quem volta depois de um `await` — colar imagem, subir
  // anexo — o fechamento já está velho, e montar a partir dele apagava
  // tudo que tinha sido desenhado nesse meio tempo.
  //
  // Sem `data` nas dependências, `update` também para de ser recriado a
  // cada traço, e com ele o `setViewport` que depende dele.
  const update = useCallback(
    (patch) => {
      const next = { ...dataRef.current, ...patch }
      onChange(next)
      return next
    },
    [onChange],
  )
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
    setSelecionados([node.id])
    setTool('select')
    // Forma do canvas não tem rótulo — não abre o campo de texto.
    setEditingNode(permiteTexto(node) ? node.id : null)
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

  /**
   * Apaga a seleção inteira (nós, arestas órfãs e traços marcados).
   * Reaproveitada pelo Delete, pelo botão direito e pelo Ctrl+X.
   */
  const apagarSelecao = () => {
    if (!selecionados.length && !strokesSelecionados.length) return
    const ids = new Set(selecionados)
    const tracos = new Set(strokesSelecionados)
    onCommit?.(
      update({
        nodes: nodes.filter((n) => !ids.has(n.id)),
        edges: edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)),
        strokes: strokes.filter((s) => !tracos.has(s.id)),
      }),
    )
    setSelecionados([])
    setStrokesSelecionados([])
    setEditingNode(null)
  }

  /**
   * Cola a área de transferência: clona com ids novos (nós, arestas
   * ENTRE os nós copiados e traços), desloca +24,+24 para não cair em
   * cima do original e seleciona o que nasceu.
   */
  const colar = () => {
    const buffer = clipboardRef.current
    if (!buffer?.nodes?.length && !buffer?.strokes?.length) return
    const mapa = new Map()
    const novos = (buffer.nodes ?? []).map((n) => {
      const novoId = uid('n')
      mapa.set(n.id, novoId)
      return { ...n, id: novoId, x: n.x + 24, y: n.y + 24 }
    })
    const novasArestas = (buffer.edges ?? []).map((e) => ({
      ...e,
      id: uid('e'),
      from: mapa.get(e.from),
      to: mapa.get(e.to),
    }))
    const novosTracos = (buffer.strokes ?? []).map((s) => ({
      ...s,
      id: uid('s'),
      points: s.points.map(([x, y]) => [x + 24, y + 24]),
    }))
    onCommit?.(
      update({
        nodes: [...nodes, ...novos],
        edges: [...edges, ...novasArestas],
        strokes: [...strokes, ...novosTracos],
      }),
    )
    setSelecionados(novos.map((n) => n.id))
    setStrokesSelecionados(novosTracos.map((s) => s.id))
    setTool('select')
  }

  /** Duplicar no lugar: copia a seleção para a área de transferência e cola. */
  const duplicarSelecao = () => {
    if (!selecionados.length && !strokesSelecionados.length) return
    const ids = new Set(selecionados)
    const tracos = new Set(strokesSelecionados)
    clipboardRef.current = {
      nodes: nodes.filter((n) => ids.has(n.id)).map((n) => ({ ...n })),
      edges: edges
        .filter((e) => ids.has(e.from) && ids.has(e.to))
        .map((e) => ({ ...e })),
      strokes: strokes.filter((s) => tracos.has(s.id)).map((s) => ({ ...s })),
    }
    colar()
  }

  const fecharMenu = () => setMenu(null)

  const handleNodeContextMenu = (event, node) => {
    event.preventDefault()
    event.stopPropagation()
    // Botão direito fora da seleção recolhe a seleção ao nó clicado —
    // o menu age sempre sobre o que está marcado.
    if (!selecionados.includes(node.id)) {
      setSelecionados([node.id])
      setStrokesSelecionados([])
    }
    const caixa = svgRef.current?.getBoundingClientRect()
    const largura = caixa?.width ?? 800
    const altura = caixa?.height ?? 600
    setMenu({
      x: Math.min(Math.max(event.clientX - (caixa?.left ?? 0), 4), largura - 170),
      y: Math.min(Math.max(event.clientY - (caixa?.top ?? 0), 4), altura - 110),
    })
  }

  /* ------------------------------------------------------------------ */
  /* Ponteiro                                                           */
  /* ------------------------------------------------------------------ */
  const handleNodePointerDown = (event, node) => {
    if (tool !== 'select') return
    event.stopPropagation()

    const comCtrl = event.ctrlKey || event.metaKey
    const jaSelecionado = selecionados.includes(node.id)

    // Ctrl+clique alterna o nó na seleção sem começar arraste.
    if (comCtrl) {
      setSelecionados((atual) =>
        atual.includes(node.id)
          ? atual.filter((id) => id !== node.id)
          : [...atual, node.id],
      )
      return
    }

    // Clique num nó fora da seleção recolhe a seleção a ele.
    const alvos = jaSelecionado ? selecionados : [node.id]
    if (!jaSelecionado) {
      setSelecionados(alvos)
      // Nó fora da seleção recolhe também os traços: só o grupo que o
      // usuário já tinha montado viaja junto com o arraste.
      setStrokesSelecionados([])
    }

    const world = pointerWorld(event)
    setDrag({
      mode: 'move',
      id: node.id,
      dx: world.x - node.x,
      dy: world.y - node.y,
      // Posições de partida de TODOS os nós do arraste: mover em grupo
      // desloca cada um pela mesma diferença, preservando o layout.
      alvos: alvos.map((id) => {
        const alvo = nodes.find((n) => n.id === id)
        return alvo ? { id, x: alvo.x, y: alvo.y } : null
      }).filter(Boolean),
      origem: { x: node.x, y: node.y },
      // Os traços marcados acompanham o arraste de nós — seleção mista.
      tracos: strokesSelecionados,
    })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  /**
   * Arrastar um traço da caneta: com a seleção ativa ele vira objeto —
   * seleciona, arrasta, e o lote marcado acompanha o mesmo gesto.
   */
  const handleStrokePointerDown = (event, stroke) => {
    if (tool !== 'select') return
    event.stopPropagation()

    const comCtrl = event.ctrlKey || event.metaKey
    const jaSelecionado = strokesSelecionados.includes(stroke.id)

    // Ctrl+clique alterna o traço na seleção sem começar arraste.
    if (comCtrl) {
      setStrokesSelecionados((atual) =>
        atual.includes(stroke.id)
          ? atual.filter((id) => id !== stroke.id)
          : [...atual, stroke.id],
      )
      return
    }

    // Clique num traço fora da seleção recolhe a seleção a ele (e aos
    // nós marcados, que não participam deste arraste).
    const alvos = jaSelecionado ? strokesSelecionados : [stroke.id]
    if (!jaSelecionado) {
      setStrokesSelecionados(alvos)
      setSelecionados([])
    }

    const world = pointerWorld(event)
    const ponto = stroke.points[0] ?? [world.x, world.y]
    setDrag({
      mode: 'move',
      dx: world.x - ponto[0],
      dy: world.y - ponto[1],
      alvos: [],
      origem: { x: ponto[0], y: ponto[1] },
      tracos: alvos,
    })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleResizeStart = (event, node, handle) => {
    // Redimensionar com vários marcados não faz sentido: recolhe ao nó.
    setSelecionados([node.id])
    setStrokesSelecionados([])
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

    const comCtrl = event.ctrlKey || event.metaKey

    // Seleção de área: pela ferramenta dedicada ou por Ctrl+arrastar em
    // qualquer ferramenta — a forma mais rápida de marcar um lote.
    if (tool === 'select-area' || comCtrl) {
      const world = pointerWorld(event)
      // Ctrl+arrastar SOMA à seleção atual; a ferramenta substitui.
      setSelectRect({ origin: world, current: world, somar: !!comCtrl })
      return
    }

    if (tool === 'select') {
      setSelecionados([])
      setStrokesSelecionados([])
      setDrag({ mode: 'pan', startX: event.clientX, startY: event.clientY, origin: viewport })
      return
    }

    const world = pointerWorld(event)

    // Texto: um clique cria a caixa e já abre a edição, como num editor
    // de imagem — não faz sentido arrastar para dimensionar algo vazio.
    if (tool === 'text') {
      const node = buildNode('text', { x: world.x, y: world.y })
      onCommit?.(update({ nodes: [...nodes, node] }))
      setSelecionados([node.id])
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
      width: inkWidths[tool] ?? STROKE_TOOLS[tool].width,
      // A opacidade passa a viajar NO traço. Antes era lida da constante na
      // hora de desenhar, então mudar a preferência reescreveria o passado:
      // todos os marca-textos já feitos mudariam de cor junto.
      opacity:
        tool === 'highlighter' ? inkOpacity / 100 : STROKE_TOOLS[tool].opacity,
      points: [[Math.round(world.x), Math.round(world.y)]],
    })
  }

  /**
   * Passa a borracha num ponto, cortando os traços em vez de removê-los.
   *
   * Cada traço devolve os pedaços que sobraram: nenhum se ele foi todo
   * apagado, um se só aparou a ponta, dois ou mais se o corte foi no meio.
   */
  const eraseAt = (world) => {
    let changed = false
    const remaining = []

    for (const stroke of strokes) {
      const pieces = eraseFromStroke(stroke, world, eraserRadius)
      // `eraseFromStroke` devolve o próprio traço quando não encostou nele.
      if (pieces.length !== 1 || pieces[0] !== stroke) changed = true
      remaining.push(...pieces)
    }

    if (changed) update({ strokes: remaining })
  }

  const handlePointerMove = (event) => {
    if (tool === 'eraser') {
      const box = svgRef.current.getBoundingClientRect()
      setPointer({ x: event.clientX - box.left, y: event.clientY - box.top })
    }

    if (selectRect) {
      setSelectRect({ ...selectRect, current: pointerWorld(event) })
      return
    }

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

    if (drag.mode === 'move') {
      // Nós encaixam na grade; o traço não tem grade — mas quando os dois
      // viajam juntos, o traço segue o MESMO deslocamento dos nós (que já
      // veio arredondado), e o desenho não se descola do conteúdo.
      const dx = drag.alvos.length
        ? Math.round((world.x - drag.dx) / GRID) * GRID - drag.origem.x
        : world.x - drag.dx - drag.origem.x
      const dy = drag.alvos.length
        ? Math.round((world.y - drag.dy) / GRID) * GRID - drag.origem.y
        : world.y - drag.dy - drag.origem.y

      const tracos = new Set(drag.tracos ?? [])
      update({
        nodes: nodes.map((n) => {
          const partida = drag.alvos.find((a) => a.id === n.id)
          return partida ? { ...n, x: partida.x + dx, y: partida.y + dy } : n
        }),
        strokes: tracos.size
          ? strokes.map((s) =>
              tracos.has(s.id)
                ? { ...s, points: s.points.map(([px, py]) => [px + dx, py + dy]) }
                : s,
            )
          : strokes,
      })
      return
    }

    // Encaixe na grade: mantém o desenho alinhado sem precisar de régua.
    updateNode(drag.id, {
      x: Math.round((world.x - drag.dx) / GRID) * GRID,
      y: Math.round((world.y - drag.dy) / GRID) * GRID,
    })
  }

  const handlePointerUp = (event) => {
    // Fim da seleção de área: marca quem cruza o retângulo. `somar`
    // (Ctrl+arrastar) acrescenta aos já marcados, senão substitui. Nós
    // e traços da caneta entram na mesma conta — um lote pode misturar.
    if (selectRect) {
      const bounds = rectBetween(selectRect.origin, selectRect.current)
      setSelectRect(null)
      const achados = nodes
        .filter((n) => {
          const r = nodeRect(n, palette.nodes)
          return (
            bounds.x < r.x + r.w && bounds.x + bounds.w > r.x &&
            bounds.y < r.y + r.h && bounds.y + bounds.h > r.y
          )
        })
        .map((n) => n.id)
      // Um traço cruza a área quando a CAIXA dos seus pontos cruza: o
      // teste é o mesmo dos nós, só que sobre o retângulo do traço.
      const achadosTracos = strokes
        .filter((s) => {
          const xs = s.points.map((p) => p[0])
          const ys = s.points.map((p) => p[1])
          const minX = Math.min(...xs)
          const maxX = Math.max(...xs)
          const minY = Math.min(...ys)
          const maxY = Math.max(...ys)
          return (
            bounds.x < maxX && bounds.x + bounds.w > minX &&
            bounds.y < maxY && bounds.y + bounds.h > minY
          )
        })
        .map((s) => s.id)
      setSelecionados((atual) =>
        selectRect.somar ? [...new Set([...atual, ...achados])] : achados,
      )
      setStrokesSelecionados((atual) =>
        selectRect.somar ? [...new Set([...atual, ...achadosTracos])] : achadosTracos,
      )
      return
    }

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
      onCommit?.(update({ nodes: [...nodes, node] }))
      setSelecionados([node.id])
      setTool('select')
      return
    }

    if (drawing) {
      if (drawing.tool !== 'eraser' && drawing.points.length >= 2) {
        // O traço só entra no documento neste update — o commit precisa
        // do estado final, não do que a última render conhecia.
        onCommit?.(update({ strokes: [...strokes, drawing] }))
      } else {
        // Borracha: as mudanças já vieram nos `eraseAt` dos movimentos,
        // e o estado renderizado já é o final.
        onCommit?.()
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
          onCommit?.(
            update({
              edges: [
                ...edges,
                { id: uid('e'), type: edgeType, from: connecting.from, to: target.id, label: '' },
              ],
            }),
          )
        }
      }
      setConnecting(null)
      setDrag(null)
      return
    }
    setDrag(null)
    // Fecha o "gesto" e grava um snapshot na pilha de desfazer. As três
    // ramificações acima (rubber, drawing, connecting) e o drag de
    // move/resize todas passam por aqui, e cada uma merece um passo —
    // não sessenta (um por frame). `onCommit` é opcional: o NoteEditor
    // e o SpreadsheetEditor não o passam, porque o undo deles já é
    // tratado por outro caminho.
    onCommit?.()
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
  //: O editor responde ao teclado só quando tem o foco do ponteiro. Com
  //: o "abrir ao lado", dois editores ficam montados ao mesmo tempo e
  //: ambos escutam o window — sem a barreira do foco, Ctrl+Z desfazia
  //: nas DUAS telas de uma vez. Um clique em qualquer lugar do quadro
  //: (inclusive nas alças e na caneta) marca este editor como o ativo.
  useEffect(() => {
    // Capture no window: roda ANTES dos handlers do React e decide o foco
    // a partir de onde o clique caiu. Dentro do svg liga; fora desliga.
    const rastrear = (event) => {
      const alvo = event.target
      focado.current = alvo instanceof Node && !!svgRef.current?.contains(alvo)
    }
    window.addEventListener('pointerdown', rastrear, true)
    return () => window.removeEventListener('pointerdown', rastrear, true)
  }, [])

  useListenerDeJanela('keydown', (event) => {
    const typing =
      ['INPUT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable
    if (typing) return
    // Nada de atalho global num editor que não é o da mão do usuário.
    if (!focado.current) return

    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y → desfazer / refazer. O atalho é
    // o mesmo que o browser usa para texto; aqui o rich text não está
    // em foco (o `typing` acima barraria), então não há conflito. O
    // handler é do window e roda antes do GraphEditor — se o foco não
    // está neste editor, onUndo/onRedo são undefined e nada acontece.
    const acao = atalhoDe(event)
    if (acao === 'undo') {
      event.preventDefault()
      onUndo?.()
      return
    }
    if (acao === 'redo') {
      event.preventDefault()
      onRedo?.()
      return
    }

    const comMod = event.ctrlKey || event.metaKey
    const tecla = event.key.toLowerCase()

    // Copiar/recortar/colar a seleção. Só intercepta quando há o que
    // copiar — senão o Ctrl+C do browser continua funcionando.
    if (comMod && tecla === 'c' && (selecionados.length || strokesSelecionados.length)) {
      event.preventDefault()
      const ids = new Set(selecionados)
      const tracos = new Set(strokesSelecionados)
      clipboardRef.current = {
        nodes: nodes.filter((n) => ids.has(n.id)).map((n) => ({ ...n })),
        edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ ...e })),
        strokes: strokes.filter((s) => tracos.has(s.id)).map((s) => ({ ...s })),
      }
      return
    }
    if (comMod && tecla === 'x' && (selecionados.length || strokesSelecionados.length)) {
      event.preventDefault()
      const ids = new Set(selecionados)
      const tracos = new Set(strokesSelecionados)
      clipboardRef.current = {
        nodes: nodes.filter((n) => ids.has(n.id)).map((n) => ({ ...n })),
        edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ ...e })),
        strokes: strokes.filter((s) => tracos.has(s.id)).map((s) => ({ ...s })),
      }
      apagarSelecao()
      return
    }
    if (comMod && tecla === 'v') {
      event.preventDefault()
      colar()
      return
    }

    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      (selecionados.length || strokesSelecionados.length)
    ) {
      event.preventDefault()
      // O apagarSelecao faz um update sozinho — precisa commitar esse
      // snapshot pra que Ctrl+Z volte os nós apagados inteiros.
      apagarSelecao()
      return
    }
    if (event.key === 'Escape') {
      setSelecionados([])
      setStrokesSelecionados([])
      setConnecting(null)
      setEditingNode(null)
      setMenu(null)
      setTool('select')
    }
    if (!comMod) {
      // No diagrama valem só os atalhos das ferramentas que ele
      // tem; deixar 'p' de caneta ativo ali colocaria o editor num
      // estado sem botão correspondente na barra.
      const shortcuts = isCanvas
        ? {
            v: 'select', p: 'pen', m: 'marker', h: 'highlighter',
            e: 'eraser', t: 'text', r: 'rect', o: 'ellipse', l: 'line_shape',
            a: 'select-area',
          }
        : { v: 'select', t: 'text', a: 'select-area' }
      if (shortcuts[tecla]) setTool(shortcuts[tecla])
    }
  })

  /* ------------------------------------------------------------------ */
  /* Colar imagem (Ctrl+V)                                               */
  /*                                                                     */
  /* O nó `image` já existia e sabia desenhar `node.url` — só não havia  */
  /* como pôr uma imagem lá dentro: o placeholder pedia "cole uma URL"   */
  /* e não existia handler de colar nenhum no editor. Print do slide,    */
  /* foto do quadro e recorte do livro entram por aqui.                  */
  /*                                                                     */
  /* Sobe como ANEXO do documento, igual ao da nota: a listagem da pasta */
  /* usa `loose()`, então colar cinco imagens no canvas não enche a      */
  /* pasta de cinco arquivos que ninguém pediu.                          */
  /* ------------------------------------------------------------------ */
  useListenerDeJanela('paste', async (event) => {
    if (!documentId) return
    // O `clipboardRef` cuida de colar NÓS copiados daqui; imagem do
    // sistema é outro caminho e não pode atropelar aquele.
    if (clipboardRef.current) return
    const alvo = event.target
    if (alvo?.closest?.('input, textarea, [contenteditable="true"]')) return

    const arquivo = [...(event.clipboardData?.items ?? [])]
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile()
    if (!arquivo) return

    event.preventDefault()
    try {
      const corpo = new FormData()
      corpo.append('files', arquivo)
      corpo.append('attached_to', documentId)
      const { data: enviados } = await api.post('/documents/upload/', corpo)
      const url = enviados?.[0]?.file_url
      if (!url) return

      // Nasce no centro do que está à vista, como qualquer nó criado
      // pela paleta — e não em (0,0), que pode estar fora da tela.
      // `dataRef` de novo: se a pessoa deu zoom ou arrastou o quadro
      // durante o envio, o `viewport` do fechamento aponta para um
      // enquadramento que já não está na tela — e a imagem nasceria
      // fora da vista.
      const atual = dataRef.current
      const box = svgRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 }
      const meio = toWorld(
        { x: box.width / 2, y: box.height / 2 },
        atual?.viewport ?? viewport,
      )
      const preset = palette.nodes.image
      const node = {
        ...buildNode('image', {
          x: meio.x - preset.w / 2,
          y: meio.y - preset.h / 2,
          w: preset.w,
          h: preset.h,
        }),
        url,
        text: arquivo.name,
      }
      // `dataRef`, e não `nodes`: o upload leva segundos, e a lista
      // que estava em mãos no Ctrl+V já é passado. O `update` também
      // lê do ref, então o que for desenhado durante o envio sobrevive.
      onCommit?.(update({ nodes: [...(atual?.nodes ?? []), node] }))
      setSelecionados([node.id])
    } catch (err) {
      onError?.(extractError(err))
    }
  })

  /* ------------------------------------------------------------------ */
  /* Soltar um documento no quadro                                       */
  /*                                                                     */
  /* O nó `document` existia e desenhava uma folha com um rótulo digitado */
  /* à mão — não apontava para documento nenhum. Agora ele guarda o       */
  /* `document_id` e vira um atalho de verdade: clique duplo abre.        */
  /*                                                                     */
  /* Arrastar, e não um seletor: o cartão de item JÁ é arrastável (é      */
  /* assim que se move de pasta), e `lib/dnd.js` já carrega id, título e  */
  /* tipo. Um modal de escolher documento seria máquina nova para o que   */
  /* o gesto existente resolve.                                           */
  /* ------------------------------------------------------------------ */
  const soltarDocumento = (event) => {
    const payload = readDragPayload(event)
    if (payload?.type !== 'document') return
    event.preventDefault()

    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return
    const ponto = toWorld({ x: event.clientX - box.left, y: event.clientY - box.top }, viewport)
    const preset = palette.nodes.document

    const node = {
      ...buildNode('document', {
        x: ponto.x - preset.w / 2,
        y: ponto.y - preset.h / 2,
        w: preset.w,
        h: preset.h,
      }),
      // O schema do grafo valida `id` e `type`; chave extra passa. Por
      // isso o backend não precisou mudar nada para guardar o vínculo.
      document_id: payload.id,
      document_kind: payload.kind,
      text: payload.title || 'Documento',
    }
    onCommit?.(update({ nodes: [...nodes, node] }))
    setSelecionados([node.id])
    limparDragPayload()
  }

  const zoomBy = (factor) => setViewport({ ...viewport, zoom: clampZoom(viewport.zoom * factor) })

  const fit = () => {
    const box = svgRef.current?.getBoundingClientRect()
    if (box) setViewport(fitViewport(nodes, strokes, palette.nodes, box.width, box.height))
  }

  // O inspetor só faz sentido com um nó: com vários marcados, não há o
  // que editar — as ações em lote ficam no teclado e no botão direito.
  const selectedNode =
    selecionados.length === 1 ? nodes.find((n) => n.id === selecionados[0]) : null

  return (
    <div className="flex min-h-0 flex-1">
      {/* Paleta */}
      <div className="w-48 shrink-0 overflow-y-auto border-r border-ink-100 p-2 dark:border-ink-800">
        {/* O diagrama também ganha ferramentas, só que duas: selecionar e
            texto. O texto solto é o que permite anotar um diagrama —
            legenda, observação, título de área — sem precisar inventar uma
            forma para segurar a frase. O tipo `text` já é válido no
            esquema de diagrama no backend, então nada mais precisa mudar. */}
        <>
          <p className="px-1 pb-1.5 secao">
            Ferramentas
          </p>
          <div className={cn('grid gap-1', isCanvas ? 'grid-cols-5' : 'grid-cols-2')}>
            {(isCanvas
              ? [
                  { id: 'select', icon: MousePointer2, title: 'Selecionar (V)' },
                  { id: 'select-area', icon: BoxSelect, title: 'Selecionar área (A): arraste para marcar vários' },
                  { id: 'pen', icon: PenLine, title: 'Caneta (P)' },
                  { id: 'marker', icon: Brush, title: 'Marcador (M)' },
                  { id: 'highlighter', icon: Highlighter, title: 'Marca-texto (H)' },
                  { id: 'eraser', icon: Eraser, title: 'Borracha (E)' },
                  { id: 'text', icon: Type, title: 'Texto (T): clique para escrever' },
                  { id: 'rect', icon: Square, title: 'Retângulo (R): arraste para desenhar' },
                  { id: 'ellipse', icon: Circle, title: 'Elipse (O): arraste para desenhar' },
                  { id: 'triangle', icon: Triangle, title: 'Triângulo: arraste para desenhar' },
                  { id: 'line_shape', icon: Slash, title: 'Linha (L): arraste para desenhar' },
                ]
              : [
                  { id: 'select', icon: MousePointer2, title: 'Selecionar (V)' },
                  { id: 'select-area', icon: BoxSelect, title: 'Selecionar área (A): arraste para marcar vários' },
                  { id: 'text', icon: Type, title: 'Texto livre (T): clique para escrever' },
                ]
            ).map((item) => (
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
        </>

        {isCanvas && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {CORES_TINTA.map((color) => (
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
              <ColorWheel
                value={inkColor}
                onChange={setInkColor}
                selected={!CORES_TINTA.includes(inkColor)}
                className="h-5 w-5"
                title="Tinta personalizada"
              />
            </div>

            {/* Espessura vale para as três ferramentas de traço, cada uma
                com o próprio valor. A borracha não tem espessura: ela tem
                raio, logo abaixo. */}
            {['pen', 'marker', 'highlighter'].includes(tool) && (
              <div className="mt-2 flex items-center gap-1.5 px-1">
                <span className="text-[10px] text-ink-400">Espessura</span>
                {STROKE_WIDTHS.map((width) => (
                  <button
                    key={width}
                    onClick={() => setInkWidths((atual) => ({ ...atual, [tool]: width }))}
                    aria-label={`Espessura ${width}`}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded transition',
                      inkWidths[tool] === width ? 'bg-accent-100 dark:bg-accent-500/25' : 'hover:bg-ink-100 dark:hover:bg-ink-800',
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

            {tool === 'highlighter' && (
              <label className="mt-2 flex items-center gap-2 px-1">
                <span className="shrink-0 text-[10px] text-ink-400">Opacidade</span>
                <input
                  type="range"
                  min={10}
                  max={80}
                  value={inkOpacity}
                  onChange={(e) => setInkOpacity(Number(e.target.value))}
                  aria-label="Opacidade do marca-texto"
                  className="h-1 flex-1 accent-accent-600"
                />
                <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-ink-400">
                  {inkOpacity}%
                </span>
              </label>
            )}

            {tool === 'eraser' && (
              <label className="mt-2 flex items-center gap-2 px-1">
                <span className="shrink-0 text-[10px] text-ink-400">Raio</span>
                <input
                  type="range"
                  min={10}
                  max={80}
                  value={eraserRadius}
                  onChange={(e) => setEraserRadius(Number(e.target.value))}
                  aria-label="Raio da borracha"
                  className="h-1 flex-1 accent-accent-600"
                />
                <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-ink-400">
                  {eraserRadius}px
                </span>
              </label>
            )}
          </>
        )}

        <p className="px-1 pb-1.5 pt-4 secao">
          Formas
        </p>
        {palette.groups.map((group) => {
          const aberto = openGroups.has(group.id)
          return (
            <div key={group.id} className="mb-1">
              <button
                onClick={() =>
                  setOpenGroups((atual) => {
                    const copia = new Set(atual)
                    if (copia.has(group.id)) copia.delete(group.id)
                    else copia.add(group.id)
                    return copia
                  })
                }
                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              >
                {group.label}
                <Plus
                  size={11}
                  className={cn('transition-transform', aberto && 'rotate-45')}
                />
              </button>
              {aberto && (
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
          )
        })}

        <p className="px-1 pb-1.5 pt-4 secao">
          Conector
        </p>
        {palette.edgeGroups.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="px-1.5 py-0.5 secao">
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
          Ctrl+roda dá zoom. Ctrl+arrastar marca vários. Delete apaga, Ctrl+C/Ctrl+V copia e cola. Botão direito duplica ou exclui.
        </p>
      </div>

      {/* Área de desenho.

          A classe de tema fica AQUI, no contêiner do quadro: o `darkMode`
          do Tailwind foi configurado para obedecer ao `.dark`/`.light` mais
          próximo, então todos os utilitários `dark:` daqui para dentro
          passam a seguir o quadro. Em "system" não estampamos nada e o
          `<html>` continua mandando, como sempre. */}
      <div
        onDragOver={(event) => {
          // Sem o preventDefault o navegador recusa o drop e o cursor
          // fica com o símbolo de proibido.
          if (hasItemPayload(event)) event.preventDefault()
        }}
        onDrop={soltarDocumento}
        className={cn(
          'relative min-w-0 flex-1',
          boardTheme === 'dark' && 'dark',
          boardTheme === 'light' && 'light',
        )}
      >
        <svg
          ref={svgRef}
          // Marca para o exportador achar o desenho sem que o editor
          // precise devolver uma ref por três níveis de componente só
          // para isso. Um atributo `data-` é o acoplamento mais fraco
          // que resolve: quem não exporta nem sabe que ele existe.
          data-graph-canvas="true"
          //: Fundo sólido de verdade: o branco translúcido (bg-ink-50/40) deixava
          //: o quadro "meio transparente" sobre o cinza da página — o claro
          //: parecia sujo e o escuro nem era escuro.
          className={cn(
            'h-full w-full touch-none select-none bg-white dark:bg-ink-900',
            tool === 'select' && 'cursor-default',
            tool === 'text' && 'cursor-text',
            isShapeTool && 'cursor-crosshair',
          )}
          // A borracha esconde o cursor do sistema: quem dá o retorno é o
          // círculo pontilhado logo abaixo, que tem o raio EXATO do que
          // será apagado. Dois indicadores mostrariam duas áreas.
          style={
            tool === 'eraser'
              ? { cursor: 'none' }
              : isStrokeTool
                ? { cursor: CURSOR_LAPIS }
                : undefined
          }
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={(event) => {
            handlePointerUp(event)
            // A prévia da borracha acompanha o ponteiro; sem isto ela
            // ficaria congelada na borda depois que o mouse saiu.
            setPointer(null)
          }}
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

            {/* Retângulo da seleção de área: mescla a intenção do gesto
                com um fundo translúcido para quem arrasta não perder a
                seleção atual de vista. */}
            {selectRect && (() => {
              const area = rectBetween(selectRect.origin, selectRect.current)
              return (
                <rect
                  x={area.x}
                  y={area.y}
                  width={area.w}
                  height={area.h}
                  fill="rgb(99 102 241 / 0.08)"
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
                selected={selecionados.includes(node.id)}
                connecting={connecting?.from === node.id}
                onPointerDown={(e) => handleNodePointerDown(e, node)}
                onContextMenu={(e) => handleNodeContextMenu(e, node)}
                onDoubleClick={() => {
                  // Nó ligado a um documento ABRE o documento — é o que
                  // o transforma em atalho de verdade em vez de desenho
                  // de folha. Renomear o rótulo continua pelo painel de
                  // propriedades.
                  if (node.document_id) {
                    onAbrirDocumento?.(node.document_id, node.document_kind)
                    return
                  }
                  // Forma do canvas é sem texto: duplo clique não abre
                  // campo nenhum.
                  if (permiteTexto(node)) setEditingNode(node.id)
                }}
                editing={editingNode === node.id && permiteTexto(node)}
                onCommitText={(texto) => {
                  onCommit?.(updateNode(node.id, { text: texto }))
                  setEditingNode(null)
                }}
                onCancelText={() => setEditingNode(null)}
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

            {/* Traços à mão livre ficam POR CIMA das formas: caneta é
                anotação, e anotação vai em cima do que anota. Cada traço
                tem um alvo de clique invisível (como as arestas) para a
                seleção pegá-lo como objeto. */}
            {strokes.map((stroke) => {
            const xs = stroke.points.map((p) => p[0])
            const ys = stroke.points.map((p) => p[1])
            const minX = Math.min(...xs)
            const maxX = Math.max(...xs)
            const minY = Math.min(...ys)
            const maxY = Math.max(...ys)
            const margem = stroke.width / 2 + 5
            const selecionado = strokesSelecionados.includes(stroke.id)
            return (
              <g
                key={stroke.id}
                className={tool === 'select' ? 'cursor-move' : undefined}
                onPointerDown={(e) => handleStrokePointerDown(e, stroke)}
              >
                <path
                  d={
                    stroke.tool === 'marker'
                      ? brushPath(stroke.points, stroke.width)
                      : strokePath(stroke.points)
                  }
                  fill={stroke.tool === 'marker' ? stroke.color : 'none'}
                  stroke={stroke.color}
                  strokeWidth={stroke.tool === 'marker' ? 0 : stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={stroke.opacity ?? STROKE_TOOLS[stroke.tool]?.opacity ?? 1}
                  pointerEvents="none"
                />
                <path
                  d={strokePath(stroke.points)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(14, stroke.width)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {selecionado && (
                  <rect
                    x={minX - margem}
                    y={minY - margem}
                    width={maxX - minX + margem * 2}
                    height={maxY - minY + margem * 2}
                    rx={6}
                    fill="none"
                    className="stroke-accent-500"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    pointerEvents="none"
                  />
                )}
              </g>
            )
          })}
          {drawing?.points?.length > 1 && (
            <path
              d={
                drawing.tool === 'marker'
                  ? brushPath(drawing.points, drawing.width)
                  : strokePath(drawing.points)
              }
              fill={drawing.tool === 'marker' ? drawing.color : 'none'}
              stroke={drawing.color}
              strokeWidth={drawing.tool === 'marker' ? 0 : drawing.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={drawing.opacity ?? STROKE_TOOLS[drawing.tool]?.opacity ?? 1}
            />
          )}
          </g>

          {/* Prévia da borracha: o raio EXATO que `eraseAt` vai apagar.
              `eraserRadius` é medida de mundo — é assim que
              `eraseFromStroke` a usa — então aqui, fora do <g> que carrega
              o transform, ela precisa ser convertida com o zoom. Desenhar
              dentro do grupo dispensaria a conta, mas o círculo herdaria a
              escala do traço e engrossaria junto. O duplo contorno mantém
              ele legível sobre o quadro claro e o escuro. */}
          {tool === 'eraser' && pointer && (
            <g pointerEvents="none">
              <circle
                cx={pointer.x}
                cy={pointer.y}
                r={eraserRadius * viewport.zoom}
                fill="none"
                stroke="#fff"
                strokeWidth={3}
                opacity={0.9}
              />
              <circle
                cx={pointer.x}
                cy={pointer.y}
                r={eraserRadius * viewport.zoom}
                fill="none"
                stroke="#1a1816"
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
            </g>
          )}
        </svg>

        {/* Controles de zoom */}
        <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-md border border-ink-200 bg-white/95 p-0.5 shadow-subtle backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
          <button
            onClick={trocarTema}
            aria-label="Tema do quadro"
            title={`Tema do quadro: ${
              { light: 'claro', dark: 'escuro', system: 'segue o app' }[boardTheme]
            }`}
            className="rounded p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            {boardTheme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <span className="mx-0.5 h-4 w-px bg-ink-200 dark:bg-ink-700" />
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
            onClick={() => onCommit?.(update({ strokes: [] }))}
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

        {/* Menu de botão direito. O véu cobre o quadro para o próximo
            clique (qualquer lugar) fechar o menu — inclusive o próprio
            botão direito, que também é interceptado. */}
        {menu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onPointerDown={fecharMenu}
              onContextMenu={(event) => {
                event.preventDefault()
                fecharMenu()
              }}
            />
            <div
              className="absolute z-20 w-40 overflow-hidden rounded-md border border-ink-200 bg-white py-1 shadow-card dark:border-ink-700 dark:bg-ink-800"
              style={{ left: menu.x, top: menu.y }}
            >
              <button
                onClick={() => {
                  fecharMenu()
                  duplicarSelecao()
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-600 transition hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
              >
                <Copy size={13} />
                Duplicar
              </button>
              <button
                onClick={() => {
                  fecharMenu()
                  apagarSelecao()
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <Trash2 size={13} />
                Excluir
              </button>
            </div>
          </>
        )}
      </div>

      {/* Inspetor.
          Agora vive só da seleção. O duplo clique deixou de abrir painel:
          ele edita o rótulo no próprio nó. O inspetor continua sendo onde
          moram as propriedades que NÃO são texto — cor, tamanho, atributos
          de classe, conexões — e essas nada ganham em ficar sobre o
          desenho. */}
      {selectedNode && (
        <NodeInspector
          node={selectedNode}
          kind={kind}
          edges={edges}
          onChange={(patch) => {
            updateNode(selectedNode.id, patch)
            // Cada tecla gera um update, mas gravar sessenta snapshots
            // por segundo é desperdício. O commit vai adiado: undo pula
            // de edição em edição, não de caractere em caractere.
            clearTimeout(inspectorCommitRef.current)
            inspectorCommitRef.current = setTimeout(() => onCommit?.(), 400)
          }}
          onChangeEdge={(id, patch) => {
            update({ edges: edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
            clearTimeout(inspectorCommitRef.current)
            inspectorCommitRef.current = setTimeout(() => onCommit?.(), 400)
          }}
          onDeleteEdge={deleteEdge}
          onDelete={() => {
            onCommit?.(deleteNode(selectedNode.id))
            setSelecionados([])
            setEditingNode(null)
          }}
          onClose={() => setSelecionados([])}
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
        <span className="secao">
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
                  <span className="secao">
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

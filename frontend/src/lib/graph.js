/**
 * Vocabulário e geometria dos editores de nós-e-setas.
 *
 * Diagrama e canvas compartilham o mesmo motor; o que muda é a paleta.
 * As listas espelham `backend/content/schemas.py` — o backend valida
 * contra elas e recusa um tipo que o frontend invente.
 */

/* -------------------------------------------------------------------- */
/* Paleta do diagrama                                                   */
/* -------------------------------------------------------------------- */

/**
 * Formas agrupadas por família. O agrupamento é só da interface: nada
 * impede misturar um ator com um processo no mesmo quadro, porque um
 * diagrama de verdade raramente respeita a fronteira do livro-texto.
 */
export const DIAGRAM_GROUPS = [
  {
    id: 'class',
    label: 'Classes',
    types: {
      class: { label: 'Classe', w: 190, h: 120, shape: 'compartment' },
      interface: { label: 'Interface', w: 190, h: 110, shape: 'compartment' },
      abstract: { label: 'Classe abstrata', w: 190, h: 120, shape: 'compartment' },
      enum: { label: 'Enum', w: 170, h: 110, shape: 'compartment' },
      package: { label: 'Pacote', w: 200, h: 130, shape: 'package' },
      component: { label: 'Componente', w: 180, h: 90, shape: 'component' },
      deployment: { label: 'Nó de implantação', w: 180, h: 100, shape: 'cube' },
    },
  },
  {
    id: 'usecase',
    label: 'Casos de uso',
    types: {
      actor: { label: 'Ator', w: 80, h: 110, shape: 'actor' },
      usecase: { label: 'Caso de uso', w: 170, h: 74, shape: 'ellipse' },
      boundary: { label: 'Fronteira', w: 150, h: 90, shape: 'boundary' },
      control: { label: 'Controle', w: 120, h: 90, shape: 'control' },
      entity: { label: 'Entidade', w: 130, h: 90, shape: 'entity' },
    },
  },
  {
    id: 'sequence',
    label: 'Sequência',
    types: {
      lifeline: { label: 'Linha de vida', w: 150, h: 260, shape: 'lifeline' },
      activation: { label: 'Ativação', w: 18, h: 120, shape: 'rect' },
      fragment: { label: 'Fragmento (alt/loop)', w: 300, h: 180, shape: 'fragment' },
    },
  },
  {
    id: 'activity',
    label: 'Atividade e estado',
    types: {
      start: { label: 'Início', w: 40, h: 40, shape: 'filled-circle' },
      end: { label: 'Fim', w: 44, h: 44, shape: 'end-circle' },
      action: { label: 'Ação', w: 170, h: 66, shape: 'rounded' },
      decision: { label: 'Decisão', w: 130, h: 90, shape: 'diamond' },
      merge: { label: 'Junção', w: 110, h: 74, shape: 'diamond' },
      fork: { label: 'Bifurcação', w: 180, h: 12, shape: 'bar' },
      join: { label: 'Sincronização', w: 180, h: 12, shape: 'bar' },
      state: { label: 'Estado', w: 160, h: 70, shape: 'rounded' },
    },
  },
  {
    id: 'er',
    label: 'Entidade-relacionamento',
    types: {
      er_entity: { label: 'Entidade', w: 170, h: 70, shape: 'rect' },
      er_weak_entity: { label: 'Entidade fraca', w: 170, h: 74, shape: 'double-rect' },
      er_relationship: { label: 'Relacionamento', w: 150, h: 90, shape: 'diamond' },
      er_attribute: { label: 'Atributo', w: 130, h: 60, shape: 'ellipse' },
      er_key_attribute: { label: 'Atributo-chave', w: 140, h: 60, shape: 'key-ellipse' },
    },
  },
  {
    id: 'flow',
    label: 'Fluxograma',
    types: {
      terminator: { label: 'Terminal', w: 150, h: 60, shape: 'stadium' },
      process: { label: 'Processo', w: 170, h: 70, shape: 'rect' },
      io: { label: 'Entrada/saída', w: 170, h: 70, shape: 'parallelogram' },
      database: { label: 'Banco de dados', w: 150, h: 90, shape: 'cylinder' },
      document: { label: 'Documento', w: 160, h: 90, shape: 'document' },
      manual: { label: 'Operação manual', w: 160, h: 70, shape: 'trapezoid' },
      delay: { label: 'Espera', w: 150, h: 70, shape: 'delay' },
    },
  },
  {
    id: 'generic',
    label: 'Genéricos',
    types: {
      note: { label: 'Nota', w: 170, h: 90, shape: 'note' },
      text: { label: 'Texto', w: 180, h: 44, shape: 'bare' },
      rect: { label: 'Retângulo', w: 160, h: 80, shape: 'rect' },
      rounded: { label: 'Arredondado', w: 160, h: 80, shape: 'rounded' },
      ellipse: { label: 'Elipse', w: 160, h: 90, shape: 'ellipse' },
      diamond: { label: 'Losango', w: 150, h: 100, shape: 'diamond' },
      cylinder: { label: 'Cilindro', w: 140, h: 90, shape: 'cylinder' },
      cloud: { label: 'Nuvem', w: 170, h: 100, shape: 'cloud' },
      hexagon: { label: 'Hexágono', w: 160, h: 80, shape: 'hexagon' },
    },
  },
]

/** Mapa plano tipo → preset, que a geometria e o desenho consultam. */
export const DIAGRAM_NODES = Object.fromEntries(
  DIAGRAM_GROUPS.flatMap((group) => Object.entries(group.types)),
)

export const DIAGRAM_EDGE_GROUPS = [
  {
    label: 'Estrutura',
    types: {
      association: { label: 'Associação', dash: null, head: 'none' },
      directed: { label: 'Direcionada', dash: null, head: 'arrow' },
      inheritance: { label: 'Herança', dash: null, head: 'triangle' },
      implementation: { label: 'Implementação', dash: '6 4', head: 'triangle' },
      composition: { label: 'Composição', dash: null, head: 'arrow', tail: 'diamond-filled' },
      aggregation: { label: 'Agregação', dash: null, head: 'arrow', tail: 'diamond-hollow' },
      dependency: { label: 'Dependência', dash: '6 4', head: 'arrow' },
    },
  },
  {
    label: 'Sequência',
    types: {
      message: { label: 'Mensagem', dash: null, head: 'arrow' },
      message_async: { label: 'Mensagem assíncrona', dash: null, head: 'open-arrow' },
      message_return: { label: 'Retorno', dash: '5 4', head: 'open-arrow' },
      message_create: { label: 'Criação', dash: '5 4', head: 'arrow' },
      message_destroy: { label: 'Destruição', dash: null, head: 'cross' },
    },
  },
  {
    label: 'Fluxo',
    types: {
      flow: { label: 'Fluxo', dash: null, head: 'arrow' },
      transition: { label: 'Transição', dash: null, head: 'arrow' },
      control_flow: { label: 'Fluxo de controle', dash: null, head: 'arrow' },
      object_flow: { label: 'Fluxo de objeto', dash: '4 3', head: 'arrow' },
    },
  },
  {
    label: 'Cardinalidade (ER)',
    types: {
      er_one_one: { label: 'Um para um', dash: null, head: 'bar', tail: 'bar' },
      er_one_many: { label: 'Um para muitos', dash: null, head: 'crowfoot', tail: 'bar' },
      er_many_many: { label: 'Muitos para muitos', dash: null, head: 'crowfoot', tail: 'crowfoot' },
      er_optional: { label: 'Opcional', dash: null, head: 'circle-bar', tail: 'bar' },
    },
  },
  {
    label: 'Genéricos',
    types: {
      line: { label: 'Linha', dash: null, head: 'none' },
      dashed: { label: 'Tracejada', dash: '6 4', head: 'none' },
      arrow: { label: 'Seta', dash: null, head: 'arrow' },
      double_arrow: { label: 'Seta dupla', dash: null, head: 'arrow', tail: 'arrow' },
    },
  },
]

export const DIAGRAM_EDGES = Object.fromEntries(
  DIAGRAM_EDGE_GROUPS.flatMap((group) => Object.entries(group.types)),
)

/* -------------------------------------------------------------------- */
/* Paleta do canvas (whiteboard)                                        */
/* -------------------------------------------------------------------- */

export const CANVAS_GROUPS = [
  {
    id: 'content',
    label: 'Conteúdo',
    types: {
      sticky: { label: 'Post-it', w: 180, h: 180, shape: 'sticky' },
      card: { label: 'Cartão', w: 220, h: 130, shape: 'rect' },
      text: { label: 'Texto', w: 200, h: 44, shape: 'bare' },
      heading: { label: 'Título', w: 260, h: 60, shape: 'bare-large' },
      link: { label: 'Link', w: 220, h: 80, shape: 'rect' },
      document: { label: 'Documento', w: 220, h: 90, shape: 'rect' },
      image: { label: 'Imagem', w: 220, h: 160, shape: 'image' },
      group: { label: 'Área', w: 340, h: 240, shape: 'group' },
    },
  },
  {
    id: 'shapes',
    label: 'Formas',
    types: {
      rect: { label: 'Retângulo', w: 160, h: 100, shape: 'rect' },
      rounded: { label: 'Arredondado', w: 160, h: 100, shape: 'rounded' },
      ellipse: { label: 'Elipse', w: 160, h: 110, shape: 'ellipse' },
      triangle: { label: 'Triângulo', w: 140, h: 120, shape: 'triangle' },
      diamond: { label: 'Losango', w: 140, h: 120, shape: 'diamond' },
      star: { label: 'Estrela', w: 130, h: 130, shape: 'star' },
      arrow_shape: { label: 'Seta', w: 160, h: 70, shape: 'arrow-shape' },
      line_shape: { label: 'Linha', w: 180, h: 10, shape: 'bar' },
    },
  },
]

export const CANVAS_NODES = Object.fromEntries(
  CANVAS_GROUPS.flatMap((group) => Object.entries(group.types)),
)

export const CANVAS_EDGES = {
  arrow: { label: 'Seta', dash: null, head: 'arrow' },
  line: { label: 'Linha', dash: null, head: 'none' },
  dashed: { label: 'Tracejada', dash: '6 4', head: 'arrow' },
  double_arrow: { label: 'Seta dupla', dash: null, head: 'arrow', tail: 'arrow' },
  curve: { label: 'Curva', dash: null, head: 'arrow', curved: true },
}

/** Ferramentas de desenho à mão livre do whiteboard. */
export const STROKE_TOOLS = {
  pen: { label: 'Caneta', width: 3, opacity: 1 },
  marker: { label: 'Marcador', width: 8, opacity: 1 },
  highlighter: { label: 'Marca-texto', width: 18, opacity: 0.35 },
  eraser: { label: 'Borracha', width: 20, opacity: 1 },
}

export const STROKE_WIDTHS = [1, 2, 3, 5, 8, 12, 20]

/**
 * Formas que viram FERRAMENTA: escolhidas na barra e desenhadas
 * arrastando na tela, como num programa de pintura.
 *
 * Post-it, cartão e área continuam saindo da paleta com tamanho padrão —
 * são blocos de conteúdo, e arrastar para dimensioná-los antes de haver
 * texto dentro seria trabalho sem propósito.
 */
export const DRAWABLE_SHAPES = [
  'rect', 'rounded', 'ellipse', 'triangle', 'diamond', 'star', 'arrow_shape', 'line_shape',
]

/** Retângulo normalizado entre dois pontos, em qualquer direção de arraste. */
export function rectBetween(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

export function paletteFor(kind) {
  return kind === 'diagram'
    ? {
        groups: DIAGRAM_GROUPS,
        nodes: DIAGRAM_NODES,
        edgeGroups: DIAGRAM_EDGE_GROUPS,
        edges: DIAGRAM_EDGES,
        defaultEdge: 'association',
      }
    : {
        groups: CANVAS_GROUPS,
        nodes: CANVAS_NODES,
        edgeGroups: [{ label: 'Conectores', types: CANVAS_EDGES }],
        edges: CANVAS_EDGES,
        defaultEdge: 'arrow',
      }
}

export const NODE_COLORS = [
  '#6366F1', '#0EA5E9', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#8B5CF6', '#64748B', '#0F172A',
]

export const STICKY_COLORS = [
  '#FEF08A', '#BBF7D0', '#BFDBFE', '#FBCFE8', '#FED7AA', '#DDD6FE', '#E5E7EB',
]

/* -------------------------------------------------------------------- */
/* Geometria                                                            */
/* -------------------------------------------------------------------- */

export const uid = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 9)}`

export const nodeRect = (node, palette) => {
  const preset = palette[node.type] ?? { w: 160, h: 90 }
  return {
    x: node.x,
    y: node.y,
    w: node.w ?? preset.w,
    h: node.h ?? preset.h,
  }
}

const center = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })

/**
 * Ponto onde a seta encosta na borda do nó.
 *
 * Sem isso a linha iria de centro a centro e ficaria escondida por baixo
 * das formas. Projetamos o vetor entre os centros até a borda do retângulo
 * de destino, o que dá um encaixe correto em qualquer ângulo.
 */
export function anchorPoint(fromRect, toRect) {
  const from = center(fromRect)
  const to = center(toRect)

  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return from

  const halfW = fromRect.w / 2
  const halfH = fromRect.h / 2

  // Escala que leva o vetor até a borda: a menor entre o corte horizontal
  // e o vertical é a que realmente toca o retângulo.
  const scaleX = dx === 0 ? Infinity : halfW / Math.abs(dx)
  const scaleY = dy === 0 ? Infinity : halfH / Math.abs(dy)
  const scale = Math.min(scaleX, scaleY)

  return { x: from.x + dx * scale, y: from.y + dy * scale }
}

/** Caminho da aresta já recortado nas bordas dos dois nós. */
export function edgeGeometry(edge, nodes, palette) {
  const fromNode = nodes.find((n) => n.id === edge.from)
  const toNode = nodes.find((n) => n.id === edge.to)
  if (!fromNode || !toNode) return null

  const fromRect = nodeRect(fromNode, palette)
  const toRect = nodeRect(toNode, palette)
  const waypoints = edge.waypoints ?? []

  // Com pontos de rota, o recorte usa o primeiro/último waypoint como
  // referência, senão a seta apontaria para o destino ignorando o desvio.
  const firstTarget = waypoints[0]
    ? { x: waypoints[0].x, y: waypoints[0].y, w: 0, h: 0 }
    : toRect
  const lastSource = waypoints.length
    ? { ...waypoints[waypoints.length - 1], w: 0, h: 0 }
    : fromRect

  return {
    start: anchorPoint(fromRect, firstTarget),
    end: anchorPoint(toRect, lastSource),
    waypoints,
  }
}

/** `d` de um <path> passando pelos pontos de rota. */
export function edgePath(geometry, curved = false) {
  const points = [geometry.start, ...geometry.waypoints, geometry.end]
  if (points.length === 2 && curved) {
    const [a, b] = points
    // Curva suave: o ponto de controle sai perpendicular ao meio do
    // segmento, o que evita duas arestas paralelas se sobreporem.
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const offset = Math.hypot(b.x - a.x, b.y - a.y) * 0.2
    const nx = -(b.y - a.y)
    const ny = b.x - a.x
    const len = Math.hypot(nx, ny) || 1
    return `M ${a.x} ${a.y} Q ${mx + (nx / len) * offset} ${my + (ny / len) * offset} ${b.x} ${b.y}`
  }
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

/** Converte coordenadas de tela para coordenadas do mundo do canvas. */
export function toWorld({ x, y }, viewport) {
  return {
    x: (x - viewport.x) / viewport.zoom,
    y: (y - viewport.y) / viewport.zoom,
  }
}

export const clampZoom = (zoom) => Math.min(3, Math.max(0.15, zoom))

/** Enquadra todo o conteúdo (nós e traços) na área visível. */
export function fitViewport(nodes, strokes, palette, width, height) {
  const boxes = nodes.map((n) => nodeRect(n, palette))
  strokes?.forEach((stroke) => {
    const xs = stroke.points.map((p) => p[0])
    const ys = stroke.points.map((p) => p[1])
    boxes.push({
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    })
  })
  if (!boxes.length) return { x: 0, y: 0, zoom: 1 }

  const minX = Math.min(...boxes.map((r) => r.x))
  const minY = Math.min(...boxes.map((r) => r.y))
  const maxX = Math.max(...boxes.map((r) => r.x + r.w))
  const maxY = Math.max(...boxes.map((r) => r.y + r.h))

  const padding = 60
  const zoom = clampZoom(
    Math.min(
      (width - padding * 2) / (maxX - minX || 1),
      (height - padding * 2) / (maxY - minY || 1),
    ),
  )

  return {
    zoom,
    x: (width - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (height - (maxY - minY) * zoom) / 2 - minY * zoom,
  }
}

/**
 * Suaviza um traço à mão livre com curvas quadráticas entre os pontos
 * médios. Ligar os pontos com retas mostraria cada amostra do ponteiro e
 * o traço sairia serrilhado.
 */
export function strokePath(points) {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  }
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    d += ` Q ${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last[0]} ${last[1]}`
}

/* --------------------------------------------------------------------- */
/* Borracha                                                              */
/*                                                                       */
/* A borracha apaga só o que passa debaixo dela, como a do Paint: o traço */
/* atingido no meio vira dois pedaços, e as pontas que sobraram continuam */
/* existindo. Apagar o traço inteiro seria "excluir objeto", que é outra  */
/* ferramenta e outra intenção.                                          */
/* --------------------------------------------------------------------- */

/** Distância de um ponto ao segmento AB — não à reta infinita que o contém. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay)

  // Projeta o ponto no segmento e prende o resultado entre as duas pontas.
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Insere pontos intermediários nos trechos que passam perto da borracha.
 *
 * O traço é gravado por amostragem do ponteiro: um movimento rápido deixa
 * amostras distantes, e um corte no meio de um trecho longo não teria
 * ponto nenhum para remover. Só o trecho vizinho é subdividido — densificar
 * o traço inteiro incharia o payload sem necessidade.
 */
function densifyNear(points, center, reach) {
  const step = Math.max(reach / 2, 1)
  const out = []

  for (let i = 0; i < points.length; i += 1) {
    out.push(points[i])
    const next = points[i + 1]
    if (!next) break

    const [x1, y1] = points[i]
    const [x2, y2] = next
    const length = Math.hypot(x2 - x1, y2 - y1)
    if (length <= step) continue
    if (distanceToSegment(center.x, center.y, x1, y1, x2, y2) > reach) continue

    const parts = Math.ceil(length / step)
    for (let k = 1; k < parts; k += 1) {
      out.push([
        Math.round(x1 + ((x2 - x1) * k) / parts),
        Math.round(y1 + ((y2 - y1) * k) / parts),
      ])
    }
  }

  return out
}

/**
 * Devolve o que sobra de um traço depois de passar a borracha.
 *
 * O retorno é uma lista: vazia se o traço sumiu por inteiro, com um item
 * se só as pontas foram aparadas, e com vários se o corte foi no meio.
 * Quando nada é tocado, devolve o próprio traço — sem objeto novo, para
 * que o React não redesenhe o que não mudou.
 */
export function eraseFromStroke(stroke, center, radius) {
  const reach = radius + (stroke.width ?? 3) / 2
  const points = densifyNear(stroke.points, center, reach)

  const pieces = []
  let piece = []

  for (const point of points) {
    const erased = Math.hypot(point[0] - center.x, point[1] - center.y) <= reach
    if (erased) {
      // Um ponto solto não desenha nada; só vale como pedaço a partir de dois.
      if (piece.length >= 2) pieces.push(piece)
      piece = []
    } else {
      piece.push(point)
    }
  }
  if (piece.length >= 2) pieces.push(piece)

  if (pieces.length === 1 && pieces[0].length === stroke.points.length) return [stroke]

  return pieces.map((pts, index) => ({
    ...stroke,
    id: index === 0 ? stroke.id : `${stroke.id}x${index}${Math.random().toString(36).slice(2, 6)}`,
    points: pts,
  }))
}

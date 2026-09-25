/**
 * Merge de dados de canvas/diagrama/planilha.
 *
 * Quando o usuário pede "criar mapa mental sobre pizza" num canvas que
 * já tem conteúdo, o mapa novo deve ser SOMADO ao existente — nunca
 * substituído. Só sai conteúdo de lá se ele pedir explicitamente.
 *
 * Detalhe que motiva a renumeração: a IA sempre devolve ids curtos
 * ("n1", "n2"...). Numa segunda geração eles colidem com os do canvas.
 * Um merge por id simples DESCARTARIA os novos — era exatamente o bug:
 * "Quadro criado" na conversa e nada aparecendo no quadro.
 */

/** Gera um id livre, fora do conjunto já ocupado. */
function idLivre(base, ocupados) {
  let i = 1
  while (ocupados.has(`${base}${i}`)) i += 1
  return `${base}${i}`
}

/**
 * Junta dados novos com dados existentes de canvas ou diagrama.
 *
 * - Nodes novos entram SEMPRE, DESLOCADOS para o lado do existente —
 *   a IA gera tudo perto de (0,0); sem o deslocamento, o mapa novo
 *   nasce EM CIMA do antigo e embaralha os dois.
 * - Edges novas entram remapeadas para os ids renumerados
 * - Nada do que já existia é tocado
 */
export function mergeGrafo(existente, novo) {
  const vazio = { nodes: [], edges: [] }
  if (!existente || !novo) return novo || existente || vazio

  // Campos extras do canvas (strokes etc.) preservados do existente.
  const extras = Object.fromEntries(
    Object.entries(existente).filter(([k]) => k !== 'nodes' && k !== 'edges'),
  )

  const nodesExistentes = existente.nodes || []
  const nodesNovos = (novo.nodes || []).filter((n) => n && n.id)

  // Deslocamento do bloco novo: encosta à DIREITA do que já existe,
  // alinhado pelo topo. Sem conteúdo prévio, entra onde a IA mandou.
  let dx = 0
  let dy = 0
  if (nodesExistentes.length > 0 && nodesNovos.length > 0) {
    const bordaDireita = Math.max(
      ...nodesExistentes.map((n) => (n.x ?? 0) + (n.w ?? 170)),
    )
    const topoExistente = Math.min(...nodesExistentes.map((n) => n.y ?? 0))
    const esquerdaNova = Math.min(...nodesNovos.map((n) => n.x ?? 0))
    const topoNovo = Math.min(...nodesNovos.map((n) => n.y ?? 0))
    dx = bordaDireita + GAP_ENTRE_BLOCOS - esquerdaNova
    dy = topoExistente - topoNovo
  }

  const nodes = [...nodesExistentes]
  const edges = [...(existente.edges || [])]

  const idsNode = new Set(nodes.map((n) => n.id))
  const idsEdge = new Set(edges.map((e) => e.id))

  // Mapa de tradução: id que veio da IA -> id único neste documento.
  const traducao = new Map()

  for (const node of nodesNovos) {
    let idFinal = node.id
    if (traducao.has(node.id)) {
      idFinal = traducao.get(node.id)
    } else if (idsNode.has(node.id)) {
      // Colisão: renumera ("n1" ocupado -> "nN" livre).
      idFinal = idLivre('n', idsNode)
      traducao.set(node.id, idFinal)
    }
    if (idFinal !== node.id) {
      traducao.set(node.id, idFinal)
    }
    idsNode.add(idFinal)
    nodes.push({ ...node, id: idFinal, x: (node.x ?? 0) + dx, y: (node.y ?? 0) + dy })
  }

  for (const edge of novo.edges || []) {
    if (!edge || !edge.id) continue
    const idFinal = idsEdge.has(edge.id) ? idLivre('e', idsEdge) : edge.id
    idsEdge.add(idFinal)
    edges.push({
      ...edge,
      id: idFinal,
      // Pontas da aresta seguem os nodes para quem foram renomeadas.
      from: traducao.get(edge.from) ?? edge.from,
      to: traducao.get(edge.to) ?? edge.to,
    })
  }

  // Aresta órfã (aponta para node que não existe) não deve entrar —
  // a validação do editor a descartaria de qualquer forma.
  const validas = edges.filter((e) => idsNode.has(e.from) && idsNode.has(e.to))

  return { ...extras, nodes, edges: validas }
}

/** Folga entre o bloco existente e o bloco gerado. */
const GAP_ENTRE_BLOCOS = 160

/**
 * Merge de planilha: adiciona linhas e colunas novas, mantendo as antigas.
 * Ids que colidem são renumerados pelo mesmo motivo dos grafos.
 */
export function mergePlanilha(existente, novo) {
  const vazio = { columns: [], rows: [] }
  if (!existente || !novo) return novo || existente || vazio

  const columns = [...(existente.columns || [])]
  const rows = [...(existente.rows || [])].map((r) => ({ ...r, cells: { ...(r.cells || {}) } }))

  const idsColuna = new Set(columns.map((c) => c.id))
  const colunaPorId = new Map(columns.map((c) => [c.id, c]))
  const traducaoColuna = new Map()

  for (const col of novo.columns || []) {
    if (!col || !col.id) continue
    // Mesmo id E mesmo nome é a coluna de antes ecoada de volta: pula.
    // Id repetido com nome diferente é coluna NOVA (ex.: "Nome" e "Nota"
    // saíram como c1 na mesma resposta): renumera para não perder.
    const atual = colunaPorId.get(col.id)
    if (atual && atual.name === col.name && atual.type === col.type) continue
    let idFinal = col.id
    if (idsColuna.has(col.id)) {
      idFinal = idLivre('c', idsColuna)
      traducaoColuna.set(col.id, idFinal)
    }
    idsColuna.add(idFinal)
    columns.push({ ...col, id: idFinal })
  }

  const idsLinha = new Set(rows.map((r) => r.id))
  for (const row of novo.rows || []) {
    if (!row || !row.id) continue
    // Linha com id já existente é eco do que a IA leu na planilha
    // (planilha.preencher devolve o padrão inteiro): pula em vez de
    // duplicar. Colunas renumeram porque nome diferente é coluna nova.
    if (idsLinha.has(row.id)) continue

    idsLinha.add(row.id)

    // Células seguem as colunas renumeradas.
    const cells = {}
    for (const [idCol, valor] of Object.entries(row.cells || {})) {
      cells[traducaoColuna.get(idCol) ?? idCol] = valor
    }
    rows.push({ ...row, cells })
  }

  return { columns, rows }
}

/**
 * Acrescenta texto como nova seção da nota.
 *
 * Parágrafos separados por linha em branco viram blocos `<p>` próprios —
 * colar tudo num `<p>` só perde a quebra na hora de editar.
 */
export function mergeNotaTexto(dados, texto) {
  const limpo = String(texto || '').trim()
  if (!limpo) return dados || { sections: [] }
  const paragrafos = limpo
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        // `<br />`, e não `<br`: faltando o fecho, o navegador engolia o
        // resto do parágrafo dentro de uma tag que nunca terminava — e
        // some justamente o texto que veio DEPOIS da quebra de linha.
        `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')}</p>`,
    )
  const sections = [...(dados?.sections || []), {
    id: `s${Date.now()}`,
    type: 'text',
    html: paragrafos.join(''),
  }]
  return { ...(dados || {}), sections }
}

/**
 * Decide qual merge usar baseado no kind do documento.
 *
 * `substituir` força troca total — para quando o usuário pediu
 * explicitamente regenerar/refazer/limpar.
 */
export function mergeDocumento(kind, existente, novo, { substituir = false } = {}) {
  if (substituir) return novo
  if (kind === 'spreadsheet') return mergePlanilha(existente, novo)
  if (kind === 'diagram' || kind === 'canvas') return mergeGrafo(existente, novo)
  // Nota e outros: substitui (acrescentar texto solto duplicaria seções).
  return novo
}

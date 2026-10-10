/**
 * Design: a regra do editor de telas, sem React.
 *
 * O documento é uma árvore de camadas por página (formato em
 * docs/plans/2026-10-10-design.md). Coordenadas são RELATIVAS AO PAI, como
 * no Figma: mover um frame não reescreve os filhos, e o HTML aninha do
 * mesmo jeito. Tudo aqui é imutável e devolve a mesma referência quando
 * nada muda — é o que deixa o `memo` das camadas pular o que não mexeu.
 *
 * O CSS de cada camada também sai daqui (`estiloDaCamada`): a tela, a
 * exportação e a aba "Código" desenham com a mesma função.
 */

import { t } from './i18n.js'
import { alinhar as alinharNaGrade } from './inicio.js'

export const CONTEINERES = new Set(['frame', 'group'])

/** Tamanhos prontos do frame, como no painel do Figma. */
export const PRESETS_DE_FRAME = [
  {
    get grupo() { return t('Celular') },
    itens: [
      { nome: 'iPhone 16', w: 393, h: 852 },
      { nome: 'iPhone 16 Pro Max', w: 440, h: 956 },
      { nome: 'iPhone SE', w: 375, h: 667 },
      { nome: 'Android', w: 412, h: 917 },
    ],
  },
  {
    get grupo() { return t('Tablet') },
    itens: [
      { nome: 'iPad mini', w: 744, h: 1133 },
      { nome: 'iPad Pro 11"', w: 834, h: 1194 },
      { nome: 'Android Tablet', w: 800, h: 1280 },
    ],
  },
  {
    get grupo() { return t('Computador') },
    itens: [
      { nome: 'Desktop', w: 1440, h: 1024 },
      { nome: 'MacBook Air', w: 1280, h: 832 },
      { nome: 'Full HD', w: 1920, h: 1080 },
    ],
  },
  {
    get grupo() { return t('Apresentação e redes') },
    itens: [
      { nome: 'Slide 16:9', w: 1920, h: 1080 },
      { nome: 'Instagram post', w: 1080, h: 1350 },
      { nome: 'Story', w: 1080, h: 1920 },
      { nome: 'A4', w: 595, h: 842 },
    ],
  },
]

/** Fontes sugeridas: as que vêm com Windows, macOS e Android. Qualquer outra instalada serve. */
export const FONTES_SUGERIDAS = [
  'Segoe UI', 'Inter', 'Roboto', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Calibri', 'Georgia', 'Times New Roman', 'Cambria', 'Garamond', 'Courier New', 'Consolas',
  'Cascadia Code', 'system-ui',
]

export const PESOS_DE_FONTE = [100, 200, 300, 400, 500, 600, 700, 800, 900]

const NOMES_DO_TIPO = {
  frame: () => t('Frame'),
  group: () => t('Grupo'),
  rect: () => t('Retângulo'),
  ellipse: () => t('Elipse'),
  line: () => t('Linha'),
  text: () => t('Texto'),
}
export const nomeDoTipo = (tipo) => NOMES_DO_TIPO[tipo]?.() ?? tipo

export const RESTRICAO_PADRAO = { h: 'left', v: 'top' }

const arred = (n) => Math.round(n * 100) / 100
const novoId = (prefixo = 'l') => `${prefixo}${Math.random().toString(36).slice(2, 10)}`

/* ------------------------------------------------------------------ */
/* Documento e camadas novas                                          */
/* ------------------------------------------------------------------ */

export function designVazio() {
  return { version: 1, pages: [novaPagina(1)], viewport: {} }
}

export function novaPagina(n) {
  return { id: novoId('p'), name: t('Página {n}', { n }), background: null, children: [] }
}

/** Próximo nome livre da página: "Retângulo 3", "Frame 2"... */
export function nomeLivre(children, base) {
  let maior = 0
  percorrer(children, (c) => {
    const m = typeof c.name === 'string' && c.name.startsWith(`${base} `) && /^\d+$/.exec(c.name.slice(base.length + 1))
    if (m) maior = Math.max(maior, Number(m[0]))
  })
  return `${base} ${maior + 1}`
}

const BRANCO = { type: 'solid', color: '#FFFFFF', opacity: 1 }
const CINZA = { type: 'solid', color: '#D9D9D9', opacity: 1 }

/** Camada nova com os padrões do Figma para o tipo. */
export function novaCamada(tipo, campos = {}) {
  const base = { id: novoId(), type: tipo, x: 0, y: 0, w: 100, h: 100 }
  const porTipo = {
    frame: { fills: [{ ...BRANCO }], clip: true, children: [] },
    group: { children: [] },
    rect: { fills: [{ ...CINZA }] },
    ellipse: { fills: [{ ...CINZA }] },
    line: { h: 0, strokes: [{ type: 'solid', color: '#000000', opacity: 1 }], strokeWidth: 1 },
    text: {
      text: '',
      w: 0,
      h: 0,
      fills: [{ type: 'solid', color: '#000000', opacity: 1 }],
      font: { family: 'Segoe UI', size: 16, weight: 400 },
      autoSize: 'width',
    },
  }
  return { ...base, ...porTipo[tipo], ...campos }
}

/** Cópia funda com ids novos em tudo (duplicar, colar). */
export function clonar(camada) {
  return {
    ...structuredClone(camada),
    id: novoId(),
    ...(camada.children ? { children: camada.children.map(clonar) } : {}),
  }
}

/* ------------------------------------------------------------------ */
/* Consultas na árvore                                                */
/* ------------------------------------------------------------------ */

export function percorrer(children, fn, pai = null) {
  for (const c of children ?? []) {
    fn(c, pai)
    if (c.children) percorrer(c.children, fn, c)
  }
}

/** Do topo até a camada: `[frame, grupo, retângulo]`. Vazio se não achar. */
export function caminhoAte(children, id) {
  for (const c of children ?? []) {
    if (c.id === id) return [c]
    if (c.children) {
      const resto = caminhoAte(c.children, id)
      if (resto.length) return [c, ...resto]
    }
  }
  return []
}

export const acharCamada = (children, id) => caminhoAte(children, id).at(-1) ?? null

/** O pai da camada; `null` quando ela está no topo da página. */
export function paiDe(children, id) {
  const caminho = caminhoAte(children, id)
  return caminho.length > 1 ? caminho.at(-2) : null
}

/** Retângulo na página, somando as posições dos ancestrais (rotação dos pais ignorada). */
export function caixaAbsoluta(children, id) {
  const caminho = caminhoAte(children, id)
  if (!caminho.length) return null
  const alvo = caminho.at(-1)
  let x = 0
  let y = 0
  for (const c of caminho) {
    x += c.x
    y += c.y
  }
  return { x, y, w: alvo.w, h: alvo.h, rotation: alvo.rotation ?? 0 }
}

/** `id` está dentro de `ancestral` (ou é ele)? */
export function estaDentro(children, id, ancestral) {
  return caminhoAte(children, id).some((c) => c.id === ancestral)
}

export function uniao(rects) {
  if (!rects.length) return null
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  }
}

export const intersecta = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
export const contem = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

/** Pai com auto layout: os filhos se arrumam sozinhos, menos os absolutos. */
export const temLayout = (camada) => !!camada?.layout && camada.layout.mode !== 'none' && camada.layout.mode != null
export const noFluxo = (camada, pai) => temLayout(pai) && !camada.absolute

/**
 * Quem o clique seleciona, a partir do caminho até a camada mais funda sob o
 * ponteiro. É a regra do Figma:
 *
 * - filho de frame do topo é clicável direto (o frame do topo é a "tela");
 * - grupo e frame aninhado pegam o clique, e o duplo clique entra neles;
 * - com algo selecionado, clicar num irmão dele seleciona o irmão (dentro
 *   do mesmo grupo não é preciso entrar de novo);
 * - Ctrl+clique vai direto ao mais fundo;
 * - o fundo de um frame do topo com filhos não seleciona (vira seleção de
 *   área); ele se seleciona pelo nome, acima dele.
 */
export function alvoDoClique(caminho, selecionados = [], { profundo = false } = {}) {
  if (!caminho.length) return null
  const livre = (c) => c && !c.locked
  if (profundo) return livre(caminho.at(-1)) ? caminho.at(-1).id : null

  // Contexto da seleção: o ancestral mais fundo do caminho que é pai de algo selecionado.
  const sel = new Set(selecionados)
  for (let i = caminho.length - 2; i >= 0; i -= 1) {
    if (caminho[i].children?.some((c) => sel.has(c.id))) return livre(caminho[i + 1]) ? caminho[i + 1].id : null
  }
  const [topo] = caminho
  if (topo.type === 'frame') {
    if (caminho.length === 1) return topo.children?.length || !livre(topo) ? null : topo.id
    return livre(caminho[1]) ? caminho[1].id : null
  }
  return livre(topo) ? topo.id : null
}

/* ------------------------------------------------------------------ */
/* Edição imutável                                                    */
/* ------------------------------------------------------------------ */

/** Troca a camada `id` por `fn(camada)`. Copia só o caminho até ela. */
export function atualizar(children, id, fn) {
  let mudou = false
  const novos = children.map((c) => {
    if (c.id === id) {
      const novo = fn(c)
      if (novo !== c) mudou = true
      return novo
    }
    if (!c.children) return c
    const filhos = atualizar(c.children, id, fn)
    if (filhos === c.children) return c
    mudou = true
    return { ...c, children: filhos }
  })
  return mudou ? normalizarGrupos(novos) : children
}

export function atualizarVarias(children, ids, fn) {
  return ids.reduce((acc, id) => atualizar(acc, id, fn), children)
}

/** Só as de cima: com um frame e um filho dele na seleção, o filho já vai junto com o frame. */
export function soAsDeCima(children, ids) {
  return ids.filter((id) => !ids.some((outro) => outro !== id && estaDentro(children, id, outro)))
}

/** Tira os grupos que ficaram sem filhos (grupo não existe vazio, no Figma também não). */
function podarGruposVazios(lista) {
  let mudou = false
  const novos = []
  for (const c of lista) {
    if (!c.children) {
      novos.push(c)
      continue
    }
    const filhos = podarGruposVazios(c.children)
    if (c.type === 'group' && !filhos.length) {
      mudou = true
      continue
    }
    if (filhos !== c.children) mudou = true
    novos.push(filhos === c.children ? c : { ...c, children: filhos })
  }
  return mudou ? novos : lista
}

/**
 * Remove as camadas; grupo que fica vazio some junto, como no Figma.
 * `podar: false` deixa o grupo vazio no lugar: quem remove para reinserir
 * (agrupar, desagrupar, mover) pode estar reinserindo justamente nele.
 */
export function remover(children, ids, { podar = true } = {}) {
  const fora = new Set(ids)
  const tirar = (lista) => {
    let mudou = false
    const novos = []
    for (const c of lista) {
      if (fora.has(c.id)) {
        mudou = true
        continue
      }
      if (c.children) {
        const filhos = tirar(c.children)
        if (filhos !== c.children) {
          mudou = true
          if (podar && c.type === 'group' && !filhos.length) continue
          novos.push({ ...c, children: filhos })
          continue
        }
      }
      novos.push(c)
    }
    return mudou ? novos : lista
  }
  const novos = tirar(children)
  return novos === children ? children : normalizarGrupos(novos)
}

/** Insere em `paiId` (null = topo da página) na posição `indice` (fim, se omitido). */
export function inserir(children, paiId, camadas, indice) {
  const lista = Array.isArray(camadas) ? camadas : [camadas]
  const colocar = (filhos) => {
    const i = indice == null ? filhos.length : Math.max(0, Math.min(indice, filhos.length))
    return [...filhos.slice(0, i), ...lista, ...filhos.slice(i)]
  }
  if (paiId == null) return colocar(children)
  return atualizar(children, paiId, (pai) => ({ ...pai, children: colocar(pai.children ?? []) }))
}

/**
 * Leva as camadas para outro pai, mantendo-as onde estão na tela.
 * Ignora o pedido se o destino estiver dentro de uma delas.
 */
export function moverPara(children, idsPedidos, novoPaiId, indice) {
  const ids = soAsDeCima(children, idsPedidos)
  if (novoPaiId != null && ids.some((id) => estaDentro(children, novoPaiId, id))) return children
  const absolutas = ids.map((id) => ({ camada: acharCamada(children, id), caixa: caixaAbsoluta(children, id) }))
    .filter((a) => a.camada)
  if (!absolutas.length) return children
  // Ordem de pilha: quem estava por cima continua por cima.
  const ordem = []
  percorrer(children, (c) => ordem.push(c.id))
  absolutas.sort((a, b) => ordem.indexOf(a.camada.id) - ordem.indexOf(b.camada.id))

  // O índice pedido conta sem as camadas que saem do próprio pai.
  let resto = remover(children, ids, { podar: false })
  const origem = novoPaiId == null ? { x: 0, y: 0 } : caixaAbsoluta(resto, novoPaiId)
  if (!origem) return children
  const movidas = absolutas.map(({ camada, caixa }) => ({
    ...camada,
    x: arred(caixa.x - origem.x),
    y: arred(caixa.y - origem.y),
  }))
  resto = inserir(resto, novoPaiId, movidas, indice)
  return normalizarGrupos(podarGruposVazios(resto))
}

/**
 * Caixa do grupo = união dos filhos, sempre. Quando um filho se move, o
 * grupo acompanha e os filhos são reescritos relativos à nova origem.
 */
export function normalizarGrupos(children) {
  let mudou = false
  const novos = children.map((c) => {
    if (!c.children) return c
    const filhos = normalizarGrupos(c.children)
    let atual = filhos === c.children ? c : { ...c, children: filhos }
    if (c.type === 'group' && filhos.length) {
      const caixa = uniao(filhos.map((f) => caixaDoFilho(f)))
      if (caixa.x !== 0 || caixa.y !== 0 || caixa.w !== c.w || caixa.h !== c.h) {
        atual = {
          ...atual,
          x: arred(c.x + caixa.x),
          y: arred(c.y + caixa.y),
          w: arred(caixa.w),
          h: arred(caixa.h),
          children: filhos.map((f) => (caixa.x || caixa.y ? { ...f, x: arred(f.x - caixa.x), y: arred(f.y - caixa.y) } : f)),
        }
      }
    }
    if (atual !== c) mudou = true
    return atual
  })
  return mudou ? novos : children
}

/** Caixa de uma camada no espaço do pai. A linha ocupa da ponta ao fim, girada. */
function caixaDoFilho(c) {
  if (c.type !== 'line') return { x: c.x, y: c.y, w: c.w, h: c.h }
  const rad = ((c.rotation ?? 0) * Math.PI) / 180
  const fx = c.x + Math.cos(rad) * c.w
  const fy = c.y + Math.sin(rad) * c.w
  return { x: Math.min(c.x, fx), y: Math.min(c.y, fy), w: Math.abs(fx - c.x), h: Math.abs(fy - c.y) }
}

/** O que a camada ocupa de fato, com a rotação e a espessura da linha (área de exportação). */
export function caixaVisivel(c) {
  if (c.type === 'line') {
    const r = caixaDoFilho(c)
    const m = (c.strokeWidth ?? 1) / 2
    return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 }
  }
  const rad = ((c.rotation ?? 0) * Math.PI) / 180
  if (!rad) return { x: c.x, y: c.y, w: c.w, h: c.h }
  const w = Math.abs(c.w * Math.cos(rad)) + Math.abs(c.h * Math.sin(rad))
  const h = Math.abs(c.w * Math.sin(rad)) + Math.abs(c.h * Math.cos(rad))
  return { x: c.x + c.w / 2 - w / 2, y: c.y + c.h / 2 - h / 2, w, h }
}

/** Mesmo pai para todas? Devolve o id dele (null = topo) ou `undefined`. */
export function paiComum(children, ids) {
  const pais = new Set(ids.map((id) => paiDe(children, id)?.id ?? null))
  return pais.size === 1 ? [...pais][0] : undefined
}

function envolver(children, idsPedidos, tipo, campos) {
  const ids = soAsDeCima(children, idsPedidos)
  if (!ids.length) return { children, id: null }
  let base = children
  let paiId = paiComum(base, ids)
  // Pais diferentes: todas vão para o pai da primeira, como o Figma faz.
  if (paiId === undefined) {
    paiId = paiDe(base, ids[0])?.id ?? null
    base = moverPara(base, ids, paiId)
  }
  const irmaos = paiId == null ? base : acharCamada(base, paiId).children
  const sel = new Set(ids)
  const escolhidas = irmaos.filter((c) => sel.has(c.id))
  const caixa = uniao(escolhidas.map(caixaDoFilho))
  const topo = Math.max(...escolhidas.map((c) => irmaos.indexOf(c)))
  const novo = novaCamada(tipo, {
    name: nomeLivre(children, nomeDoTipo(tipo)),
    x: arred(caixa.x),
    y: arred(caixa.y),
    w: arred(caixa.w),
    h: arred(caixa.h),
    ...campos,
    children: escolhidas.map((c) => ({ ...c, x: arred(c.x - caixa.x), y: arred(c.y - caixa.y) })),
  })
  const indice = topo - (escolhidas.length - 1)
  // A posição vai pela tela: tirar as camadas pode mudar a origem do grupo pai.
  const antes = paiId == null ? { x: 0, y: 0 } : caixaAbsoluta(base, paiId)
  const semElas = remover(base, ids, { podar: false })
  const depois = paiId == null ? { x: 0, y: 0 } : caixaAbsoluta(semElas, paiId)
  novo.x = arred(novo.x + antes.x - depois.x)
  novo.y = arred(novo.y + antes.y - depois.y)
  return { children: normalizarGrupos(podarGruposVazios(inserir(semElas, paiId, novo, indice))), id: novo.id }
}

/** Ctrl+G. */
export const agrupar = (children, ids) => envolver(children, ids, 'group', {})

/** Ctrl+Alt+G: um frame em volta, sem fundo, para não mudar o que se vê. */
export const emoldurar = (children, ids) => envolver(children, ids, 'frame', { fills: [], clip: false })

/** Ctrl+Shift+G: os filhos sobem para o lugar do grupo (ou do frame). */
export function desagrupar(children, ids) {
  const soltos = []
  let atual = children
  for (const id of ids) {
    const camada = acharCamada(atual, id)
    if (!camada?.children) continue
    const pai = paiDe(atual, id)
    const irmaos = pai ? pai.children : atual
    const indice = irmaos.findIndex((c) => c.id === id)
    const antes = pai ? caixaAbsoluta(atual, pai.id) : { x: 0, y: 0 }
    const semEle = remover(atual, [id], { podar: false })
    const depois = pai ? caixaAbsoluta(semEle, pai.id) : { x: 0, y: 0 }
    const filhos = camada.children.map((f) => ({
      ...f,
      x: arred(f.x + camada.x + antes.x - depois.x),
      y: arred(f.y + camada.y + antes.y - depois.y),
    }))
    atual = normalizarGrupos(podarGruposVazios(inserir(semEle, pai?.id ?? null, filhos, indice)))
    soltos.push(...filhos.map((f) => f.id))
  }
  return { children: atual, ids: soltos }
}

/**
 * Ctrl+D: cópia logo acima do original. Frame do topo vai para o lado, como
 * no Figma; `noLugar` deixa a cópia em cima do original (Alt+arrastar, em
 * que é o arraste que a leva).
 */
export function duplicar(children, idsPedidos, { noLugar = false } = {}) {
  let atual = children
  const novos = []
  for (const id of soAsDeCima(children, idsPedidos)) {
    const camada = acharCamada(atual, id)
    if (!camada) continue
    const pai = paiDe(atual, id)
    const irmaos = pai ? pai.children : atual
    const copia = clonar(camada)
    if (!noLugar && !pai && camada.type === 'frame') copia.x = arred(camada.x + camada.w + 40)
    atual = inserir(atual, pai?.id ?? null, copia, irmaos.findIndex((c) => c.id === id) + 1)
    novos.push(copia.id)
  }
  return { children: atual, ids: novos }
}

/** Ctrl+] / Ctrl+[ (com Shift: até o topo/fundo). A lista vai de baixo para cima. */
export function reordenar(children, ids, direcao) {
  const sel = new Set(ids)
  const mexer = (lista) => {
    if (!lista.some((c) => sel.has(c.id))) return lista
    const dentro = lista.filter((c) => sel.has(c.id))
    const fora = lista.filter((c) => !sel.has(c.id))
    if (direcao === 'topo') return [...fora, ...dentro]
    if (direcao === 'fundo') return [...dentro, ...fora]
    const novo = [...lista]
    const passo = direcao === 'frente' ? 1 : -1
    const ordem = [...novo.keys()].filter((i) => sel.has(novo[i].id))
    if (passo === 1) ordem.reverse()
    for (const i of ordem) {
      const j = i + passo
      if (j < 0 || j >= novo.length || sel.has(novo[j].id)) continue
      ;[novo[i], novo[j]] = [novo[j], novo[i]]
    }
    return novo
  }
  const andar = (lista) => {
    const movida = mexer(lista)
    const aqui = movida.every((c, i) => c === lista[i]) ? lista : movida
    let mudou = aqui !== lista
    const novos = aqui.map((c) => {
      if (!c.children) return c
      const filhos = andar(c.children)
      if (filhos === c.children) return c
      mudou = true
      return { ...c, children: filhos }
    })
    return mudou ? novos : lista
  }
  return andar(children)
}

/* ------------------------------------------------------------------ */
/* Geometria                                                          */
/* ------------------------------------------------------------------ */

/**
 * Redimensiona pela alça (`n s e w ne nw se sw`), com a camada girada.
 * `dx`,`dy` vêm no espaço do pai. Shift = proporcional, Alt = do centro.
 */
export function redimensionar(caixa, alca, dx, dy, { proporcional = false, doCentro = false } = {}) {
  const rad = ((caixa.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const lx = dx * cos + dy * sin
  const ly = -dx * sin + dy * cos

  let esq = -caixa.w / 2
  let dir = caixa.w / 2
  let cima = -caixa.h / 2
  let baixo = caixa.h / 2
  if (alca.includes('w')) esq += lx
  if (alca.includes('e')) dir += lx
  if (alca.includes('n')) cima += ly
  if (alca.includes('s')) baixo += ly
  if (doCentro) {
    if (alca.includes('w')) dir -= lx
    if (alca.includes('e')) esq -= lx
    if (alca.includes('n')) baixo -= ly
    if (alca.includes('s')) cima -= ly
  }

  if (proporcional && caixa.w > 0 && caixa.h > 0) {
    const razao = caixa.w / caixa.h
    const horizontal = alca.includes('e') || alca.includes('w')
    const vertical = alca.includes('n') || alca.includes('s')
    let w = dir - esq
    let h = baixo - cima
    if (horizontal && vertical) {
      if (Math.abs(w / caixa.w) > Math.abs(h / caixa.h)) h = w / razao
      else w = h * razao
    } else if (horizontal) h = w / razao
    else w = h * razao
    // Ancora o lado oposto à alça; sem alça no eixo, ancora o centro.
    if (doCentro || !horizontal) [esq, dir] = [-w / 2, w / 2]
    else if (alca.includes('w')) esq = dir - w
    else dir = esq + w
    if (doCentro || !vertical) [cima, baixo] = [-h / 2, h / 2]
    else if (alca.includes('n')) cima = baixo - h
    else baixo = cima + h
  }

  // Tamanho mínimo de 1 px, preso no lado ancorado.
  if (dir - esq < 1) {
    if (alca.includes('w')) esq = dir - 1
    else dir = esq + 1
  }
  if (baixo - cima < 1) {
    if (alca.includes('n')) cima = baixo - 1
    else baixo = cima + 1
  }

  const w = dir - esq
  const h = baixo - cima
  const cx = (esq + dir) / 2
  const cy = (cima + baixo) / 2
  const centroX = caixa.x + caixa.w / 2 + cx * cos - cy * sin
  const centroY = caixa.y + caixa.h / 2 + cx * sin + cy * cos
  const fino = rad ? arred : Math.round
  return { x: fino(centroX - w / 2), y: fino(centroY - h / 2), w: fino(w), h: fino(h) }
}

/** O filho depois do pai mudar de `antes` para `depois` de tamanho. */
export function aplicarRestricoes(filho, antes, depois) {
  const { h = 'left', v = 'top' } = filho.constraints ?? {}
  const dw = depois.w - antes.w
  const dh = depois.h - antes.h
  let { x, y, w, h: alt } = filho
  if (h === 'right') x += dw
  else if (h === 'leftright') w = Math.max(1, w + dw)
  else if (h === 'center') x += dw / 2
  else if (h === 'scale' && antes.w) {
    x *= depois.w / antes.w
    w *= depois.w / antes.w
  }
  if (v === 'bottom') y += dh
  else if (v === 'topbottom') alt = Math.max(1, alt + dh)
  else if (v === 'center') y += dh / 2
  else if (v === 'scale' && antes.h) {
    y *= depois.h / antes.h
    alt *= depois.h / antes.h
  }
  if (x === filho.x && y === filho.y && w === filho.w && alt === filho.h) return filho
  return { ...redimensionarFilhos({ ...filho, w: arred(w), h: arred(alt) }, filho), x: arred(x), y: arred(y) }
}

/**
 * A camada `novo` (já com o tamanho novo) com os filhos ajustados: frame
 * aplica as restrições de cada filho; grupo escala tudo junto. Frame com
 * auto layout não mexe: lá quem posiciona é o próprio layout.
 */
export function redimensionarFilhos(novo, antigo) {
  if (!novo.children?.length || (novo.w === antigo.w && novo.h === antigo.h)) return novo
  if (novo.type === 'frame') {
    if (temLayout(novo)) return novo
    return { ...novo, children: novo.children.map((f) => aplicarRestricoes(f, antigo, novo)) }
  }
  const sx = antigo.w ? novo.w / antigo.w : 1
  const sy = antigo.h ? novo.h / antigo.h : 1
  return {
    ...novo,
    children: novo.children.map((f) =>
      redimensionarFilhos({ ...f, x: arred(f.x * sx), y: arred(f.y * sy), w: arred(f.w * sx), h: arred(f.h * sy) }, f),
    ),
  }
}

/**
 * Deslocamentos para alinhar (`esquerda centroH direita topo centroV base`).
 * Com uma camada só, a referência é o pai (`ref`); com várias, a caixa delas.
 */
export function deslocamentosDeAlinhamento(rects, modo, ref) {
  const caixa = rects.length > 1 || !ref ? uniao(rects) : ref
  return rects.map((r) => {
    const alvo = {
      esquerda: { dx: caixa.x - r.x },
      centroH: { dx: caixa.x + caixa.w / 2 - (r.x + r.w / 2) },
      direita: { dx: caixa.x + caixa.w - (r.x + r.w) },
      topo: { dy: caixa.y - r.y },
      centroV: { dy: caixa.y + caixa.h / 2 - (r.y + r.h / 2) },
      base: { dy: caixa.y + caixa.h - (r.y + r.h) },
    }[modo]
    return { id: r.id, dx: arred(alvo.dx ?? 0), dy: arred(alvo.dy ?? 0) }
  })
}

/** Espaço igual entre as camadas, mantendo a primeira e a última no lugar. */
export function deslocamentosDeDistribuicao(rects, eixo) {
  if (rects.length < 3) return rects.map((r) => ({ id: r.id, dx: 0, dy: 0 }))
  const [p, t] = eixo === 'x' ? ['x', 'w'] : ['y', 'h']
  const ordem = [...rects].sort((a, b) => a[p] - b[p])
  const inicio = ordem[0][p]
  const fim = Math.max(...ordem.map((r) => r[p] + r[t]))
  const vao = (fim - inicio - ordem.reduce((s, r) => s + r[t], 0)) / (ordem.length - 1)
  let cursor = inicio
  const novos = new Map()
  for (const r of ordem) {
    novos.set(r.id, cursor - r[p])
    cursor += r[t] + vao
  }
  return rects.map((r) => ({ id: r.id, dx: eixo === 'x' ? arred(novos.get(r.id)) : 0, dy: eixo === 'y' ? arred(novos.get(r.id)) : 0 }))
}

/**
 * Encaixe ao mover: bordas e centros grudam nos irmãos e nas bordas e no
 * centro do pai. A mesma régua do Início (`lib/inicio.js`), com o pai
 * entrando como mais um vizinho para dar as guias de cima, meio e baixo.
 */
export function encaixar(ret, irmaos, pai, { zoom = 1, modo = 'mover' } = {}) {
  const outros = pai ? [...irmaos, { x: 0, y: 0, w: pai.w, h: pai.h }] : irmaos
  return alinharNaGrade(ret, outros, pai?.w ?? 0, { modo, limiar: 6 / zoom })
}

/**
 * Shift+A: o auto layout que reproduz a arrumação atual dos filhos, como o
 * Figma faz. Direção pelo eixo em que eles se espalham mais, espaço pela
 * média dos vãos, margem interna pela distância até a borda do frame.
 * Devolve também a ordem dos filhos no fluxo (pela posição, não pela pilha).
 */
export function inferirLayout(filhos, caixa) {
  if (!filhos.length) return { layout: { mode: 'column', gap: 10, padding: [10, 10, 10, 10], align: 'start', justify: 'start' }, ordem: [] }
  const espalhamento = (p, t) => Math.max(...filhos.map((f) => f[p] + f[t])) - Math.min(...filhos.map((f) => f[p]))
  const mode = espalhamento('x', 'w') - Math.max(...filhos.map((f) => f.w)) > espalhamento('y', 'h') - Math.max(...filhos.map((f) => f.h)) ? 'row' : 'column'
  const [p, t] = mode === 'row' ? ['x', 'w'] : ['y', 'h']
  const ordem = [...filhos].sort((a, b) => a[p] - b[p])
  const vaos = ordem.slice(1).map((f, i) => f[p] - (ordem[i][p] + ordem[i][t]))
  const gap = vaos.length ? Math.max(0, Math.round(vaos.reduce((s, v) => s + v, 0) / vaos.length)) : 10
  const u = uniao(filhos)
  const padding = caixa
    ? [u.y, caixa.w - (u.x + u.w), caixa.h - (u.y + u.h), u.x].map((n) => Math.max(0, Math.round(n)))
    : [0, 0, 0, 0]
  return { layout: { mode, gap, padding, align: 'start', justify: 'start' }, ordem: ordem.map((f) => f.id) }
}

/* ------------------------------------------------------------------ */
/* CSS                                                                */
/* ------------------------------------------------------------------ */

export function corCss(cor = '#000000', opacidade = 1) {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(cor)
  if (!hex) return cor
  if (opacidade >= 1) return `#${hex[1].toUpperCase()}`
  let h = hex[1]
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${arred(opacidade)})`
}

const AJUSTE_DA_IMAGEM = { fill: 'cover', fit: 'contain', stretch: '100% 100%' }

function camadaDeFundo(paint) {
  if (paint.type === 'linear') {
    const paradas = (paint.stops ?? []).map((s) => `${corCss(s.color, s.opacity ?? 1)} ${arred((s.at ?? 0) * 100)}%`)
    return `linear-gradient(${paint.angle ?? 180}deg, ${paradas.join(', ')})`
  }
  if (paint.type === 'image') {
    if (!paint.src) return null
    const url = `url("${String(paint.src).replace(/"/g, '%22')}")`
    return paint.fit === 'tile' ? `${url} 0 0 / auto repeat` : `${url} center / ${AJUSTE_DA_IMAGEM[paint.fit] ?? 'cover'} no-repeat`
  }
  const cor = corCss(paint.color, paint.opacity ?? 1)
  return `linear-gradient(${cor}, ${cor})`
}

const visiveis = (lista) => (lista ?? []).filter((p) => p && p.visible !== false)

/** `background` dos preenchimentos. O primeiro da lista fica por baixo. */
export function fundoCss(fills) {
  const camadas = visiveis(fills).map(camadaDeFundo).filter(Boolean).reverse()
  if (!camadas.length) return undefined
  // Um sólido só vira cor simples: é o que se espera ler na aba Código.
  const [unico] = visiveis(fills)
  if (camadas.length === 1 && unico.type === 'solid') return corCss(unico.color, unico.opacity ?? 1)
  return camadas.join(', ')
}

const px = (n) => `${arred(n)}px`

function sombras(camada) {
  const lista = []
  const largura = camada.strokeWidth ?? 1
  if (camada.type !== 'text' && camada.type !== 'line') {
    for (const s of visiveis(camada.strokes)) {
      const cor = corCss(s.color, s.opacity ?? 1)
      const alinhamento = camada.strokeAlign ?? 'inside'
      if (alinhamento === 'inside') lista.push(`inset 0 0 0 ${px(largura)} ${cor}`)
      else if (alinhamento === 'outside') lista.push(`0 0 0 ${px(largura)} ${cor}`)
      else lista.push(`inset 0 0 0 ${px(largura / 2)} ${cor}`, `0 0 0 ${px(largura / 2)} ${cor}`)
    }
  }
  for (const e of visiveis(camada.effects)) {
    if (e.type !== 'drop' && e.type !== 'inner') continue
    const cor = corCss(e.color ?? '#000000', e.opacity ?? 0.25)
    const base = `${px(e.x ?? 0)} ${px(e.y ?? 4)} ${px(e.blur ?? 4)}`
    if (camada.type === 'text') lista.push(`${base} ${cor}`)
    else lista.push(`${e.type === 'inner' ? 'inset ' : ''}${base} ${px(e.spread ?? 0)} ${cor}`)
  }
  return lista.length ? lista.join(', ') : undefined
}

const ALINHAR = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', between: 'space-between' }

/** Pilha de fontes: o nome escolhido e, se ele faltar na máquina, a do sistema. */
export function pilhaDaFonte(familia) {
  const nome = (familia || 'system-ui').trim()
  const cotado = /^[\w-]+$/.test(nome) ? nome : `"${nome.replace(/"/g, '')}"`
  return nome === 'system-ui' ? 'system-ui, sans-serif' : `${cotado}, system-ui, sans-serif`
}

function tamanhoNoEixo(camada, pai, eixo) {
  const lado = eixo === 'h' ? 'w' : 'h'
  const sizing = camada.sizing?.[eixo] ?? 'fixed'
  const dentro = noFluxo(camada, pai)
  const principal = dentro && ((pai.layout.mode === 'row') === (eixo === 'h'))
  if (dentro && sizing === 'fill') return principal ? { flex: '1 1 0', [eixo === 'h' ? 'minWidth' : 'minHeight']: 0 } : { alignSelf: 'stretch' }
  const hug =
    (sizing === 'hug' && (temLayout(camada) || camada.type === 'text')) ||
    (camada.type === 'text' && (camada.autoSize === 'width' || (eixo === 'v' && camada.autoSize === 'height')))
  if (hug) return { [eixo === 'h' ? 'width' : 'height']: camada.type === 'text' && eixo === 'h' ? 'max-content' : 'fit-content' }
  return { [eixo === 'h' ? 'width' : 'height']: px(camada[lado]), ...(dentro ? { flexShrink: 0 } : {}) }
}

/**
 * O estilo (React) da camada. `pai` é a camada que a contém, ou `null` no
 * topo da página. Sem `left/top` quando ela está no fluxo de um auto layout.
 */
export function estiloDaCamada(camada, pai) {
  const dentro = noFluxo(camada, pai)
  const estilo = {
    position: dentro ? 'relative' : 'absolute',
    boxSizing: 'border-box',
    ...(dentro ? {} : { left: px(camada.x), top: px(camada.y) }),
  }

  if (camada.type === 'line') {
    const largura = camada.strokeWidth ?? 1
    const [traco] = visiveis(camada.strokes)
    Object.assign(estilo, {
      width: px(camada.w),
      height: px(largura),
      ...(dentro ? {} : { marginTop: px(-largura / 2) }),
      background: traco ? corCss(traco.color, traco.opacity ?? 1) : undefined,
      transformOrigin: '0 50%',
    })
  } else {
    Object.assign(estilo, tamanhoNoEixo(camada, pai, 'h'), tamanhoNoEixo(camada, pai, 'v'))
  }

  if (camada.rotation) estilo.transform = `rotate(${arred(camada.rotation)}deg)`
  if (camada.opacity != null && camada.opacity < 1) estilo.opacity = arred(camada.opacity)

  if (camada.type === 'text') {
    const f = camada.font ?? {}
    const [tinta] = visiveis(camada.fills)
    Object.assign(estilo, {
      color: tinta?.type === 'solid' ? corCss(tinta.color, tinta.opacity ?? 1) : '#000000',
      fontFamily: pilhaDaFonte(f.family),
      fontSize: px(f.size ?? 16),
      fontWeight: f.weight ?? 400,
      ...(f.italic ? { fontStyle: 'italic' } : {}),
      lineHeight: f.lineHeight ? arred(f.lineHeight) : 'normal',
      ...(f.letterSpacing ? { letterSpacing: px(f.letterSpacing) } : {}),
      textAlign: f.align ?? 'left',
      ...(f.decoration && f.decoration !== 'none' ? { textDecoration: f.decoration } : {}),
      ...(f.case && f.case !== 'none' ? { textTransform: f.case } : {}),
      whiteSpace: camada.autoSize === 'width' && !(dentro && camada.sizing?.h === 'fill') ? 'pre' : 'pre-wrap',
      overflowWrap: 'break-word',
    })
    if (f.valign && f.valign !== 'top' && camada.autoSize === 'fixed') {
      Object.assign(estilo, { display: 'flex', flexDirection: 'column', justifyContent: f.valign === 'middle' ? 'center' : 'flex-end' })
    }
    const [traco] = visiveis(camada.strokes)
    if (traco) estilo.WebkitTextStroke = `${px(camada.strokeWidth ?? 1)} ${corCss(traco.color, traco.opacity ?? 1)}`
  } else if (camada.type !== 'line') {
    const fundo = fundoCss(camada.fills)
    if (fundo) estilo.background = fundo
  }

  if (camada.type === 'ellipse') estilo.borderRadius = '50%'
  else if (camada.radius && camada.type !== 'text' && camada.type !== 'line') {
    estilo.borderRadius = Array.isArray(camada.radius) ? camada.radius.map(px).join(' ') : px(camada.radius)
  }

  const sombra = sombras(camada)
  if (sombra) estilo[camada.type === 'text' ? 'textShadow' : 'boxShadow'] = sombra
  const desfoque = visiveis(camada.effects).find((e) => e.type === 'blur')
  if (desfoque) estilo.filter = `blur(${px(desfoque.blur ?? 4)})`
  const vidro = visiveis(camada.effects).find((e) => e.type === 'bgblur')
  if (vidro) estilo.backdropFilter = `blur(${px(vidro.blur ?? 4)})`

  if (camada.type === 'frame' && camada.clip) estilo.overflow = 'hidden'
  if (temLayout(camada)) {
    const l = camada.layout
    const [pt = 0, pr = 0, pb = 0, pl = 0] = l.padding ?? []
    Object.assign(estilo, {
      display: 'flex',
      flexDirection: l.mode === 'column' ? 'column' : 'row',
      ...(l.wrap ? { flexWrap: 'wrap' } : {}),
      ...(l.gap ? { gap: px(l.gap) } : {}),
      ...(pt || pr || pb || pl ? { padding: [pt, pr, pb, pl].map(px).join(' ') } : {}),
      alignItems: ALINHAR[l.align ?? 'start'],
      justifyContent: ALINHAR[l.justify ?? 'start'],
    })
  }
  return estilo
}

const kebab = (chave) => chave.replace(/^Webkit/, '-webkit-').replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

/** O CSS da camada como texto, para a aba Código. */
export function cssDaCamada(camada, pai) {
  const estilo = estiloDaCamada(camada, pai)
  if (estilo.position === 'absolute' && !pai) {
    // No topo da página a posição é a do quadro, não a de uma tela.
    delete estilo.left
    delete estilo.top
    estilo.position = 'relative'
  }
  delete estilo.boxSizing
  return Object.entries(estilo)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${kebab(k)}: ${v};`)
    .join('\n')
}

/** Camadas que o CSS dimensiona sozinho: o tamanho real só existe depois do layout. */
export function medidaVemDoLayout(camada, pai) {
  if (camada.visible === false || camada.type === 'line') return null
  const dentro = noFluxo(camada, pai)
  const textoSolto = camada.type === 'text' && camada.autoSize !== 'fixed'
  const abraca = temLayout(camada) && (camada.sizing?.h === 'hug' || camada.sizing?.v === 'hug')
  if (!dentro && !textoSolto && !abraca) return null
  return { posicao: dentro }
}

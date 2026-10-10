/**
 * Como a pessoa montou o Início: capa e blocos (quais, onde e de que
 * tamanho — cada um posto livremente na página).
 *
 * Fica nas preferências do servidor (`home_layout`), conferido por
 * `backend/users/inicio.py`. Aqui mora a parte que a tela precisa e que dá
 * para testar sem navegador: o padrão, a mescla do que foi salvo com os
 * blocos que existem hoje, a arrumação de partida, o encaixe ao alinhar e
 * as capas.
 */

import { t } from './i18n.js'

/**
 * Os blocos do Início, na ordem padrão, com o tamanho de partida: largura
 * em colunas (de 12) e altura em px.
 */
export const BLOCOS = [
  { id: 'resumo', get nome() { return t('Resumo') }, get dica() { return t('Quantos itens, pastas e tarefas abertas') }, colunas: 12, altura: 150 },
  { id: 'notas', get nome() { return t('Itens recentes e favoritos') }, get dica() { return t('O que você mexeu por último, ou o que tem estrela') }, colunas: 12, altura: 420 },
  { id: 'tarefas', get nome() { return t('Minhas tarefas') }, get dica() { return t('Tarefas abertas, para marcar ou criar sem sair daqui') }, colunas: 6, altura: 360 },
  { id: 'agenda', get nome() { return t('Agenda') }, get dica() { return t('O dia, com o que está marcado nele') }, colunas: 6, altura: 360 },
  { id: 'rascunho', get nome() { return t('Bloco de rascunho') }, get dica() { return t('Um papel para anotar rápido e virar nota depois') }, colunas: 6, altura: 300 },
  { id: 'arquivos', get nome() { return t('Arquivos recentes') }, get dica() { return t('Imagens e documentos enviados por último') }, colunas: 6, altura: 300 },
  { id: 'categorias', get nome() { return t('Categorias') }, get dica() { return t('O primeiro nível das suas pastas') }, colunas: 12, altura: 240 },
  { id: 'relogio', get nome() { return t('Relógio e música') }, get dica() { return t('Uma foto sua com a hora e, no app do computador, a música que está tocando') }, colunas: 6, altura: 260 },
]

/**
 * Posição livre do bloco: `x` e `w` em % da largura da página (o Início
 * acompanha a janela mais larga ou mais estreita), `y` e `h` em px.
 */
export const LARGURA_MIN = 15
export const ALTURA_MIN = 80
export const ALTURA_MAX = 2000
export const TOPO_MAX = 20000
/** Espaço entre blocos: o da arrumação de partida e o do encaixe ao alinhar. */
export const VAO = 16

const prender = (n, min, max) => Math.min(max, Math.max(min, n))
const arredondar = (n) => Math.round(n * 100) / 100
const numero = (n) => typeof n === 'number' && Number.isFinite(n)

/**
 * Capas: materiais de quem estuda, e não degradês de cartaz. Papel pautado,
 * quadriculado, lousa, kraft e o tecido de encadernação de caderno — tudo em
 * CSS (linhas e tramas finas), sem imagem nem requisição.
 *
 * `texto` é a cor da saudação por cima: escura no papel, clara no resto.
 */
const trama = (cor) =>
  `repeating-linear-gradient(0deg, rgb(255 255 255 / 0.04) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 3px), ${cor}`

export const CAPAS = [
  { id: 'acento', get nome() { return t('Cor do app') }, texto: 'claro', fundo: trama('rgb(var(--accent-700))') },
  {
    id: 'caderno',
    get nome() { return t('Caderno') },
    texto: 'escuro',
    fundo:
      'linear-gradient(90deg, transparent 56px, rgb(205 92 86 / 0.5) 56px 57px, transparent 57px), repeating-linear-gradient(180deg, transparent 0 27px, rgb(110 150 196 / 0.4) 27px 28px), #f5f6f3',
  },
  {
    id: 'quadriculado',
    get nome() { return t('Quadriculado') },
    texto: 'escuro',
    fundo:
      'repeating-linear-gradient(0deg, rgb(100 140 180 / 0.25) 0 1px, transparent 1px 20px), repeating-linear-gradient(90deg, rgb(100 140 180 / 0.25) 0 1px, transparent 1px 20px), #f3f5f6',
  },
  {
    id: 'lousa',
    get nome() { return t('Lousa') },
    texto: 'claro',
    fundo:
      'radial-gradient(ellipse at 25% 35%, rgb(255 255 255 / 0.08), transparent 55%), radial-gradient(ellipse at 80% 75%, rgb(255 255 255 / 0.05), transparent 50%), #27362e',
  },
  {
    id: 'kraft',
    get nome() { return t('Kraft') },
    texto: 'escuro',
    fundo:
      'repeating-linear-gradient(75deg, rgb(0 0 0 / 0.04) 0 2px, transparent 2px 7px), repeating-linear-gradient(-15deg, rgb(255 255 255 / 0.06) 0 1px, transparent 1px 5px), #b9925f',
  },
  { id: 'tecido-azul', get nome() { return t('Encadernação azul') }, texto: 'claro', fundo: trama('#22374f') },
  { id: 'tecido-vinho', get nome() { return t('Encadernação vinho') }, texto: 'claro', fundo: trama('#5a2329') },
  { id: 'grafite', get nome() { return t('Grafite') }, texto: 'claro', fundo: 'linear-gradient(160deg, rgb(255 255 255 / 0.07), transparent 55%), #34373a' },
]

export const CAPA_PADRAO = { tipo: 'gradiente', id: 'acento' }

/**
 * O layout que a tela usa: o salvo, completado com o que falta.
 *
 * Bloco salvo que não existe mais cai fora; bloco novo (que não existia
 * quando a pessoa montou o Início) entra visível — senão ninguém
 * descobriria que ele existe. Quem ainda não tem posição (o Início de
 * antes, em colunas) recebe uma em `posicionar`, que conhece a largura.
 */
export function layoutDoInicio(salvo) {
  const base = salvo && typeof salvo === 'object' ? salvo : {}
  const conhecidos = new Map(BLOCOS.map((b) => [b.id, b]))
  const vistos = new Set()
  const blocos = []
  const adicionar = (b, padrao) => {
    // `colunas`, `largura` e `altura` são do Início em grade: valem para a
    // arrumação de partida de quem salvou antes da posição livre.
    const colunas = numero(b.colunas) ? b.colunas : b.largura === 'metade' ? 6 : b.largura === 'inteira' ? 12 : padrao.colunas
    const livre = numero(b.x) && numero(b.y) && numero(b.w) && numero(b.h)
    blocos.push({
      id: b.id,
      visivel: b.visivel !== false,
      colunas: Math.round(prender(colunas, 3, 12)),
      altura: numero(b.altura) ? Math.round(prender(b.altura, ALTURA_MIN, ALTURA_MAX)) : padrao.altura,
      ...(livre
        ? {
            x: prender(b.x, 0, 100 - LARGURA_MIN),
            y: prender(b.y, 0, TOPO_MAX),
            w: prender(b.w, LARGURA_MIN, 100),
            h: prender(b.h, ALTURA_MIN, ALTURA_MAX),
          }
        : {}),
    })
  }
  for (const b of Array.isArray(base.blocos) ? base.blocos : []) {
    if (!b || !conhecidos.has(b.id) || vistos.has(b.id)) continue
    vistos.add(b.id)
    adicionar(b, conhecidos.get(b.id))
  }
  for (const b of BLOCOS) if (!vistos.has(b.id)) adicionar({ id: b.id }, b)
  return {
    capa: base.capa?.tipo ? base.capa : CAPA_PADRAO,
    // Papel de parede atrás dos blocos e a foto do bloco do relógio: sem
    // nada até a pessoa escolher.
    fundo: base.fundo?.tipo ? base.fundo : { tipo: 'nenhuma' },
    foto: base.foto?.tipo === 'imagem' ? base.foto : { tipo: 'nenhuma' },
    blocos,
    aba_notas: base.aba_notas === 'favoritos' ? 'favoritos' : 'recentes',
    aba_arquivos: ['imagens', 'documentos', 'todos'].includes(base.aba_arquivos) ? base.aba_arquivos : 'imagens',
  }
}

/**
 * Dá posição a quem não tem, numa página de `largura` px.
 *
 * Ninguém posicionado (o Início de antes): arruma como a grade arrumava —
 * na ordem, cada bloco na vaga mais alta que cabe a largura dele, sem
 * buraco. Alguns posicionados: os que faltam (um bloco que voltou a
 * aparecer) entram embaixo de tudo, onde se vê que chegaram.
 */
export function posicionar(blocos, largura) {
  const W = Math.max(1, largura)
  const visiveis = blocos.filter((b) => b.visivel)
  const posicionados = visiveis.filter((b) => numero(b.x))
  const pct = (px) => arredondar((px / W) * 100)
  const coluna = (W - VAO * 11) / 12
  const larguraDe = (c) => pct(c * coluna + (c - 1) * VAO)
  const novas = new Map()

  if (!posicionados.length) {
    const fundo = Array(12).fill(0)
    const topoEm = (s, c) => Math.max(...fundo.slice(s, s + c))
    for (const b of visiveis) {
      const c = b.colunas
      let melhor = 0
      for (let s = 1; s <= 12 - c; s += 1) if (topoEm(s, c) < topoEm(melhor, c)) melhor = s
      const topo = topoEm(melhor, c)
      novas.set(b.id, { x: pct(melhor * (coluna + VAO)), y: topo, w: larguraDe(c), h: b.altura })
      for (let k = melhor; k < melhor + c; k += 1) fundo[k] = topo + b.altura + VAO
    }
  } else {
    let fundo = Math.max(...posicionados.map((b) => b.y + b.h)) + VAO
    for (const b of visiveis) {
      if (numero(b.x)) continue
      novas.set(b.id, { x: 0, y: fundo, w: larguraDe(b.colunas), h: b.altura })
      fundo += b.altura + VAO
    }
  }
  return blocos.map((b) => (novas.has(b.id) ? { ...b, ...novas.get(b.id) } : b))
}

/**
 * Encaixe ao arrastar ou redimensionar, como nos editores de slide.
 *
 * `ret` é o bloco em px (`{ x, y, w, h }`), `outros` os demais e `largura`
 * a da página. Bordas e centros perto (até `limiar` px) das bordas e dos
 * centros dos outros — ou da página — grudam neles; e a borda que fica a
 * um `VAO` da vizinha também, o que deixa o espaço entre os blocos igual.
 * `modo: 'tamanho'` encaixa só a borda direita e a de baixo (o canto que
 * está sendo puxado). Devolve o retângulo encaixado e as guias para
 * desenhar: `{ eixo: 'x' | 'y', pos, de, ate, vao }`.
 */
export function alinhar(ret, outros, largura, { modo = 'mover', limiar = 6 } = {}) {
  const r = { ...ret }
  const guias = []

  const encaixarEixo = (eixo) => {
    const [p, t, comeco, fim] = eixo === 'x' ? ['x', 'w', 'y', 'h'] : ['y', 'h', 'x', 'w']
    // Pontos do bloco que podem grudar: começo, meio e fim (no tamanho, só o fim).
    const meus = modo === 'tamanho' ? [['fim', r[t]]] : [['inicio', 0], ['meio', r[t] / 2], ['fim', r[t]]]
    const alvos = []
    for (const o of outros) {
      alvos.push({ pos: o[p], o }, { pos: o[p] + o[t] / 2, o }, { pos: o[p] + o[t], o })
      alvos.push({ pos: o[p] + o[t] + VAO, o, so: 'inicio', vao: true }, { pos: o[p] - VAO, o, so: 'fim', vao: true })
    }
    alvos.push({ pos: 0 })
    if (eixo === 'x') alvos.push({ pos: largura / 2 }, { pos: largura })

    let melhor = null
    for (const [nome, desloc] of meus) {
      for (const a of alvos) {
        if (a.so && a.so !== nome) continue
        const d = a.pos - (r[p] + desloc)
        if (Math.abs(d) <= limiar && (melhor === null || Math.abs(d) < Math.abs(melhor))) melhor = d
      }
    }
    if (melhor === null) return
    if (modo === 'tamanho') r[t] += melhor
    else r[p] += melhor

    // As guias: todo par que ficou alinhado com esse ajuste.
    const meusDepois = modo === 'tamanho' ? [['fim', r[t]]] : [['inicio', 0], ['meio', r[t] / 2], ['fim', r[t]]]
    for (const [nome, desloc] of meusDepois) {
      for (const a of alvos) {
        if ((a.so && a.so !== nome) || Math.abs(a.pos - (r[p] + desloc)) > 0.5) continue
        guias.push({
          eixo,
          pos: r[p] + desloc,
          de: a.o ? Math.min(r[comeco], a.o[comeco]) : r[comeco],
          ate: a.o ? Math.max(r[comeco] + r[fim], a.o[comeco] + a.o[fim]) : r[comeco] + r[fim],
          vao: !!a.vao,
        })
      }
    }
  }

  encaixarEixo('x')
  encaixarEixo('y')
  // Guias na mesma linha viram uma só, do começo do primeiro ao fim do último.
  const unidas = new Map()
  for (const g of guias) {
    const chave = `${g.eixo}|${Math.round(g.pos)}|${g.vao}`
    const ja = unidas.get(chave)
    unidas.set(chave, ja ? { ...ja, de: Math.min(ja.de, g.de), ate: Math.max(ja.ate, g.ate) } : g)
  }
  return { ret: r, guias: [...unidas.values()] }
}

/**
 * Os blocos no formato que vai para o servidor. `largura` e `colunas` vão
 * junto, tiradas da posição: uma versão mais antiga do app (o desktop de
 * alguém que ainda não atualizou) entende só elas.
 */
export function blocosParaSalvar(blocos) {
  return blocos.map((b) => {
    const colunas = numero(b.w) ? Math.round(prender((b.w / 100) * 12, 3, 12)) : b.colunas
    return {
      id: b.id,
      visivel: b.visivel,
      largura: colunas >= 12 ? 'inteira' : 'metade',
      colunas,
      ...(numero(b.x) ? { x: arredondar(b.x), y: Math.round(b.y), w: arredondar(b.w), h: Math.round(b.h) } : {}),
    }
  })
}

/** Título da nota que nasce do rascunho: a primeira linha com texto, curta. */
export function tituloDoRascunho(texto) {
  const linha = String(texto ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return linha.length > 80 ? `${linha.slice(0, 77)}...` : linha
}

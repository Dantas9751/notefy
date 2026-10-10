import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ClipboardPaste,
  Code2,
  Columns3,
  Copy,
  CopyPlus,
  Download,
  Eye,
  EyeOff,
  Frame,
  Group,
  Lock,
  Maximize,
  Scissors,
  SquareDashed,
  Trash2,
  Ungroup,
  Unlock,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { baixar, copiarTexto } from '@/lib/desktop'
import { atalhoDe } from '@/lib/history'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import {
  acharCamada,
  agrupar,
  alvoDoClique,
  atualizar,
  caixaAbsoluta,
  caminhoAte,
  clonar,
  contem,
  cssDaCamada,
  desagrupar,
  designVazio,
  deslocamentosDeAlinhamento,
  deslocamentosDeDistribuicao,
  duplicar,
  emoldurar,
  encaixar,
  estaDentro,
  inferirLayout,
  inserir,
  intersecta,
  moverPara,
  nomeDoTipo,
  nomeLivre,
  noFluxo,
  novaCamada,
  novaPagina,
  paiComum,
  paiDe,
  redimensionar,
  redimensionarFilhos,
  remover,
  reordenar,
  soAsDeCima,
  temLayout,
  uniao,
} from '@/lib/design'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'
import { BASE_DO_PALCO, CamadasDaPagina } from './DesignNode'
import BarraDeFerramentas from './BarraDeFerramentas'
import PainelDeCamadas, { nomeDaCamada } from './PainelDeCamadas'
import PainelDePropriedades from './PainelDePropriedades'
import Sobreposicao from './Sobreposicao'

/**
 * Editor de telas, no jeito do Figma (docs/plans/2026-10-10-design.md).
 *
 * Camadas em HTML (`DesignNode`), seleção e alças por cima em pixels de
 * tela (`Sobreposicao`), regra em `lib/design.js`. O desfazer e o salvar
 * são os do `DocumentEditor`: `onChange` a cada quadro do gesto, `onCommit`
 * quando ele termina — um arraste inteiro é um passo de desfazer.
 *
 * Mover NÃO reescreve o modelo a cada quadro: as camadas arrastadas ganham
 * um `translate` direto no DOM e o modelo muda uma vez, ao soltar. É o que
 * permite decidir no fim se a camada entrou noutro frame ou mudou de lugar
 * num auto layout, e poupa a árvore de ser redesenhada a cada pixel.
 */

const MIME = 'application/x-notefy-design'
const ZOOM_MIN = 0.02
const ZOOM_MAX = 64
const LIMIAR = 3
/** Altura da barra de ferramentas flutuante, com a folga embaixo dela. */
const BARRA = 64
/**
 * Abaixo desta largura DO EDITOR (e não da janela: ele pode estar num painel
 * ao lado, ou com o menu lateral aberto) os dois painéis viram gavetas.
 * Camadas (240) + propriedades (256) + um quadro que ainda dê para desenhar.
 */
const LARGURA_PARA_PAINEIS = 880
const ATALHOS_DE_FERRAMENTA = { v: 'move', h: 'hand', f: 'frame', a: 'frame', r: 'rect', o: 'ellipse', l: 'line', t: 'text' }
const ALINHAR_POR_TECLA = { KeyA: 'esquerda', KeyD: 'direita', KeyW: 'topo', KeyS: 'base', KeyH: 'centroH', KeyV: 'centroV' }

const prender = (n, min, max) => Math.min(max, Math.max(min, n))
const digitando = (alvo) => !!alvo?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')
const idDoAlvo = (alvo) => alvo?.closest?.('[data-camada]')?.dataset.camada ?? null

function zoomEm(v, zoom, cx, cy) {
  const z = prender(zoom, ZOOM_MIN, ZOOM_MAX)
  const k = z / v.zoom
  return { zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
}

/** Ponta da linha presa a múltiplos de 45° quando o Shift está apertado. */
function pontaPresa(a, b, presa) {
  if (!presa) return b
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4)
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d }
}

function medirImagem(arquivo) {
  return createImageBitmap(arquivo)
    .then((b) => ({ w: b.width, h: b.height }))
    .catch(() => ({ w: 400, h: 300 }))
}

export default function DesignEditor({ documentId, data, onChange, onCommit, onUndo, onRedo, onError, somenteLeitura = false }) {
  const vazio = useMemo(() => designVazio(), [])
  const doc = data?.pages?.length ? data : vazio
  const dataRef = useRef(doc)
  dataRef.current = doc

  const [paginaId, setPaginaId] = useState(() => doc.pages[0].id)
  const pagina = doc.pages.find((p) => p.id === paginaId) ?? doc.pages[0]
  const paginaIdRef = useRef(pagina.id)
  paginaIdRef.current = pagina.id
  const camadas = pagina.children ?? []

  const [selecaoBruta, setSelecao] = useState([])
  // Seleção que ainda existe: um desfazer pode ter levado a camada embora.
  const selecao = useMemo(() => selecaoBruta.filter((id) => acharCamada(camadas, id)), [selecaoBruta, camadas])
  const [hover, setHover] = useState(null)
  const [ferramenta, setFerramenta] = useState('move')
  const [editando, setEditando] = useState(null)
  const [renomeando, setRenomeando] = useState(null)
  const [painel, setPainel] = useState(null)
  //: Editor estreito: os painéis viram gavetas (ver LARGURA_PARA_PAINEIS).
  //: `null` até medir: enquadrar antes disso usava um quadro de largura zero (os dois
  //: painéis ocupam tudo num editor estreito) e o design abria a 2% de zoom — e salvava assim.
  const [compacto, setCompacto] = useState(null)
  const [vista, setVista] = useState(() => doc.viewport?.[pagina.id] ?? null)
  const [visual, setVisual] = useState(null)
  const [espaco, setEspaco] = useState(false)

  const raizRef = useRef(null)
  const areaRef = useRef(null)
  const palcoRef = useRef(null)
  const gestoRef = useRef(null)
  const focado = useRef(false)
  const vistaRef = useRef(vista)
  vistaRef.current = vista ?? { x: 0, y: 0, zoom: 1 }
  const novoTextoRef = useRef(null)
  const areaDeTransferenciaRef = useRef(null)
  const commitAdiadoRef = useRef(null)
  const imagemRef = useRef(null)
  const trocaDeImagemRef = useRef(null)

  useLayoutEffect(() => {
    const raiz = raizRef.current
    if (!raiz) return undefined
    const medir = () => setCompacto(raiz.clientWidth < LARGURA_PARA_PAINEIS)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(raiz)
    return () => observador.disconnect()
  }, [])

  /** Escolher uma ferramenta tira a gaveta da frente; o frame abre a lista de tamanhos. */
  const escolherFerramenta = (id) => {
    setFerramenta(id)
    if (compacto) setPainel(id === 'frame' ? 'propriedades' : null)
  }

  /* ------------------------------------------------------------------ */
  /* Escrita                                                            */
  /* ------------------------------------------------------------------ */

  // Em refs: o `DocumentEditor` passa funções novas a cada render, e tudo
  // que depende delas (a edição de texto, o salvar do enquadramento) seria
  // refeito a cada quadro — a edição de texto re-selecionava o que já estava
  // escrito, e cada tecla apagava a anterior.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const commitar = useCallback((estado) => onCommitRef.current?.(estado), [])

  // `silencioso`: o que o editor calcula sozinho (medidas do layout, enquadramento)
  // não é edição de ninguém: salva, mas não acende o "não salvo" nem a pilha de
  // desfazer. Sem isso, só abrir um design já deixava a aba com o ponto de editado.
  const escrito = useRef(null)
  const escrever = useCallback((proximo, { commit = false, silencioso = false } = {}) => {
    dataRef.current = proximo
    escrito.current = proximo
    onChangeRef.current(proximo, { silencioso })
    if (commit) commitar(proximo)
    return proximo
  }, [commitar])

  /** Aplica `fn` às camadas da página aberta. */
  const mudarCamadas = useCallback(
    (fn, opcoes = {}) => {
      if (somenteLeitura) return null
      const atual = dataRef.current
      const pag = atual.pages.find((p) => p.id === paginaIdRef.current) ?? atual.pages[0]
      const novas = fn(pag.children ?? [])
      if (novas === pag.children) {
        if (opcoes.commit) commitar(atual)
        return null
      }
      return escrever({ ...atual, pages: atual.pages.map((p) => (p.id === pag.id ? { ...p, children: novas } : p)) }, opcoes)
    },
    [escrever, commitar, somenteLeitura],
  )

  const mudarDoc = useCallback(
    (fn, opcoes) => {
      if (somenteLeitura) return null
      return escrever(fn(dataRef.current), opcoes)
    },
    [escrever, somenteLeitura],
  )

  /** Campos do painel: cada tecla muda a tela, e o passo de desfazer fecha 400 ms depois da última. */
  const commitAdiado = useCallback(() => {
    clearTimeout(commitAdiadoRef.current)
    commitAdiadoRef.current = setTimeout(() => commitar(dataRef.current), 400)
  }, [commitar])
  useEffect(() => () => clearTimeout(commitAdiadoRef.current), [])

  /* ------------------------------------------------------------------ */
  /* Vista (enquadramento)                                              */
  /* ------------------------------------------------------------------ */

  const enquadrar = useCallback((rects, zoomMax = 1) => {
    const caixa = areaRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 }
    if (!rects.length) return { x: Math.round(caixa.width / 2 - 200), y: 80, zoom: 1 }
    const u = uniao(rects)
    const margem = 48
    // A barra de ferramentas flutua embaixo: o enquadramento usa só o que fica acima dela.
    const altura = caixa.height - BARRA
    const zoom = prender(Math.min((caixa.width - margem * 2) / (u.w || 1), (altura - margem * 2) / (u.h || 1)), ZOOM_MIN, zoomMax)
    return { zoom, x: caixa.width / 2 - (u.x + u.w / 2) * zoom, y: altura / 2 - (u.y + u.h / 2) * zoom }
  }, [])

  const caixasDoTopo = (lista) => lista.filter((c) => c.visible !== false).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))

  // Página sem enquadramento salvo abre mostrando tudo.
  useLayoutEffect(() => {
    if (!vista && compacto !== null) setVista(enquadrar(caixasDoTopo(camadas)))
  })

  /** Tem camada, e nenhuma delas está na janela agora? */
  const nadaAVista = (alvos) => {
    const v = vistaRef.current
    const caixa = areaRef.current.getBoundingClientRect()
    const janela = { x: -v.x / v.zoom, y: -v.y / v.zoom, w: caixa.width / v.zoom, h: caixa.height / v.zoom }
    return alvos.length > 0 && !alvos.some((r) => intersecta(r, janela))
  }

  // Enquadramento salvo que não mostra nada daqui (veio de outra janela, de outro
  // aparelho com outra largura): reenquadra, em vez de abrir olhando para o vazio.
  const conferidoRef = useRef(false)
  useLayoutEffect(() => {
    if (compacto === null || conferidoRef.current) return
    conferidoRef.current = true
    if (vista && nadaAVista(caixasDoTopo(camadas))) setVista(enquadrar(caixasDoTopo(camadas)))
  }, [compacto])

  // Página vazia que ganha camadas de fora (o Laviel montou a tela): elas nascem
  // fora do enquadramento da página em branco. Só nesse caso: reenquadrar toda vez
  // que o servidor devolve o documento tiraria a vista de quem está desenhando
  // num canto vazio.
  const estavaVaziaRef = useRef(camadas.length === 0)
  useLayoutEffect(() => {
    const deFora = data !== escrito.current
    if (deFora && estavaVaziaRef.current && camadas.length && compacto !== null && nadaAVista(caixasDoTopo(camadas))) {
      setVista(enquadrar(caixasDoTopo(camadas)))
    }
    estavaVaziaRef.current = camadas.length === 0
  }, [data])

  // O enquadramento fica no documento, por página — reabrir volta onde estava.
  useEffect(() => {
    if (!vista || compacto === null) return undefined
    const salvo = dataRef.current.viewport?.[paginaIdRef.current]
    if (salvo && salvo.x === vista.x && salvo.y === vista.y && salvo.zoom === vista.zoom) return undefined
    const timer = setTimeout(() => {
      const atual = dataRef.current
      escrever({ ...atual, viewport: { ...atual.viewport, [paginaIdRef.current]: vista } }, { silencioso: true })
    }, 600)
    return () => clearTimeout(timer)
  }, [vista, escrever, compacto])

  const zoomPara = useCallback(
    (alvo) => {
      const caixa = areaRef.current?.getBoundingClientRect()
      if (!caixa) return
      const meio = [caixa.width / 2, caixa.height / 2]
      if (alvo === 'tudo') setVista(enquadrar(caixasDoTopo(camadas), 4))
      else if (alvo === 'selecao') {
        const rects = selecao.map((id) => caixaAbsoluta(camadas, id)).filter(Boolean)
        setVista(enquadrar(rects.length ? rects : caixasDoTopo(camadas), 8))
      } else if (alvo === 'mais') setVista((v) => zoomEm(v, v.zoom * 2, ...meio))
      else if (alvo === 'menos') setVista((v) => zoomEm(v, v.zoom / 2, ...meio))
      else setVista((v) => zoomEm(v, alvo, ...meio))
    },
    [camadas, selecao, enquadrar],
  )

  // Roda: arrasta a vista; Ctrl+roda (e a pinça do touchpad) aproxima no ponteiro.
  useEffect(() => {
    const area = areaRef.current
    if (!area) return undefined
    const roda = (e) => {
      e.preventDefault()
      const caixa = area.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        const fator = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025))
        setVista((v) => zoomEm(v, v.zoom * fator, e.clientX - caixa.left, e.clientY - caixa.top))
      } else {
        const horizontal = e.shiftKey && !e.deltaX
        setVista((v) => ({ ...v, x: v.x - (horizontal ? e.deltaY : e.deltaX), y: v.y - (horizontal ? 0 : e.deltaY) }))
      }
    }
    area.addEventListener('wheel', roda, { passive: false })
    return () => area.removeEventListener('wheel', roda)
  }, [])

  const paraMundo = (cx, cy) => {
    const caixa = areaRef.current.getBoundingClientRect()
    const v = vistaRef.current
    return { x: (cx - caixa.left - v.x) / v.zoom, y: (cy - caixa.top - v.y) / v.zoom }
  }

  const centroDaVista = () => {
    const caixa = areaRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 800, height: 600 }
    return paraMundo(caixa.left + caixa.width / 2, caixa.top + caixa.height / 2)
  }

  /* ------------------------------------------------------------------ */
  /* Medidas que só o layout sabe                                       */
  /*                                                                    */
  /* Texto de largura automática, frame que abraça o conteúdo e filho de */
  /* auto layout têm o tamanho (e a posição) decididos pelo CSS. Depois  */
  /* de desenhar, o modelo é corrigido com o que o navegador mediu, para */
  /* a seleção, as guias e o JSON (que o Laviel lê) dizerem a verdade.   */
  /* É estável: o CSS dessas camadas não depende do que se grava aqui.   */
  /* ------------------------------------------------------------------ */
  const [digitado, redesenhar] = useState(0)
  useLayoutEffect(() => {
    if (somenteLeitura || !palcoRef.current || gestoRef.current?.tipo === 'redim') return
    const elementos = new Map([...palcoRef.current.querySelectorAll('[data-camada]')].map((el) => [el.dataset.camada, el]))
    const mudancas = []
    const andar = (lista, pai) => {
      for (const c of lista) {
        if (c.children) andar(c.children, c)
        if (c.visible === false || c.type === 'line') continue
        const dentro = noFluxo(c, pai)
        const solto = c.type === 'text' && c.autoSize !== 'fixed'
        const abraca = temLayout(c) && (c.sizing?.h === 'hug' || c.sizing?.v === 'hug')
        if (!dentro && !solto && !abraca) continue
        const el = elementos.get(c.id)
        if (!el) continue
        const medido = { w: el.offsetWidth, h: el.offsetHeight, ...(dentro ? { x: el.offsetLeft, y: el.offsetTop } : {}) }
        if (Object.entries(medido).some(([k, v]) => Math.abs((c[k] ?? 0) - v) > 0.5)) mudancas.push([c.id, medido])
      }
    }
    andar(camadas, null)
    if (mudancas.length) mudarCamadas((lista) => mudancas.reduce((acc, [id, m]) => atualizar(acc, id, (c) => ({ ...c, ...m })), lista), { silencioso: true })
    // `digitado` (texto em edição) e `visual` (fim do redimensionar) não entram
    // no corpo, mas pedem uma nova medida: sem eles na lista, panorâmica e
    // hover varriam o DOM inteiro a cada quadro.
  }, [camadas, somenteLeitura, mudarCamadas, digitado, visual])

  /* ------------------------------------------------------------------ */
  /* Consultas no quadro                                                */
  /* ------------------------------------------------------------------ */

  /** O frame mais fundo sob o ponto (nada se não houver), ignorando `fora` e o que está dentro deles. */
  const frameSob = useCallback(
    (ponto, fora = new Set()) => {
      let melhor = null
      let fundo = -1
      const andar = (lista, ox, oy, nivel) => {
        for (const c of lista) {
          if (c.visible === false || fora.has(c.id)) continue
          const r = { x: ox + c.x, y: oy + c.y, w: c.w, h: c.h }
          const dentro = contem(r, ponto)
          if (c.type === 'frame' && dentro && nivel >= fundo) {
            melhor = c
            fundo = nivel
          }
          if (c.children && (dentro || c.type === 'group' || !c.clip)) andar(c.children, r.x, r.y, nivel + 1)
        }
      }
      andar(camadas, 0, 0, 0)
      return melhor
    },
    [camadas],
  )

  const origemDe = useCallback((id) => (id == null ? { x: 0, y: 0, w: 0, h: 0 } : caixaAbsoluta(camadas, id)), [camadas])

  /** Retângulos dos irmãos (fora os da seleção), no espaço do pai. */
  const irmaosDe = (paiId, ids) => {
    const agora = camadasAgora()
    const lista = paiId == null ? agora : acharCamada(agora, paiId)?.children ?? []
    return lista.filter((c) => !ids.includes(c.id) && c.visible !== false).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
  }

  /** Só as camadas do topo da seleção: arrastar um frame e um filho dele moveria o filho duas vezes. */
  const semDescendentes = (ids) => soAsDeCima(camadas, ids)

  /** As camadas da página como estão AGORA (no meio de um gesto, o render já ficou para trás). */
  const camadasAgora = () => dataRef.current.pages.find((p) => p.id === paginaIdRef.current)?.children ?? camadas
  /** Origem do pai na página, lida do estado atual: o grupo muda de origem a cada quadro do gesto. */
  const origemAgora = (paiId) => (paiId == null ? { x: 0, y: 0 } : caixaAbsoluta(camadasAgora(), paiId) ?? { x: 0, y: 0 })

  /* ------------------------------------------------------------------ */
  /* Ações                                                              */
  /* ------------------------------------------------------------------ */

  const removerSelecao = () => {
    if (!selecao.length) return
    mudarCamadas((l) => remover(l, selecao), { commit: true })
    setSelecao([])
  }

  const duplicarSelecao = () => {
    if (!selecao.length) return
    let novos = []
    mudarCamadas(
      (l) => {
        const r = duplicar(l, semDescendentes(selecao))
        novos = r.ids
        return r.children
      },
      { commit: true },
    )
    setSelecao(novos)
  }

  const agruparSelecao = (tipo) => {
    if (!selecao.length) return
    let id = null
    mudarCamadas(
      (l) => {
        const r = (tipo === 'frame' ? emoldurar : agrupar)(l, semDescendentes(selecao))
        id = r.id
        return r.children
      },
      { commit: true },
    )
    if (id) setSelecao([id])
  }

  const desagruparSelecao = () => {
    let soltos = []
    mudarCamadas(
      (l) => {
        const r = desagrupar(l, selecao.filter((id) => acharCamada(l, id)?.children))
        soltos = r.ids
        return r.children
      },
      { commit: true },
    )
    if (soltos.length) setSelecao(soltos)
  }

  const alternar = (ids, campo) => {
    if (!ids.length) return
    const todas = ids.map((id) => acharCamada(camadas, id))
    const ligar = campo === 'visible' ? todas.some((c) => c.visible === false) : !todas.every((c) => c.locked)
    mudarCamadas(
      (l) =>
        ids.reduce(
          (acc, id) =>
            atualizar(acc, id, (c) => {
              const { [campo]: _, ...resto } = c
              return campo === 'visible' ? (ligar ? resto : { ...resto, visible: false }) : ligar ? { ...resto, locked: true } : resto
            }),
          l,
        ),
      { commit: true },
    )
  }

  const empurrar = (dx, dy) => {
    const livres = selecao.filter((id) => {
      const c = acharCamada(camadas, id)
      return !c.locked && !noFluxo(c, paiDe(camadas, id))
    })
    if (!livres.length) return
    mudarCamadas((l) => livres.reduce((acc, id) => atualizar(acc, id, (c) => ({ ...c, x: c.x + dx, y: c.y + dy })), l), { commit: true })
  }

  const alinharSelecao = (modo) => {
    const ids = semDescendentes(selecao)
    if (!ids.length) return
    const rects = ids.map((id) => ({ id, ...caixaAbsoluta(camadas, id) }))
    const pai = ids.length === 1 ? paiDe(camadas, ids[0]) : null
    if (ids.length === 1 && !pai) return
    const deslocs = deslocamentosDeAlinhamento(rects, modo, pai && caixaAbsoluta(camadas, pai.id))
    mudarCamadas((l) => deslocs.reduce((acc, d) => atualizar(acc, d.id, (c) => ({ ...c, x: c.x + d.dx, y: c.y + d.dy })), l), { commit: true })
  }

  const distribuirSelecao = (eixo) => {
    const ids = semDescendentes(selecao)
    const deslocs = deslocamentosDeDistribuicao(ids.map((id) => ({ id, ...caixaAbsoluta(camadas, id) })), eixo)
    mudarCamadas((l) => deslocs.reduce((acc, d) => atualizar(acc, d.id, (c) => ({ ...c, x: c.x + d.dx, y: c.y + d.dy })), l), { commit: true })
  }

  /** Shift+A: auto layout no frame selecionado, ou um frame com auto layout em volta da seleção. */
  const adicionarAutoLayout = () => {
    const ids = semDescendentes(selecao)
    if (!ids.length) return
    const unico = ids.length === 1 ? acharCamada(camadas, ids[0]) : null
    if (unico?.type === 'frame' && !temLayout(unico)) {
      const { layout, ordem } = inferirLayout(unico.children.filter((c) => !c.absolute), unico)
      const topo = !paiDe(camadas, unico.id)
      mudarCamadas(
        (l) =>
          atualizar(l, unico.id, (f) => ({
            ...f,
            layout,
            // Tela (frame do topo) mantém o tamanho; o resto abraça o conteúdo.
            ...(topo ? {} : { sizing: { h: 'hug', v: 'hug' } }),
            children: [...f.children].sort((a, b) => {
              const ia = ordem.indexOf(a.id)
              const ib = ordem.indexOf(b.id)
              return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
            }),
          })),
        { commit: true },
      )
      return
    }
    let novo = null
    mudarCamadas(
      (l) => {
        const r = emoldurar(l, ids)
        novo = r.id
        const frame = acharCamada(r.children, r.id)
        const { layout, ordem } = inferirLayout(frame.children, null)
        return atualizar(r.children, r.id, (f) => ({
          ...f,
          name: nomeLivre(l, t('Auto layout')),
          layout,
          sizing: { h: 'hug', v: 'hug' },
          children: ordem.map((id) => f.children.find((c) => c.id === id)),
        }))
      },
      { commit: true },
    )
    if (novo) setSelecao([novo])
  }

  const selecionarTudo = () => {
    const pai = selecao.length ? paiDe(camadas, selecao[0]) : null
    const lista = pai ? pai.children : camadas
    setSelecao(lista.filter((c) => c.visible !== false && !c.locked).map((c) => c.id))
  }

  /* ------------------------------------------------------------------ */
  /* Texto                                                              */
  /* ------------------------------------------------------------------ */

  const terminarEdicao = useCallback(
    (el, id) => {
      const texto = el.innerText.replace(/\n$/, '')
      const eraNovo = novoTextoRef.current === id
      novoTextoRef.current = null
      setEditando(null)
      if (!texto.trim()) {
        // Texto vazio some, como no Figma. O recém-criado nem chega ao desfazer.
        mudarCamadas((l) => remover(l, [id]), { commit: !eraNovo })
        setSelecao([])
        return
      }
      mudarCamadas((l) => atualizar(l, id, (c) => (c.text === texto ? c : { ...c, text: texto })), { commit: true })
      setSelecao([id])
    },
    [mudarCamadas],
  )

  useEffect(() => {
    if (!editando) return undefined
    const el = palcoRef.current?.querySelector(`[data-camada="${CSS.escape(editando)}"] > [data-texto]`)
    if (!el) return undefined
    const id = editando
    el.style.userSelect = 'text'
    el.contentEditable = 'plaintext-only'
    // Navegador sem `plaintext-only` recusa o valor e fica em "inherit".
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'
    el.focus()
    const faixa = document.createRange()
    faixa.selectNodeContents(el)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(faixa)
    const teclar = (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        el.blur()
      }
    }
    const digitar = () => redesenhar((n) => n + 1)
    const sair = () => terminarEdicao(el, id)
    el.addEventListener('keydown', teclar)
    el.addEventListener('input', digitar)
    el.addEventListener('blur', sair)
    return () => {
      el.removeEventListener('keydown', teclar)
      el.removeEventListener('input', digitar)
      el.removeEventListener('blur', sair)
      el.contentEditable = 'false'
      el.style.userSelect = ''
    }
  }, [editando, terminarEdicao])

  /* ------------------------------------------------------------------ */
  /* Imagens                                                            */
  /* ------------------------------------------------------------------ */

  const enviarImagem = async (arquivo) => {
    const corpo = new FormData()
    corpo.append('files', arquivo)
    corpo.append('attached_to', documentId)
    const { data: enviados } = await api.post('/documents/upload/', corpo)
    const url = enviados?.[0]?.file_url
    if (!url) throw new Error(t('Não foi possível enviar a imagem.'))
    return url
  }

  const semDocumento = () => {
    if (documentId) return false
    onError?.(t('Clique em Criar para salvar o design e depois adicione a imagem.'))
    return true
  }

  /** Cada imagem vira um retângulo com preenchimento de imagem, como no Figma. */
  const adicionarImagens = async (arquivos, ponto = centroDaVista()) => {
    if (somenteLeitura || semDocumento()) return
    const novos = []
    for (const [i, arquivo] of arquivos.entries()) {
      try {
        const [tamanho, url] = await Promise.all([medirImagem(arquivo), enviarImagem(arquivo)])
        const destino = frameSob(ponto)
        const limite = destino ? Math.min(destino.w, 800) : 800
        const escala = Math.min(1, limite / tamanho.w)
        const w = Math.round(tamanho.w * escala)
        const h = Math.round(tamanho.h * escala)
        const origem = origemDe(destino?.id ?? null)
        // Dentro de um frame, a imagem não passa da borda dele se couber.
        const dentro = (n, tamanho, limiteDoFrame) => (destino && tamanho <= limiteDoFrame ? Math.min(Math.max(n, 0), limiteDoFrame - tamanho) : n)
        const camada = novaCamada('rect', {
          name: arquivo.name.replace(/\.[^.]+$/, '') || nomeDoTipo('rect'),
          x: Math.round(dentro(ponto.x - w / 2 - origem.x + i * 20, w, destino?.w)),
          y: Math.round(dentro(ponto.y - h / 2 - origem.y + i * 20, h, destino?.h)),
          w,
          h,
          fills: [{ type: 'image', src: url, fit: 'fill' }],
        })
        mudarCamadas((l) => inserir(l, destino?.id ?? null, camada), { commit: true })
        novos.push(camada.id)
      } catch (erro) {
        onError?.(extractError(erro))
      }
    }
    if (novos.length) setSelecao(novos)
  }

  /** Para o painel: escolhe um arquivo, sobe e devolve o endereço. */
  const escolherImagem = (aoEscolher) => {
    if (semDocumento()) return
    trocaDeImagemRef.current = aoEscolher
    imagemRef.current?.click()
  }

  /* ------------------------------------------------------------------ */
  /* Área de transferência                                              */
  /* ------------------------------------------------------------------ */

  const pacoteDaSelecao = () =>
    semDescendentes(selecao).map((id) => {
      const abs = caixaAbsoluta(camadas, id)
      return { ...acharCamada(camadas, id), x: abs.x, y: abs.y }
    })

  const textosDe = (lista) => {
    const textos = []
    const andar = (l) => l.forEach((c) => (c.type === 'text' && c.text ? textos.push(c.text) : c.children && andar(c.children)))
    andar(lista)
    return textos.join('\n')
  }

  const colarCamadas = (pacote) => {
    if (!pacote?.length || somenteLeitura) return
    const alvo = selecao.length === 1 ? acharCamada(camadas, selecao[0]) : null
    const destino = alvo?.type === 'frame' ? alvo : selecao.length ? paiDe(camadas, selecao[0]) : null
    const origem = origemDe(destino?.id ?? null)
    const u = uniao(pacote.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })))
    // Onde estava, se ainda cabe no destino (ou na vista); senão, no meio dele.
    const area = destino ? origem : (() => {
      const caixa = areaRef.current.getBoundingClientRect()
      const a = paraMundo(caixa.left, caixa.top)
      return { ...a, w: caixa.width / vistaRef.current.zoom, h: caixa.height / vistaRef.current.zoom }
    })()
    const ajuste = intersecta(u, area) ? { x: 0, y: 0 } : { x: area.x + area.w / 2 - (u.x + u.w / 2), y: area.y + area.h / 2 - (u.y + u.h / 2) }
    const novas = pacote.map((c) => ({ ...clonar(c), x: Math.round(c.x + ajuste.x - origem.x), y: Math.round(c.y + ajuste.y - origem.y) }))
    mudarCamadas((l) => inserir(l, destino?.id ?? null, novas), { commit: true })
    setSelecao(novas.map((c) => c.id))
  }

  const colarTexto = (texto) => {
    const alvo = selecao.length === 1 ? acharCamada(camadas, selecao[0]) : null
    const destino = alvo?.type === 'frame' ? alvo : null
    const ponto = destino ? (() => {
      const o = origemDe(destino.id)
      return { x: o.x + 16, y: o.y + 16 }
    })() : centroDaVista()
    const origem = origemDe(destino?.id ?? null)
    const camada = novaCamada('text', { text: texto.trim(), x: Math.round(ponto.x - origem.x), y: Math.round(ponto.y - origem.y) })
    mudarCamadas((l) => inserir(l, destino?.id ?? null, camada), { commit: true })
    setSelecao([camada.id])
  }

  const aoCopiar = (e) => {
    if (!focado.current || digitando(e.target) || editando || !selecao.length) return
    const pacote = pacoteDaSelecao()
    areaDeTransferenciaRef.current = pacote
    e.clipboardData?.setData(MIME, JSON.stringify({ camadas: pacote }))
    e.clipboardData?.setData('text/plain', textosDe(pacote) || t('Camadas do Notefy'))
    e.preventDefault()
    if (e.type === 'cut') removerSelecao()
  }
  useListenerDeJanela('copy', aoCopiar)
  useListenerDeJanela('cut', aoCopiar)

  useListenerDeJanela('paste', (e) => {
    if (!focado.current || digitando(e.target) || editando || somenteLeitura) return
    const dados = e.clipboardData
    const proprio = dados?.getData(MIME)
    if (proprio) {
      e.preventDefault()
      try {
        colarCamadas(JSON.parse(proprio).camadas)
      } catch {
        // Conteúdo corrompido: não há o que colar.
      }
      return
    }
    const imagens = [...(dados?.files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (imagens.length) {
      e.preventDefault()
      adicionarImagens(imagens)
      return
    }
    const texto = dados?.getData('text/plain') ?? ''
    if (texto.trim()) {
      e.preventDefault()
      // Cópia feita aqui cujo formato próprio se perdeu (WebView que o descarta).
      if (areaDeTransferenciaRef.current && texto === (textosDe(areaDeTransferenciaRef.current) || t('Camadas do Notefy'))) colarCamadas(areaDeTransferenciaRef.current)
      else colarTexto(texto)
    }
  })

  /* ------------------------------------------------------------------ */
  /* Teclado                                                            */
  /* ------------------------------------------------------------------ */

  // O editor só responde ao teclado depois de um clique dentro dele: com o
  // "abrir ao lado" há dois editores escutando o window.
  useEffect(() => {
    const rastrear = (e) => {
      const alvo = e.target
      if (alvo instanceof Node && alvo.closest?.('[role="menu"]')) return
      focado.current = alvo instanceof Node && !!raizRef.current?.contains(alvo)
    }
    window.addEventListener('pointerdown', rastrear, true)
    return () => window.removeEventListener('pointerdown', rastrear, true)
  }, [])

  useListenerDeJanela('keyup', (e) => {
    if (e.key === ' ') setEspaco(false)
  })
  // Trocar de janela com o Espaço apertado: o keyup nunca chega e a mão ficava presa.
  useListenerDeJanela('blur', () => setEspaco(false))

  useListenerDeJanela('keydown', (e) => {
    if (!focado.current || digitando(e.target) || editando) return
    const mod = e.ctrlKey || e.metaKey
    const tecla = e.key.toLowerCase()

    const acao = atalhoDe(e)
    if (acao) {
      e.preventDefault()
      return acao === 'undo' ? onUndo?.() : onRedo?.()
    }
    // Botão, link e item de menu com o foco: Espaço, Enter e Tab são DELES. Sem
    // isto a barra de ferramentas não ativava com o teclado, e o Tab nunca saía
    // das propriedades (virava "próxima camada").
    const emControle = !!e.target.closest?.('button, a, summary, [role="menuitem"]')
    if (e.key === ' ' && !emControle && !e.repeat) {
      e.preventDefault()
      setEspaco(true)
      return
    }
    // Zoom e enquadramento valem também no somente leitura.
    if (e.shiftKey && !mod && ['Digit1', 'Digit2', 'Digit0'].includes(e.code)) {
      e.preventDefault()
      return zoomPara({ Digit1: 'tudo', Digit2: 'selecao', Digit0: 1 }[e.code])
    }
    if (['=', '+', '-', '_'].includes(e.key)) {
      e.preventDefault()
      return zoomPara(e.key === '-' || e.key === '_' ? 'menos' : 'mais')
    }
    if (e.key === 'Escape') {
      if (ferramenta !== 'move') setFerramenta('move')
      else setSelecao([])
      return
    }
    if (mod && tecla === 'a') {
      e.preventDefault()
      return selecionarTudo()
    }
    if (e.key === 'Tab' && !emControle && selecao.length === 1) {
      e.preventDefault()
      const pai = paiDe(camadas, selecao[0])
      const lista = (pai ? pai.children : camadas).filter((c) => c.visible !== false)
      const i = lista.findIndex((c) => c.id === selecao[0])
      const proxima = lista[(i + (e.shiftKey ? -1 : 1) + lista.length) % lista.length]
      if (proxima) setSelecao([proxima.id])
      return
    }
    if (e.key === 'Enter' && !emControle && selecao.length === 1) {
      e.preventDefault()
      const c = acharCamada(camadas, selecao[0])
      if (e.shiftKey) {
        const pai = paiDe(camadas, c.id)
        if (pai) setSelecao([pai.id])
      } else if (c.type === 'text' && !somenteLeitura && !c.locked) setEditando(c.id)
      else if (c.children?.length) setSelecao(c.children.filter((f) => f.visible !== false).map((f) => f.id))
      return
    }
    if (somenteLeitura) return

    if (!mod && !e.altKey && !e.shiftKey && ATALHOS_DE_FERRAMENTA[tecla]) return setFerramenta(ATALHOS_DE_FERRAMENTA[tecla])
    if (e.shiftKey && !mod && e.code === 'KeyA') {
      e.preventDefault()
      return adicionarAutoLayout()
    }
    if (e.altKey && !mod && ALINHAR_POR_TECLA[e.code]) {
      e.preventDefault()
      return alinharSelecao(ALINHAR_POR_TECLA[e.code])
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      return removerSelecao()
    }
    if (e.key.startsWith('Arrow') && selecao.length) {
      e.preventDefault()
      const passo = e.shiftKey ? 10 : 1
      const [dx, dy] = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key]
      return empurrar(dx, dy)
    }
    if (!mod) return
    if (tecla === 'd') {
      e.preventDefault()
      return duplicarSelecao()
    }
    if (tecla === 'g') {
      e.preventDefault()
      if (e.shiftKey) return desagruparSelecao()
      return agruparSelecao(e.altKey ? 'frame' : 'group')
    }
    if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
      e.preventDefault()
      const frente = e.code === 'BracketRight'
      return mudarCamadas((l) => reordenar(l, selecao, e.shiftKey ? (frente ? 'topo' : 'fundo') : frente ? 'frente' : 'tras'), { commit: true })
    }
    if (e.shiftKey && tecla === 'h') {
      e.preventDefault()
      return alternar(selecao, 'visible')
    }
    if (e.shiftKey && tecla === 'l') {
      e.preventDefault()
      return alternar(selecao, 'locked')
    }
    if (tecla === 'r' && selecao.length === 1) {
      e.preventDefault()
      setPainel('camadas')
      return setRenomeando(selecao[0])
    }
  })

  /* ------------------------------------------------------------------ */
  /* Ponteiro                                                           */
  /* ------------------------------------------------------------------ */

  const caminhoDoAlvo = (alvo) => {
    const id = idDoAlvo(alvo)
    return id ? caminhoAte(camadas, id) : []
  }

  const iniciarMover = (e, ids) => {
    const livres = semDescendentes(ids).filter((id) => !acharCamada(camadas, id)?.locked)
    if (!livres.length) return
    const caixas = livres.map((id) => caixaAbsoluta(camadas, id))
    const paiId = paiComum(camadas, livres)
    gestoRef.current = {
      tipo: 'mover',
      x0: e.clientX,
      y0: e.clientY,
      ids: livres,
      uniao: uniao(caixas.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))),
      paiId,
      alt: e.altKey,
      iniciou: false,
    }
  }

  /** Prende o ponteiro no quadro; um ponteiro que já sumiu (dedo levantado) lança, e não há o que prender. */
  const capturar = (id) => {
    try {
      areaRef.current.setPointerCapture(id)
    } catch {
      // Ponteiro já solto.
    }
  }

  /** Dedos na tela: com dois, o gesto vira pinça (zoom e arraste da vista). */
  const dedosRef = useRef(new Map())
  const pinca = () => {
    const [a, b] = [...dedosRef.current.values()]
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }

  const aoPressionar = (e) => {
    // Gaveta aberta (celular): tocar no quadro fecha, como em qualquer gaveta.
    if (painel && compacto) setPainel(null)
    if (e.pointerType !== 'mouse' && e.isPrimary && e.button === 0) {
      const agora = performance.now()
      const anterior = toqueAnteriorRef.current
      if (anterior && agora - anterior.t < 320 && Math.hypot(e.clientX - anterior.x, e.clientY - anterior.y) < 24) {
        toqueAnteriorRef.current = null
        duploToqueEmRef.current = agora
        duploNoPonto(e.clientX, e.clientY, e.target)
        return
      }
      toqueAnteriorRef.current = { t: agora, x: e.clientX, y: e.clientY }
    }
    if (e.pointerType === 'touch') {
      dedosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (dedosRef.current.size === 2) {
        capturar(e.pointerId)
        // O primeiro dedo pode ter começado a criar ou mover algo: fica como estava até ali.
        if (gestoRef.current && gestoRef.current.tipo !== 'pan') commitar(dataRef.current)
        setVisual(null)
        gestoRef.current = { tipo: 'pinca', ...pinca(), vista0: vistaRef.current }
        return
      }
    }
    if (!e.isPrimary || editando) return
    const alvo = e.target
    // Botão direito: seleciona o que está embaixo, se ainda não estiver (o menu vem no `contextmenu`).
    if (e.button === 2) {
      const id = alvoDoClique(caminhoDoAlvo(alvo), selecao, { profundo: e.ctrlKey || e.metaKey }) ?? alvo.closest?.('[data-rotulo]')?.dataset.rotulo
      if (id && !selecao.includes(id)) setSelecao([id])
      return
    }
    capturar(e.pointerId)

    if (e.button === 1 || ferramenta === 'hand' || espaco) {
      gestoRef.current = { tipo: 'pan', x0: e.clientX, y0: e.clientY, vista0: vistaRef.current }
      setVisual({ tipo: 'pan' })
      return
    }
    if (e.button !== 0) return
    const ponto = paraMundo(e.clientX, e.clientY)

    if (!somenteLeitura) {
      const alca = alvo.closest?.('[data-alca]')?.dataset.alca
      if (alca) {
        const orig = new Map(selecao.map((id) => [id, acharCamada(camadas, id)]))
        const caixas = new Map(selecao.map((id) => [id, caixaAbsoluta(camadas, id)]))
        gestoRef.current = { tipo: 'redim', alca, x0: e.clientX, y0: e.clientY, ids: [...selecao], orig, caixas, uniao: uniao([...caixas.values()]) }
        return
      }
      const canto = alvo.closest?.('[data-girar]')
      if (canto && selecao.length === 1) {
        const c = acharCamada(camadas, selecao[0])
        const abs = caixaAbsoluta(camadas, c.id)
        const centro = { x: abs.x + abs.w / 2, y: abs.y + abs.h / 2 }
        gestoRef.current = { tipo: 'girar', id: c.id, centro, a0: Math.atan2(ponto.y - centro.y, ponto.x - centro.x), rot0: c.rotation ?? 0 }
        setVisual({ tipo: 'girar', angulo: c.rotation ?? 0 })
        return
      }
      const ponta = alvo.closest?.('[data-ponta]')?.dataset.ponta
      if (ponta && selecao.length === 1) {
        const c = acharCamada(camadas, selecao[0])
        const abs = caixaAbsoluta(camadas, c.id)
        const rad = ((c.rotation ?? 0) * Math.PI) / 180
        const a = { x: abs.x, y: abs.y }
        const b = { x: abs.x + Math.cos(rad) * c.w, y: abs.y + Math.sin(rad) * c.w }
        gestoRef.current = { tipo: 'ponta', id: c.id, qual: ponta, a, b }
        return
      }
    }

    const rotulo = alvo.closest?.('[data-rotulo]')?.dataset.rotulo
    if (rotulo) {
      const frame = acharCamada(camadas, rotulo)
      if (frame.locked) return
      const ids = e.shiftKey ? [...new Set([...selecao, rotulo])] : selecao.includes(rotulo) ? selecao : [rotulo]
      setSelecao(ids)
      if (!somenteLeitura) iniciarMover(e, ids)
      return
    }

    if (!somenteLeitura && ferramenta !== 'move') {
      gestoRef.current = { tipo: 'criar', ferramenta, x0: e.clientX, y0: e.clientY, p0: ponto, destino: frameSob(ponto), id: null }
      return
    }

    const caminho = caminhoDoAlvo(alvo)
    const id = alvoDoClique(caminho, selecao, { profundo: e.ctrlKey || e.metaKey })
    if (id) {
      let ids
      if (e.shiftKey) ids = selecao.includes(id) ? selecao.filter((s) => s !== id) : [...selecao, id]
      else ids = selecao.includes(id) ? selecao : [id]
      setSelecao(ids)
      if (!somenteLeitura && ids.includes(id)) {
        iniciarMover(e, ids)
        if (gestoRef.current) gestoRef.current.clique = { id, somar: e.shiftKey }
      }
      return
    }
    // Fundo: seleção de área, no escopo do frame do topo onde começou (ou da página).
    const escopo = caminho[0]?.type === 'frame' && caminho.length === 1 ? caminho[0].id : null
    if (!e.shiftKey) setSelecao([])
    gestoRef.current = { tipo: 'area', x0: e.clientX, y0: e.clientY, p0: ponto, escopo, base: e.shiftKey ? selecao : [] }
  }

  const moverGesto = (g, e) => {
    const z = vistaRef.current.zoom
    let dx = (e.clientX - g.x0) / z
    let dy = (e.clientY - g.y0) / z
    if (!g.iniciou) {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < LIMIAR) return
      g.iniciou = true
      // Alt+arrastar leva uma cópia; o original fica.
      if (g.alt) {
        let novos = []
        mudarCamadas((l) => {
          const r = duplicar(l, g.ids, { noLugar: true })
          novos = r.ids
          return r.children
        })
        g.ids = novos
        setSelecao(novos)
      }
    }
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0
      else dx = 0
    }
    const atuais = camadasAgora()
    const primeira = acharCamada(atuais, g.ids[0])
    const pai = g.paiId === undefined ? null : g.paiId == null ? null : acharCamada(atuais, g.paiId)
    const fluxo = g.ids.every((id) => noFluxo(acharCamada(atuais, id), paiDe(atuais, id)))
    let guias = []
    if (!fluxo && g.paiId !== undefined && !(primeira.rotation ?? 0)) {
      const origem = g.paiId == null ? { x: 0, y: 0 } : caixaAbsoluta(atuais, g.paiId)
      const ret = { x: g.uniao.x - origem.x + dx, y: g.uniao.y - origem.y + dy, w: g.uniao.w, h: g.uniao.h }
      const r = encaixar(ret, irmaosDe(g.paiId, g.ids), pai && { w: pai.w, h: pai.h }, { zoom: z })
      dx += r.ret.x - ret.x
      dy += r.ret.y - ret.y
      guias = r.guias.map((gu) => ({ ...gu, pos: gu.pos + (gu.eixo === 'x' ? origem.x : origem.y), de: gu.de + (gu.eixo === 'x' ? origem.y : origem.x), ate: gu.ate + (gu.eixo === 'x' ? origem.y : origem.x) }))
    }
    dx = Math.round(dx)
    dy = Math.round(dy)

    // Para onde vai ao soltar: o frame sob o ponteiro. Dentro de grupo, fica no grupo.
    let destino = g.paiId === undefined ? undefined : frameSob(paraMundo(e.clientX, e.clientY), new Set(g.ids))?.id ?? null
    const paiAtual = g.paiId != null ? acharCamada(atuais, g.paiId) : null
    if (paiAtual?.type === 'group' && (destino == null || estaDentro(atuais, paiAtual.id, destino))) destino = paiAtual.id
    let indicador = null
    const alvo = destino != null ? acharCamada(atuais, destino) : null
    if (alvo && temLayout(alvo) && g.ids.every((id) => !acharCamada(atuais, id).absolute)) {
      const o = caixaAbsoluta(atuais, alvo.id)
      const p = paraMundo(e.clientX, e.clientY)
      const linha = alvo.layout.mode === 'row'
      const fila = alvo.children.filter((c) => !g.ids.includes(c.id) && c.visible !== false && !c.absolute)
      const pos = linha ? p.x - o.x : p.y - o.y
      let i = fila.findIndex((c) => pos < (linha ? c.x + c.w / 2 : c.y + c.h / 2))
      if (i < 0) i = fila.length
      const vizinha = fila[i] ?? fila.at(-1)
      const resto = alvo.children.filter((c) => !g.ids.includes(c.id))
      const indice = fila[i] ? resto.indexOf(fila[i]) : resto.length
      const meio = (alvo.layout.gap ?? 0) / 2
      const corte = !vizinha ? (linha ? o.x + (alvo.layout.padding?.[3] ?? 0) : o.y + (alvo.layout.padding?.[0] ?? 0)) : fila[i]
        ? (linha ? o.x + vizinha.x - meio : o.y + vizinha.y - meio)
        : linha ? o.x + vizinha.x + vizinha.w + meio : o.y + vizinha.y + vizinha.h + meio
      indicador = { indice, linha: linha ? { x1: corte, y1: o.y, x2: corte, y2: o.y + alvo.h } : { x1: o.x, y1: corte, x2: o.x + alvo.w, y2: corte } }
    }
    g.ultimo = { dx, dy, destino, indicador }
    setVisual({ tipo: 'mover', ids: g.ids, dx, dy, guias, indicador })
  }

  const soltarMover = (g) => {
    if (!g.iniciou) {
      // Clique sem arraste numa camada de uma seleção múltipla: fica só ela.
      if (g.clique && !g.clique.somar && selecao.length > 1) setSelecao([g.clique.id])
      return
    }
    const { dx, dy, destino, indicador } = g.ultimo ?? { dx: 0, dy: 0 }
    mudarCamadas(
      (l) => {
        let lista = g.ids.reduce((acc, id) => atualizar(acc, id, (c) => ({ ...c, x: Math.round(c.x + dx), y: Math.round(c.y + dy) })), l)
        if (destino === undefined) return lista
        const alvo = destino != null ? acharCamada(lista, destino) : null
        const reordena = alvo && temLayout(alvo) && indicador
        if (destino !== g.paiId || reordena) lista = moverPara(lista, g.ids, destino, reordena ? indicador.indice : undefined)
        return lista
      },
      { commit: true },
    )
  }

  const aoMover = (e) => {
    if (dedosRef.current.has(e.pointerId)) dedosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gestoRef.current
    if (g?.tipo === 'pinca') {
      if (dedosRef.current.size < 2) return
      const agora = pinca()
      const caixa = areaRef.current.getBoundingClientRect()
      const v = zoomEm(g.vista0, g.vista0.zoom * (agora.d / g.d), g.m.x - caixa.left, g.m.y - caixa.top)
      setVista({ ...v, x: v.x + agora.m.x - g.m.x, y: v.y + agora.m.y - g.m.y })
      return
    }
    if (!g) {
      if (e.pointerType === 'mouse' && ferramenta === 'move' && !espaco) {
        const rotulo = e.target.closest?.('[data-rotulo]')?.dataset.rotulo
        const id = rotulo ?? alvoDoClique(caminhoDoAlvo(e.target), selecao, { profundo: e.ctrlKey || e.metaKey })
        if (id !== hover) setHover(id)
      }
      return
    }
    const z = vistaRef.current.zoom
    if (g.tipo === 'pan') {
      setVista({ ...g.vista0, x: g.vista0.x + e.clientX - g.x0, y: g.vista0.y + e.clientY - g.y0 })
    } else if (g.tipo === 'mover') {
      moverGesto(g, e)
    } else if (g.tipo === 'area') {
      const p = paraMundo(e.clientX, e.clientY)
      const rect = { x: Math.min(g.p0.x, p.x), y: Math.min(g.p0.y, p.y), w: Math.abs(p.x - g.p0.x), h: Math.abs(p.y - g.p0.y) }
      const lista = g.escopo ? acharCamada(camadas, g.escopo).children : camadas
      const origem = origemDe(g.escopo)
      const dentro = lista
        .filter((c) => c.visible !== false && !c.locked && intersecta(rect, { x: origem.x + c.x, y: origem.y + c.y, w: Math.max(c.w, 1), h: Math.max(c.h, 1) }))
        .map((c) => c.id)
      setSelecao([...new Set([...g.base, ...dentro])])
      setVisual({ tipo: 'area', rect })
    } else if (g.tipo === 'redim') {
      const dx = (e.clientX - g.x0) / z
      const dy = (e.clientY - g.y0) / z
      const opcoes = { proporcional: e.shiftKey, doCentro: e.altKey }
      let guias = []
      if (g.ids.length === 1) {
        const id = g.ids[0]
        const orig = g.orig.get(id)
        // Na página, e só no fim no espaço do pai: dentro de grupo, a origem do
        // pai anda a cada quadro, e partir do x/y de quando o gesto começou
        // acumulava erro.
        const paiId = paiDe(camadasAgora(), id)?.id ?? null
        const origem = origemAgora(paiId)
        const abs = redimensionar(g.caixas.get(id), g.alca, dx, dy, opcoes)
        let r = { ...abs, x: abs.x - origem.x, y: abs.y - origem.y }
        if (!(orig.rotation ?? 0) && ['e', 's', 'se'].includes(g.alca) && !opcoes.proporcional && !opcoes.doCentro) {
          const pai = paiId ? acharCamada(camadasAgora(), paiId) : null
          const res = encaixar(r, irmaosDe(paiId, [id]), pai && { w: pai.w, h: pai.h }, { zoom: z, modo: 'tamanho' })
          r = { ...res.ret, w: Math.round(res.ret.w), h: Math.round(res.ret.h) }
          guias = res.guias.map((gu) => ({ ...gu, pos: gu.pos + (gu.eixo === 'x' ? origem.x : origem.y), de: gu.de + (gu.eixo === 'x' ? origem.y : origem.x), ate: gu.ate + (gu.eixo === 'x' ? origem.y : origem.x) }))
        }
        mudarCamadas((l) => atualizar(l, id, () => ajustarTamanho(orig, r)))
      } else {
        const u = g.uniao
        const R = redimensionar({ ...u, rotation: 0 }, g.alca, dx, dy, opcoes)
        const sx = u.w ? R.w / u.w : 1
        const sy = u.h ? R.h / u.h : 1
        mudarCamadas((l) =>
          g.ids.reduce((acc, id) => {
            const orig = g.orig.get(id)
            const a = g.caixas.get(id)
            const nx = R.x + (a.x - u.x) * sx
            const ny = R.y + (a.y - u.y) * sy
            const origem = paiDe(acc, id) ? caixaAbsoluta(acc, paiDe(acc, id).id) : { x: 0, y: 0 }
            return atualizar(acc, id, () => ajustarTamanho(orig, { x: Math.round(nx - origem.x), y: Math.round(ny - origem.y), w: Math.max(1, Math.round(a.w * sx)), h: Math.max(orig.type === 'line' ? 0 : 1, Math.round(a.h * sy)) }))
          }, l),
        )
      }
      setVisual({ tipo: 'redim', guias })
    } else if (g.tipo === 'girar') {
      const p = paraMundo(e.clientX, e.clientY)
      let ang = g.rot0 + ((Math.atan2(p.y - g.centro.y, p.x - g.centro.x) - g.a0) * 180) / Math.PI
      if (e.shiftKey) ang = Math.round(ang / 15) * 15
      ang = Math.round(((((ang + 180) % 360) + 360) % 360 - 180) * 100) / 100
      mudarCamadas((l) => atualizar(l, g.id, (c) => ({ ...c, rotation: ang })))
      setVisual({ tipo: 'girar', angulo: ang })
    } else if (g.tipo === 'ponta') {
      const fixa = g.qual === 'fim' ? g.a : g.b
      const solta = pontaPresa(fixa, paraMundo(e.clientX, e.clientY), e.shiftKey)
      const [a, b] = g.qual === 'fim' ? [fixa, solta] : [solta, fixa]
      const origem = origemAgora(paiDe(camadasAgora(), g.id)?.id ?? null)
      mudarCamadas((l) =>
        atualizar(l, g.id, (c) => ({
          ...c,
          x: Math.round((a.x - origem.x) * 100) / 100,
          y: Math.round((a.y - origem.y) * 100) / 100,
          w: Math.round(Math.hypot(b.x - a.x, b.y - a.y)),
          rotation: Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 18000) / Math.PI) / 100,
        })),
      )
    } else if (g.tipo === 'criar') {
      if (!g.id && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < LIMIAR) return
      criarArrastando(g, paraMundo(e.clientX, e.clientY), e)
    }
  }

  const criarArrastando = (g, p, e) => {
    const origem = origemDe(g.destino?.id ?? null)
    let campos
    if (g.ferramenta === 'line') {
      const b = pontaPresa(g.p0, p, e.shiftKey)
      campos = {
        x: Math.round(g.p0.x - origem.x),
        y: Math.round(g.p0.y - origem.y),
        w: Math.round(Math.hypot(b.x - g.p0.x, b.y - g.p0.y)),
        rotation: Math.round((Math.atan2(b.y - g.p0.y, b.x - g.p0.x) * 18000) / Math.PI) / 100,
      }
    } else {
      let w = Math.abs(p.x - g.p0.x)
      let h = Math.abs(p.y - g.p0.y)
      if (e.shiftKey) w = h = Math.max(w, h)
      const sx = p.x < g.p0.x ? -1 : 1
      const sy = p.y < g.p0.y ? -1 : 1
      let x = sx > 0 ? g.p0.x : g.p0.x - w
      let y = sy > 0 ? g.p0.y : g.p0.y - h
      if (e.altKey) {
        x = g.p0.x - w
        y = g.p0.y - h
        w *= 2
        h *= 2
      }
      campos = { x: Math.round(x - origem.x), y: Math.round(y - origem.y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) }
      if (g.ferramenta === 'text') campos.autoSize = 'fixed'
    }
    if (!g.id) {
      const tipo = g.ferramenta
      const camada = novaCamada(tipo, { ...(tipo === 'text' ? {} : { name: nomeLivre(camadas, nomeDoTipo(tipo)) }), ...campos })
      g.id = camada.id
      mudarCamadas((l) => inserir(l, g.destino?.id ?? null, camada))
      setSelecao([camada.id])
    } else {
      mudarCamadas((l) => atualizar(l, g.id, (c) => ({ ...c, ...campos })))
    }
  }

  const aoSoltar = (e) => {
    dedosRef.current.delete(e.pointerId)
    if (gestoRef.current?.tipo === 'pinca') {
      if (dedosRef.current.size < 2) gestoRef.current = null
      return
    }
    const g = gestoRef.current
    gestoRef.current = null
    setVisual(null)
    if (!g) return
    if (areaRef.current?.hasPointerCapture?.(e.pointerId)) areaRef.current.releasePointerCapture(e.pointerId)
    if (g.tipo === 'mover') soltarMover(g)
    else if (g.tipo === 'redim' || g.tipo === 'girar' || g.tipo === 'ponta') commitar(dataRef.current)
    else if (g.tipo === 'criar') {
      if (!g.id) {
        // Clique sem arraste: tamanho padrão no ponto (texto: começa a digitar ali).
        const origem = origemDe(g.destino?.id ?? null)
        const tipo = g.ferramenta
        const camada = novaCamada(tipo, {
          ...(tipo === 'text' ? {} : { name: nomeLivre(camadas, nomeDoTipo(tipo)) }),
          x: Math.round(g.p0.x - origem.x),
          y: Math.round(g.p0.y - origem.y - (tipo === 'text' ? 10 : 0)),
        })
        g.id = camada.id
        mudarCamadas((l) => inserir(l, g.destino?.id ?? null, camada), { commit: tipo !== 'text' })
        setSelecao([camada.id])
      } else if (g.ferramenta !== 'text') commitar(dataRef.current)
      if (g.ferramenta === 'text') {
        novoTextoRef.current = g.id
        setEditando(g.id)
      }
      setFerramenta('move')
    }
  }

  /** A camada com o tamanho novo: texto e auto layout deixam de se ajustar sozinhos no eixo puxado. */
  function ajustarTamanho(orig, r) {
    const novo = { ...orig, ...r }
    if (orig.type === 'line') novo.h = 0
    if (orig.type === 'text') {
      if (r.h !== orig.h) novo.autoSize = 'fixed'
      else if (r.w !== orig.w && orig.autoSize === 'width') novo.autoSize = 'height'
    }
    if (orig.sizing) {
      novo.sizing = {
        ...orig.sizing,
        ...(r.w !== orig.w && orig.sizing.h !== 'fixed' ? { h: 'fixed' } : {}),
        ...(r.h !== orig.h && orig.sizing.v !== 'fixed' ? { v: 'fixed' } : {}),
      }
    }
    return redimensionarFilhos(novo, orig)
  }

  /** O duplo clique ou duplo toque num ponto: renomear o frame, editar o texto ou entrar no grupo. */
  const duploNoPonto = (x, y, alvoEl) => {
    if (somenteLeitura || ferramenta !== 'move') return
    const rotulo = alvoEl?.closest?.('[data-rotulo]')?.dataset.rotulo
    if (rotulo) {
      // O nome do frame se renomeia na lista de camadas (que na gaveta abre aqui).
      setPainel('camadas')
      setRenomeando(rotulo)
      return
    }
    // Pelo ponto, e não pelo `e.target`: com o ponteiro capturado pelo quadro
    // no pointerdown, o navegador entrega o dblclick ao próprio quadro.
    const sob = document.elementsFromPoint(x, y).find((el) => el.closest?.('[data-camada]') && palcoRef.current?.contains(el))
    const caminho = caminhoDoAlvo(sob)
    if (!caminho.length) return
    const funda = caminho.at(-1)
    const pai = caminho.at(-2)
    if (funda.type === 'text' && !funda.locked && (selecao.includes(funda.id) || (pai && selecao.includes(pai.id)) || caminho.length <= 2)) {
      setSelecao([funda.id])
      setEditando(funda.id)
      return
    }
    // Entra um nível no grupo ou frame selecionado.
    const i = caminho.findIndex((c) => selecao.includes(c.id))
    if (i >= 0 && i < caminho.length - 1) setSelecao([caminho[i + 1].id])
  }

  /**
   * Duplo toque feito à mão: o `dblclick` não vem em todo celular (o Safari do
   * iPhone só o dispara com `touch-action: manipulation`, e aqui é `none`), e
   * sem ele não havia como editar um texto sem teclado. O `dblclick` nativo,
   * quando vem, chega logo depois e é ignorado.
   */
  const toqueAnteriorRef = useRef(null)
  const duploToqueEmRef = useRef(0)
  const aoDuploClique = (e) => {
    if (performance.now() - duploToqueEmRef.current < 600) return
    duploNoPonto(e.clientX, e.clientY, e.target)
  }
  /* ------------------------------------------------------------------ */
  /* Arrastar no palco: o translate vai direto no DOM                   */
  /* ------------------------------------------------------------------ */
  const transladadosRef = useRef([])
  useLayoutEffect(() => {
    for (const el of transladadosRef.current) el.style.translate = ''
    transladadosRef.current = []
    if (visual?.tipo !== 'mover' || !palcoRef.current) return
    for (const id of visual.ids) {
      const el = palcoRef.current.querySelector(`[data-camada="${CSS.escape(id)}"]`)
      if (!el) continue
      el.style.translate = `${visual.dx}px ${visual.dy}px`
      transladadosRef.current.push(el)
    }
  }, [visual])

  /* ------------------------------------------------------------------ */
  /* Menu do botão direito                                              */
  /* ------------------------------------------------------------------ */
  const { menu, openMenu, closeMenu } = useContextMenu()
  const exportar = async ({ formato = 'png', escala = 1 } = {}) => {
    const lista = pacoteDaSelecao()
    if (!lista.length) return
    const nome = `${(lista.length === 1 ? nomeDaCamada(lista[0]) : t('Seleção')).replace(/[/\\?%*:|"<>]/g, '_')}${escala !== 1 && formato !== 'svg' ? `@${escala}x` : ''}.${formato}`
    const { exportarCamadas } = await import('./exportar')
    baixar(nome, () => exportarCamadas(lista, { formato, escala }))
  }

  const itensDoMenu = () => {
    if (somenteLeitura) {
      return [
        { label: t('Copiar'), icon: Copy, atalho: 'Ctrl+C', disabled: !selecao.length, onClick: () => document.execCommand('copy') },
        { label: t('Copiar CSS'), icon: Code2, disabled: selecao.length !== 1, onClick: () => copiarTexto(cssDaCamada(acharCamada(camadas, selecao[0]), paiDe(camadas, selecao[0]))) },
        { label: t('Enquadrar tudo'), icon: Maximize, atalho: 'Shift+1', onClick: () => zoomPara('tudo') },
      ]
    }
    if (!selecao.length) {
      return [
        { label: t('Colar'), icon: ClipboardPaste, atalho: 'Ctrl+V', disabled: !areaDeTransferenciaRef.current, onClick: () => colarCamadas(areaDeTransferenciaRef.current) },
        { label: t('Selecionar tudo'), atalho: 'Ctrl+A', onClick: selecionarTudo },
        { label: t('Enquadrar tudo'), icon: Maximize, atalho: 'Shift+1', onClick: () => zoomPara('tudo') },
      ]
    }
    const todas = selecao.map((id) => acharCamada(camadas, id))
    const ocultas = todas.some((c) => c.visible === false)
    const travadas = todas.every((c) => c.locked)
    return [
      { label: t('Copiar'), icon: Copy, atalho: 'Ctrl+C', onClick: () => document.execCommand('copy') },
      { label: t('Recortar'), icon: Scissors, atalho: 'Ctrl+X', onClick: () => document.execCommand('cut') },
      { label: t('Colar'), icon: ClipboardPaste, atalho: 'Ctrl+V', disabled: !areaDeTransferenciaRef.current, onClick: () => colarCamadas(areaDeTransferenciaRef.current) },
      { label: t('Duplicar'), icon: CopyPlus, atalho: 'Ctrl+D', onClick: duplicarSelecao },
      { label: t('Excluir'), icon: Trash2, atalho: 'Del', danger: true, onClick: removerSelecao },
      { separator: true },
      { label: t('Trazer para frente'), icon: ArrowUpToLine, atalho: 'Ctrl+]', onClick: () => mudarCamadas((l) => reordenar(l, selecao, 'frente'), { commit: true }) },
      { label: t('Trazer para o topo'), atalho: 'Ctrl+Shift+]', onClick: () => mudarCamadas((l) => reordenar(l, selecao, 'topo'), { commit: true }) },
      { label: t('Enviar para trás'), icon: ArrowDownToLine, atalho: 'Ctrl+[', onClick: () => mudarCamadas((l) => reordenar(l, selecao, 'tras'), { commit: true }) },
      { label: t('Enviar para o fundo'), atalho: 'Ctrl+Shift+[', onClick: () => mudarCamadas((l) => reordenar(l, selecao, 'fundo'), { commit: true }) },
      { separator: true },
      { label: t('Agrupar'), icon: Group, atalho: 'Ctrl+G', onClick: () => agruparSelecao('group') },
      { label: t('Desagrupar'), icon: Ungroup, atalho: 'Ctrl+Shift+G', disabled: !todas.some((c) => c.children), onClick: desagruparSelecao },
      { label: t('Criar frame com a seleção'), icon: Frame, atalho: 'Ctrl+Alt+G', onClick: () => agruparSelecao('frame') },
      { label: t('Adicionar auto layout'), icon: Columns3, atalho: 'Shift+A', onClick: adicionarAutoLayout },
      { separator: true },
      { label: ocultas ? t('Mostrar') : t('Ocultar'), icon: ocultas ? Eye : EyeOff, atalho: 'Ctrl+Shift+H', onClick: () => alternar(selecao, 'visible') },
      { label: travadas ? t('Destravar') : t('Travar'), icon: travadas ? Unlock : Lock, atalho: 'Ctrl+Shift+L', onClick: () => alternar(selecao, 'locked') },
      { separator: true },
      { label: t('Copiar CSS'), icon: Code2, disabled: selecao.length !== 1, onClick: () => copiarTexto(cssDaCamada(todas[0], paiDe(camadas, todas[0].id))) },
      { label: t('Exportar PNG'), icon: Download, onClick: () => exportar({ formato: 'png', escala: 2 }) },
      { label: t('Enquadrar seleção'), icon: SquareDashed, atalho: 'Shift+2', onClick: () => zoomPara('selecao') },
    ]
  }

  /* ------------------------------------------------------------------ */
  /* Páginas                                                            */
  /* ------------------------------------------------------------------ */
  const irParaPagina = (id) => {
    if (id === pagina.id) return
    setPaginaId(id)
    setSelecao([])
    setHover(null)
    setVista(dataRef.current.viewport?.[id] ?? null)
  }

  const acoesDePagina = {
    onNovaPagina: () => {
      const nova = novaPagina(doc.pages.length + 1)
      mudarDoc((d) => ({ ...d, pages: [...d.pages, nova] }), { commit: true })
      irParaPagina(nova.id)
    },
    onRenomearPagina: (id, nome) => mudarDoc((d) => ({ ...d, pages: d.pages.map((p) => (p.id === id ? { ...p, name: nome } : p)) }), { commit: true }),
    onDuplicarPagina: (id) => {
      const origem = doc.pages.find((p) => p.id === id)
      const copia = { ...novaPagina(1), name: t('{nome} (cópia)', { nome: origem.name }), background: origem.background ?? null, children: origem.children.map(clonar) }
      mudarDoc((d) => {
        const i = d.pages.findIndex((p) => p.id === id)
        return { ...d, pages: [...d.pages.slice(0, i + 1), copia, ...d.pages.slice(i + 1)] }
      }, { commit: true })
      irParaPagina(copia.id)
    },
    onExcluirPagina: (id) => {
      if (doc.pages.length < 2) return
      const i = doc.pages.findIndex((p) => p.id === id)
      const vizinha = doc.pages[i + 1] ?? doc.pages[i - 1]
      mudarDoc((d) => {
        const { [id]: _, ...vistas } = d.viewport ?? {}
        return { ...d, pages: d.pages.filter((p) => p.id !== id), viewport: vistas }
      }, { commit: true })
      if (id === pagina.id) irParaPagina(vizinha.id)
    },
  }

  /* ------------------------------------------------------------------ */
  /* Painéis                                                            */
  /* ------------------------------------------------------------------ */

  const itens = selecao.map((id) => {
    const caminho = caminhoAte(camadas, id)
    return { camada: caminho.at(-1), pai: caminho.at(-2) ?? null }
  })

  const editarSelecao = (fn) => {
    mudarCamadas((l) => selecao.reduce((acc, id) => atualizar(acc, id, fn), l))
    commitAdiado()
  }

  const acoesDoPainel = {
    alinhar: alinharSelecao,
    distribuir: distribuirSelecao,
    autoLayout: adicionarAutoLayout,
    escolherImagem,
    exportar,
    mover: (campos) => editarSelecao((c) => ({ ...c, ...campos })),
    redimensionar: (fn) => editarSelecao((c) => redimensionarFilhos({ ...c, ...fn(c) }, c)),
    fundoDaPagina: (cor) => {
      mudarDoc((d) => ({ ...d, pages: d.pages.map((p) => (p.id === pagina.id ? { ...p, background: cor } : p)) }))
      commitAdiado()
    },
    criarFrame: (preset) => {
      const direita = camadas.length ? Math.max(...camadas.map((c) => c.x + c.w)) + 100 : null
      const meio = centroDaVista()
      const frame = novaCamada('frame', {
        name: preset.nome,
        x: Math.round(direita ?? meio.x - preset.w / 2),
        y: Math.round(camadas.length ? Math.min(...camadas.map((c) => c.y)) : meio.y - preset.h / 2),
        w: preset.w,
        h: preset.h,
      })
      mudarCamadas((l) => inserir(l, null, frame), { commit: true })
      setSelecao([frame.id])
      setFerramenta('move')
      setVista(enquadrar([frame], 1))
    },
  }

  const zoom = vista?.zoom ?? 1
  const cursor = visual?.tipo === 'pan' ? 'grabbing' : ferramenta === 'hand' || espaco ? 'grab' : ferramenta === 'text' ? 'text' : ferramenta !== 'move' ? 'crosshair' : 'default'

  return (
    <div ref={raizRef} className="relative flex min-h-0 flex-1">
      {/* Camadas: coluna fixa no computador, gaveta no celular. */}
      <aside
        className={cn(
          'z-20 w-60 shrink-0 border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950',
          compacto && (painel === 'camadas' ? 'absolute inset-y-0 left-0 shadow-pop' : 'hidden'),
        )}
      >
        <PainelDeCamadas
          paginas={doc.pages}
          paginaId={pagina.id}
          onPagina={irParaPagina}
          {...acoesDePagina}
          camadas={camadas}
          selecao={selecao}
          onSelecionar={(id, { somar }) => setSelecao((s) => (somar ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]))}
          hover={hover}
          onHover={setHover}
          onAlternar={(id, campo) => alternar([id], campo)}
          onRenomear={(id, nome) => mudarCamadas((l) => atualizar(l, id, (c) => ({ ...c, name: nome })), { commit: true })}
          renomeando={renomeando}
          onRenomeando={setRenomeando}
          onSoltar={(ids, alvoId, posicao) =>
            mudarCamadas(
              (l) => {
                if (posicao === 'dentro') return moverPara(l, ids, alvoId)
                const pai = paiDe(l, alvoId)
                const irmas = (pai ? pai.children : l).filter((c) => !ids.includes(c.id))
                const i = irmas.findIndex((c) => c.id === alvoId)
                return moverPara(l, ids, pai?.id ?? null, posicao === 'acima' ? i + 1 : i)
              },
              { commit: true },
            )
          }
          somenteLeitura={somenteLeitura}
        />
      </aside>

      <div
        ref={areaRef}
        // `select-none`: sem ele o arraste selecionava o texto da tela, e
        // arrastar de novo sobre a seleção virava um arrastar-e-soltar nativo
        // do navegador, que cancela o ponteiro no meio do gesto.
        className={cn('relative min-w-0 flex-1 touch-none select-none overflow-hidden outline-none', !pagina.background && 'bg-ink-100 dark:bg-ink-900')}
        style={{ cursor, ...(pagina.background ? { background: pagina.background } : {}) }}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onPointerLeave={() => !gestoRef.current && setHover(null)}
        onDoubleClick={aoDuploClique}
        onContextMenu={(e) => openMenu(e, null)}
        onDragOver={(e) => {
          if (!somenteLeitura && e.dataTransfer.types.includes('Files')) e.preventDefault()
        }}
        onDrop={(e) => {
          const arquivos = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
          if (!arquivos.length) return
          e.preventDefault()
          adicionarImagens(arquivos, paraMundo(e.clientX, e.clientY))
        }}
      >
        <div
          ref={palcoRef}
          className="absolute left-0 top-0"
          style={{ ...BASE_DO_PALCO, transform: `translate(${vista?.x ?? 0}px, ${vista?.y ?? 0}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <CamadasDaPagina camadas={camadas} />
        </div>
        {vista && (
          <Sobreposicao camadas={camadas} selecao={selecao} hover={hover} vista={vista} visual={visual} editando={editando} somenteLeitura={somenteLeitura} />
        )}
        {!camadas.length && !somenteLeitura && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-xs rounded-lg border border-dashed border-ink-300 bg-white/70 p-5 text-center text-sm text-ink-500 backdrop-blur dark:border-ink-700 dark:bg-ink-900/70 dark:text-ink-400">
              <p className="mb-1 font-medium text-ink-700 dark:text-ink-200">{t('Página vazia')}</p>
              <p className="text-xs leading-relaxed">
                {compacto
                  ? t('Toque em Frame na barra de baixo e escolha um tamanho de tela, ou arraste no quadro para desenhar um frame.')
                  : t('Aperte F e escolha um tamanho de tela à direita, ou arraste no quadro para desenhar um frame.')}
              </p>
            </div>
          </div>
        )}
        <BarraDeFerramentas
          ferramenta={ferramenta}
          onFerramenta={escolherFerramenta}
          compacto={compacto}
          onImagens={(arquivos) => adicionarImagens(arquivos)}
          zoom={zoom}
          onZoom={zoomPara}
          somenteLeitura={somenteLeitura}
          onPainel={(qual) => setPainel((p) => (p === qual ? null : qual))}
        />
      </div>

      <aside
        className={cn(
          'z-20 w-64 shrink-0 border-l border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950',
          compacto && (painel === 'propriedades' ? 'absolute inset-y-0 right-0 shadow-pop' : 'hidden'),
        )}
      >
        <PainelDePropriedades itens={itens} editar={editarSelecao} acoes={acoesDoPainel} pagina={pagina} ferramenta={ferramenta} somenteLeitura={somenteLeitura} />
      </aside>

      <input
        ref={imagemRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const arquivo = e.target.files?.[0]
          e.target.value = ''
          const aoEscolher = trocaDeImagemRef.current
          trocaDeImagemRef.current = null
          if (!arquivo || !aoEscolher) return
          try {
            aoEscolher(await enviarImagem(arquivo))
          } catch (erro) {
            onError?.(extractError(erro))
          }
        }}
      />

      <ContextMenu open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={closeMenu} items={menu ? itensDoMenu() : []} />
    </div>
  )
}

import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'
import { EyeOff, LayoutGrid, Plus } from 'lucide-react'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { ALTURA_MAX, ALTURA_MIN, BLOCOS, LARGURA_MIN, alinhar, posicionar } from '@/lib/inicio'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * O que cada bloco recebe da página: o cabeçalho que arrasta e a alça que
 * responde ao teclado. Por contexto, e não por prop, porque os blocos
 * (tarefas, agenda, rascunho...) são componentes próprios que só desenham
 * um `<Bloco>` — passar isso por cada um deles seria encanamento puro.
 */
const ContextoDoBloco = createContext(null)
export const useBlocoDaGrade = () => useContext(ContextoDoBloco)

//: Abaixo desta largura (celular, janela estreita) os blocos ficam um
//: embaixo do outro: espalhados, não caberiam lado a lado.
const LARGURA_LIVRE = 640
//: Quanto o mouse anda antes de o aperto virar arraste — abaixo disso é clique.
const LIMIAR = 5
//: No toque, segurar parado por este tempo pega o bloco, como os ícones
//: do celular. Mexer o dedo antes disso é rolar a página.
const SEGURAR_MS = 350
const TOLERANCIA_DO_TOQUE = 8
//: Faixa perto da borda de cima e de baixo onde segurar um bloco rola a página.
const BORDA_QUE_ROLA = 64
//: Espaço livre embaixo dos blocos enquanto se arrasta, para levar um bloco mais para baixo.
const FOLGA_DO_ARRASTE = 320

/** O contêiner que rola a página em volta do Início. */
function rolavelDe(el) {
  for (let atual = el?.parentElement; atual; atual = atual.parentElement) {
    const { overflowY } = getComputedStyle(atual)
    if ((overflowY === 'auto' || overflowY === 'scroll') && atual.scrollHeight > atual.clientHeight) return atual
  }
  return document.scrollingElement
}

const prender = (n, min, max) => Math.min(max, Math.max(min, n))
const vibrar = (ms) => navigator.vibrate?.(ms)
//: Teto da altura de partida: uma lista longa não vira um bloco de tela inteira.
const ALTURA_DE_PARTIDA_MAX = 560

/** A altura que o conteúdo do bloco pede, sem a altura fixa (lida e devolvida no mesmo quadro). */
function alturaNatural(el) {
  const antes = el.style.height
  el.style.height = 'auto'
  const altura = el.offsetHeight
  el.style.height = antes
  return altura
}

/**
 * O Início como uma mesa: cada bloco vai para onde for posto e tem o
 * tamanho que for puxado — como os ícones na tela do celular, só que com
 * tamanho livre.
 *
 * - **Mover**: com o mouse, arrastar pelo título; no toque, segurar o
 *   título até o bloco "subir" e então arrastar. O bloco fica preso ao
 *   ponto onde foi pego. Esc devolve.
 * - **Tamanho**: a borda direita, a de baixo ou o canto. Duplo clique no
 *   canto ajusta a altura ao conteúdo.
 * - **Alinhar**: perto da borda ou do centro de outro bloco (ou do meio da
 *   página), o bloco gruda e uma guia aparece, como nos editores de slide;
 *   perto do vão padrão até o vizinho, também. Alt segura solto, sem grudar.
 * - **Teclado**: na alça do título, setas movem (Alt: de 1 em 1 px) e
 *   Shift+setas mudam o tamanho.
 *
 * O bloco mexido por último fica por cima. Tudo vai para a conta
 * (`onMudar`) quando o gesto termina.
 */
export default function GradeDoInicio({ blocos, renderizar, onMudar }) {
  const telaRef = useRef(null)
  const elementos = useRef(new Map())
  const [largura, setLargura] = useState(0)
  //: Gesto em curso: `{ id, ret (px), guias, tipo }`.
  const [gesto, setGesto] = useState(null)
  const gestoRef = useRef(null)
  const { menu, openMenu, closeMenu } = useContextMenu()

  // A largura da página: o Início acompanha a janela. Medida no layout
  // (o observador sozinho não roda com a janela fora da tela).
  useLayoutEffect(() => {
    const el = telaRef.current
    if (!el) return undefined
    const medir = () => setLargura(el.clientWidth)
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  // Quem ainda não tem posição (o Início de antes) parte da altura do
  // próprio conteúdo, como era na grade: medida aqui, a cada desenho, até
  // a pessoa mexer em algo e a posição ir para a conta.
  const [naturais, setNaturais] = useState({})
  const semPosicao = blocos.filter((b) => b.visivel && !Number.isFinite(b.x)).map((b) => b.id)
  useLayoutEffect(() => {
    if (!semPosicao.length) return
    let mudou = false
    const proximas = { ...naturais }
    for (const id of semPosicao) {
      const el = elementos.current.get(id)
      if (!el) continue
      const altura = prender(alturaNatural(el), ALTURA_MIN, ALTURA_DE_PARTIDA_MAX)
      if (proximas[id] !== altura) {
        proximas[id] = altura
        mudou = true
      }
    }
    if (mudou) setNaturais(proximas)
  })

  const W = largura
  const livre = W >= LARGURA_LIVRE
  const medidos = blocos.map((b) => (naturais[b.id] && !Number.isFinite(b.x) ? { ...b, altura: naturais[b.id] } : b))
  const comPosicao = W ? posicionar(medidos, W) : medidos
  const visiveis = comPosicao.filter((b) => b.visivel)
  const escondidos = comPosicao.filter((b) => !b.visivel)
  const emPx = (b) => ({ x: (b.x / 100) * W, y: b.y, w: (b.w / 100) * W, h: b.h })

  // Os gestos vivem em listeners da janela, criados no começo do gesto: o
  // que eles leem no fim tem de ser o de AGORA, não o daquele render.
  const atualRef = useRef(null)
  atualRef.current = { blocos, comPosicao, onMudar, W }

  /** Grava a posição (em px) de um bloco, que passa a ficar por cima dos outros. */
  const gravar = (id, ret) => {
    const { comPosicao: todos, onMudar: aoMudar, W: largo } = atualRef.current
    const pct = (px) => (px / largo) * 100
    const bloco = todos.find((b) => b.id === id)
    if (!bloco) return
    aoMudar([...todos.filter((b) => b.id !== id), { ...bloco, x: pct(ret.x), y: ret.y, w: pct(ret.w), h: ret.h }])
  }

  /* ---------------------------------------------------------------- */
  /* Gestos: mover e redimensionar                                    */
  /* ---------------------------------------------------------------- */

  /** O retângulo que o gesto pede agora, já preso à página e encaixado. */
  const calcular = (g, x, y, soltoDoEncaixe) => {
    const largo = atualRef.current.W
    const dx = x - g.x0
    const dy = y - g.y0 + (g.rolavel.scrollTop - g.scroll0)
    const r = { ...g.inicio }
    const minimo = (LARGURA_MIN / 100) * largo
    if (g.tipo === 'mover') {
      r.x = prender(r.x + dx, 0, largo - r.w)
      r.y = Math.max(0, r.y + dy)
    } else {
      if (g.alca.includes('x')) r.w = prender(r.w + dx, minimo, largo - r.x)
      if (g.alca.includes('y')) r.h = prender(r.h + dy, ALTURA_MIN, ALTURA_MAX)
    }
    if (soltoDoEncaixe) return { ret: r, guias: [] }

    const encaixe = alinhar(r, g.outros, largo, { modo: g.tipo === 'mover' ? 'mover' : 'tamanho' })
    const final = encaixe.ret
    let guias = encaixe.guias
    // Puxando só uma borda, a outra dimensão não pode grudar em nada.
    if (g.tipo === 'tamanho') {
      if (!g.alca.includes('x')) {
        final.w = r.w
        guias = guias.filter((gu) => gu.eixo !== 'x')
      }
      if (!g.alca.includes('y')) {
        final.h = r.h
        guias = guias.filter((gu) => gu.eixo !== 'y')
      }
      final.w = prender(final.w, minimo, largo - final.x)
      final.h = prender(final.h, ALTURA_MIN, ALTURA_MAX)
    } else {
      final.x = prender(final.x, 0, largo - final.w)
      final.y = Math.max(0, final.y)
    }
    return { ret: final, guias }
  }

  const atualizar = (g) => {
    const { ret, guias } = calcular(g, g.x, g.y, g.alt)
    // Um toque no dedo quando o bloco gruda: o encaixe se sente, não só se vê.
    if (g.toque && guias.length && !g.grudado) vibrar(5)
    g.grudado = guias.length > 0
    g.ret = ret
    setGesto({ id: g.id, tipo: g.tipo, ret, guias })
  }

  /** Perto da borda de cima ou de baixo, rola — mais rápido quanto mais perto. */
  function rolarNaBorda() {
    const g = gestoRef.current
    if (!g?.ativo) return
    const caixa =
      g.rolavel === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : g.rolavel.getBoundingClientRect()
    let passo = 0
    if (g.y < caixa.top + BORDA_QUE_ROLA) passo = -(caixa.top + BORDA_QUE_ROLA - g.y)
    else if (g.y > caixa.bottom - BORDA_QUE_ROLA) passo = g.y - (caixa.bottom - BORDA_QUE_ROLA)
    if (passo) {
      g.rolavel.scrollTop += Math.round(passo / 4)
      atualizar(g)
    }
    g.quadro = requestAnimationFrame(rolarNaBorda)
  }

  const ativar = (g) => {
    g.ativo = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = g.tipo === 'mover' ? 'grabbing' : g.cursor
    if (g.toque) vibrar(10)
    atualizar(g)
    g.quadro = requestAnimationFrame(rolarNaBorda)
  }

  function aoMover(e) {
    const g = gestoRef.current
    if (!g) return
    g.x = e.clientX
    g.y = e.clientY
    g.alt = e.altKey
    if (!g.ativo) {
      const andou = Math.hypot(e.clientX - g.x0, e.clientY - g.y0)
      // No toque, andar antes de segurar o tempo todo é rolar a página.
      if (g.toque) {
        if (andou > TOLERANCIA_DO_TOQUE) encerrar(true)
        return
      }
      if (andou < LIMIAR) return
      ativar(g)
      return
    }
    atualizar(g)
  }

  // Com o bloco no dedo, a página não pode rolar junto (o arraste é dele).
  function prenderToque(e) {
    if (gestoRef.current?.ativo) e.preventDefault()
  }

  function encerrar(cancelado) {
    const g = gestoRef.current
    if (!g) return
    clearTimeout(g.timer)
    if (g.quadro) cancelAnimationFrame(g.quadro)
    window.removeEventListener('pointermove', aoMover)
    window.removeEventListener('pointerup', aoSoltar)
    window.removeEventListener('pointercancel', aoCancelar)
    window.removeEventListener('keydown', aoTeclar)
    window.removeEventListener('touchmove', prenderToque)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    gestoRef.current = null
    setGesto(null)
    if (!cancelado && g.ativo && g.ret) gravar(g.id, g.ret)
  }

  function aoSoltar() {
    encerrar(false)
  }
  function aoCancelar() {
    encerrar(true)
  }
  function aoTeclar(e) {
    if (e.key === 'Escape') encerrar(true)
  }

  const comecar = (id, e, { tipo, alca = '', cursor = '' }) => {
    if (gestoRef.current || !atualRef.current.W) return
    const bloco = atualRef.current.comPosicao.find((b) => b.id === id)
    if (!bloco) return
    const rolavel = rolavelDe(telaRef.current)
    const g = {
      id,
      tipo,
      alca,
      cursor,
      inicio: emPx(bloco),
      outros: atualRef.current.comPosicao.filter((b) => b.visivel && b.id !== id).map(emPx),
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      rolavel,
      scroll0: rolavel.scrollTop,
      toque: e.pointerType !== 'mouse',
      ativo: false,
    }
    gestoRef.current = g
    window.addEventListener('pointermove', aoMover)
    window.addEventListener('pointerup', aoSoltar)
    window.addEventListener('pointercancel', aoCancelar)
    window.addEventListener('keydown', aoTeclar)
    window.addEventListener('touchmove', prenderToque, { passive: false })
    // Redimensionar começa na hora; mover no toque espera o dedo segurar.
    if (tipo === 'tamanho') ativar(g)
    else if (g.toque) g.timer = setTimeout(() => gestoRef.current === g && ativar(g), SEGURAR_MS)
  }

  /** Aperto no título do bloco: pode virar arraste. */
  const apertarCabecalho = (id, e) => {
    if (!livre || e.button !== 0) return
    const naAlca = !!e.target.closest('[data-alca-do-bloco]')
    // Abas, botões e links do cabeçalho continuam sendo deles.
    if (!naAlca && e.target.closest('button, a, input, select, textarea, [role="tab"]')) return
    comecar(id, e, { tipo: 'mover' })
  }

  const puxarBorda = (id, alca, cursor) => (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    comecar(id, e, { tipo: 'tamanho', alca, cursor })
  }

  /** Setas na alça movem (Alt: de 1 em 1 px); Shift+setas mudam o tamanho. */
  const teclarNaAlca = (id, e) => {
    const direcao = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]
    if (!direcao || !livre) return
    e.preventDefault()
    const bloco = atualRef.current.comPosicao.find((b) => b.id === id)
    if (!bloco) return
    const passo = e.altKey ? 1 : 8
    const r = emPx(bloco)
    if (e.shiftKey) {
      r.w = prender(r.w + direcao[0] * passo, (LARGURA_MIN / 100) * W, W - r.x)
      r.h = prender(r.h + direcao[1] * passo, ALTURA_MIN, ALTURA_MAX)
    } else {
      r.x = prender(r.x + direcao[0] * passo, 0, W - r.w)
      r.y = Math.max(0, r.y + direcao[1] * passo)
    }
    gravar(id, r)
  }

  /** Duplo clique no canto: a altura volta a ser a do conteúdo. */
  const ajustarAoConteudo = (id) => {
    const el = elementos.current.get(id)
    const bloco = atualRef.current.comPosicao.find((b) => b.id === id)
    if (!el || !bloco) return
    gravar(id, { ...emPx(bloco), h: prender(alturaNatural(el), ALTURA_MIN, ALTURA_MAX) })
  }

  const esconder = (id) => onMudar(comPosicao.map((b) => (b.id === id ? { ...b, visivel: false } : b)))

  /** Bloco escondido volta embaixo de tudo, onde se vê que ele chegou. */
  const mostrar = (ids) => {
    const voltando = new Set(ids)
    const semPosicao = ({ x: _x, y: _y, w: _w, h: _h, ...resto }) => resto
    onMudar(comPosicao.map((b) => (voltando.has(b.id) ? { ...semPosicao(b), visivel: true } : b)))
  }

  /**
   * Arrumar: os blocos voltam a encaixar um ao lado do outro, sem buraco
   * nem sobreposição, na ordem de cima para baixo e com a largura que cada
   * um tinha — a saída para uma mesa que ficou bagunçada.
   */
  const arrumar = () => {
    const ordem = [...visiveis].sort((a, b) => a.y - b.y || a.x - b.x)
    const limpos = ordem.map((b) => ({
      id: b.id,
      visivel: true,
      colunas: Math.round(prender((b.w / 100) * 12, 3, 12)),
      altura: Math.round(b.h),
    }))
    onMudar(posicionar([...limpos, ...escondidos], W))
  }

  /* ---------------------------------------------------------------- */

  const fundo = Math.max(0, ...visiveis.map((b) => b.y + b.h))
  const empilhados = [...visiveis].sort((a, b) => a.y - b.y || a.x - b.x)

  const bordas = (id) =>
    livre && (
      <>
        <span
          aria-hidden
          onPointerDown={puxarBorda(id, 'x', 'ew-resize')}
          className="absolute -right-1 top-3 bottom-3 z-10 w-2 cursor-ew-resize touch-none"
        />
        <span
          aria-hidden
          onPointerDown={puxarBorda(id, 'y', 'ns-resize')}
          className="absolute -bottom-1 left-3 right-3 z-10 h-2 cursor-ns-resize touch-none"
        />
        <span
          onPointerDown={puxarBorda(id, 'xy', 'nwse-resize')}
          onDoubleClick={() => ajustarAoConteudo(id)}
          title={t('Arraste para mudar o tamanho · duplo clique ajusta a altura ao conteúdo')}
          className="absolute bottom-0 right-0 z-20 flex h-5 w-5 cursor-nwse-resize touch-none items-end justify-end p-1 text-ink-300 opacity-0 transition hover:text-accent-600 group-hover/bloco:opacity-100 dark:text-ink-600 [@media(hover:none)]:opacity-100"
        >
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
            <path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </svg>
        </span>
      </>
    )

  return (
    <>
      <div
        ref={telaRef}
        className={cn('relative', !livre && 'flex flex-col gap-4')}
        style={livre ? { height: fundo + (gesto ? FOLGA_DO_ARRASTE : 0) } : undefined}
      >
        {(livre ? visiveis : empilhados).map((b) => {
          const noGesto = gesto?.id === b.id
          const r = noGesto ? gesto.ret : null
          return (
            <div
              key={b.id}
              data-bloco-id={b.id}
              ref={(el) => (el ? elementos.current.set(b.id, el) : elementos.current.delete(b.id))}
              style={
                livre
                  ? r
                    ? { left: r.x, top: r.y, width: r.w, height: r.h }
                    : { left: `${b.x}%`, top: b.y, width: `${b.w}%`, height: b.h }
                  : undefined
              }
              className={cn(
                'group/bloco min-w-0',
                livre && 'absolute',
                // O bloco "sobe" quando é pego, como o ícone no celular.
                noGesto &&
                  'z-40 rounded-lg shadow-pop ring-2 ring-accent-400/70 [transform:scale(1.01)] motion-reduce:[transform:none]',
              )}
            >
              <ContextoDoBloco.Provider
                value={
                  livre ? { apertarCabecalho: (e) => apertarCabecalho(b.id, e), teclarNaAlca: (e) => teclarNaAlca(b.id, e) } : null
                }
              >
                {renderizar(b)}
              </ContextoDoBloco.Provider>

              {/* Esconder: no canto, só ao passar o mouse — no toque, sempre. */}
              <button
                type="button"
                onClick={() => esconder(b.id)}
                title={t('Esconder bloco')}
                aria-label={t('Esconder {nome}', { nome: BLOCOS.find((x) => x.id === b.id)?.nome })}
                className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-400 opacity-0 shadow-subtle transition hover:text-ink-700 focus-visible:opacity-100 group-hover/bloco:opacity-100 dark:border-ink-700 dark:bg-ink-900 dark:hover:text-ink-100 [@media(hover:none)]:opacity-100"
              >
                <EyeOff size={12} />
              </button>

              {bordas(b.id)}
            </div>
          )
        })}

        {/* As guias de alinhamento, enquanto um bloco gruda em outro. */}
        {gesto?.guias.map((g, i) =>
          g.eixo === 'x' ? (
            <span
              key={i}
              aria-hidden
              className={cn('pointer-events-none absolute z-50 w-0 border-l border-accent-500', g.vao && 'border-dashed')}
              style={{ left: g.pos, top: g.de, height: Math.max(0, g.ate - g.de) }}
            />
          ) : (
            <span
              key={i}
              aria-hidden
              className={cn('pointer-events-none absolute z-50 h-0 border-t border-accent-500', g.vao && 'border-dashed')}
              style={{ top: g.pos, left: g.de, width: Math.max(0, g.ate - g.de) }}
            />
          ),
        )}
      </div>

      {visiveis.length === 0 && (
        <p className="py-12 text-center text-sm text-ink-400">{t('Todos os blocos estão escondidos.')}</p>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {escondidos.length > 0 && (
          <button
            type="button"
            onClick={(e) => openMenu(e, null)}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-ink-300 px-3 py-1.5 text-xs text-ink-500 transition hover:border-accent-400 hover:text-ink-800 dark:border-ink-700 dark:text-ink-400 dark:hover:text-ink-100"
          >
            <Plus size={13} />
            {escondidos.length === 1
              ? t('Mostrar 1 bloco escondido')
              : t('Mostrar {n} blocos escondidos', { n: escondidos.length })}
          </button>
        )}
        {livre && visiveis.length > 1 && (
          <button
            type="button"
            onClick={arrumar}
            title={t('Encaixa os blocos lado a lado, sem buraco nem sobreposição')}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100"
          >
            <LayoutGrid size={13} />
            {t('Arrumar blocos')}
          </button>
        )}
      </div>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={[
          ...(escondidos.length > 1
            ? [{ label: t('Mostrar todos'), icon: Plus, onClick: () => mostrar(escondidos.map((b) => b.id)) }, { separator: true }]
            : []),
          ...escondidos.map((b) => ({
            label: BLOCOS.find((x) => x.id === b.id)?.nome ?? b.id,
            onClick: () => mostrar([b.id]),
          })),
        ]}
      />
    </>
  )
}

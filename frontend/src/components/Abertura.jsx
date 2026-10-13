import { useEffect, useRef, useState } from 'react'
import { SAIDA_AO_PULAR, caminhoSuave, comoAbrir, geometriaDoF, geometriaDoY, inicioDaSaida, modoDaAbertura, planejarEscrita, quadroDaAbertura } from '@/lib/abertura'

/**
 * A abertura do app: "Note" aparece composto na serifada dos títulos, e uma
 * caneta escreve "fy" na fonte do sistema (a mesma do app), num tom frio
 * tirado da própria cor do "Note".
 *
 * As letras do "fy" são as da fonte, e não um desenho: a caneta só as
 * REVELA, passando uma máscara larga pelo meio de cada traço. Assim o "fy"
 * tem o peso e o desenho da fonte de cada máquina, e no fim, sem máscara,
 * fica exatamente a letra dela.
 *
 * Tudo sai do tema em uso (classes `ink`, que são variáveis CSS): claro,
 * escuro, as paletas e os temas personalizados pintam a abertura sem nenhuma
 * linha a mais aqui. Por isso é SVG desenhado pelo app, e não um vídeo.
 *
 * Cobre o app enquanto ele carrega por baixo e some sozinha em ~3 s — ou
 * quando o app ficar `pronto`, se ele demorar mais: até lá ela segura o
 * nome escrito, em vez de abrir para uma tela vazia. E
 * qualquer clique ou tecla pula para o fim. Com movimento reduzido, o nome
 * só aparece inteiro e some — a não ser que a pessoa tenha escolhido
 * "sempre" em Aparência (`comoAbrir`).
 */

const ENTRE_NOTE_E_FY = 3
/** O "fy" um pouco menor que o "Note": a sans do sistema tem as minúsculas mais altas que a serifada. */
const CORPO_DO_FY = 92
/** Largura da máscara do "y" (e do "f" quando a medição falha): cobre a haste com folga em qualquer fonte. */
const LARGURA_DA_MASCARA = 26
/** No "f" medido, a máscara tem a espessura do traço mais esta folga de cada lado (em unidades). */
const FOLGA_DA_MASCARA = 2
/** A caneta inclinada para a direita, como na mão de quem escreve. */
const ANGULO = 30
/** De onde a caneta vem e para onde volta, a partir da ponta do traço. */
const AFASTAMENTO = { x: 80, y: -72 }
const TAMANHO_DA_CANETA = 1.15
/**
 * A inclinação da caneta é uma mola: o alvo muda com a direção da mão (puxada
 * para a direita, o topo fica para trás) e com a altura (longe do papel, mais
 * deitada), e a mola chega lá com um pouco de balanço. Rígida, ela parecia um
 * adesivo deslizando.
 */
const MOLA = { rigidez: 170, amortecimento: 19 }
/** Quanto a caneta sobe entre um traço e outro (fração do afastamento). */
const ERGUIDA_NO_AR = 0.3
/** O tom frio: a cor do "Note" puxada para um azul-aço, então acompanha o tema. */
const COR_FRIA = 'fill-[color-mix(in_oklab,rgb(var(--ink-900))_45%,#2E6DA4)] dark:fill-[color-mix(in_oklab,rgb(var(--ink-50))_50%,#86B6E3)]'

const reduzMovimento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Uma letra da fonte em uso desenhada num canvas, no mesmo peso e família do
 * SVG, no formato que `geometriaDoF`/`geometriaDoY` medem. `null` sem canvas.
 */
function desenharLetra(texto, letra) {
  const escala = 4
  const corpo = CORPO_DO_FY * escala
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const { fontWeight, fontFamily } = getComputedStyle(texto)
  const fonte = `${fontWeight} ${corpo}px ${fontFamily}`
  ctx.font = fonte
  const largura = Math.ceil(ctx.measureText(letra).width + corpo * 0.6)
  const altura = Math.ceil(corpo * 1.5)
  Object.assign(ctx.canvas, { width: largura, height: altura })
  ctx.font = fonte
  const origemX = corpo * 0.3
  const linhaDeBase = corpo * 1.1
  ctx.fillText(letra, origemX, linhaDeBase)
  const { data } = ctx.getImageData(0, 0, largura, altura)
  const tinta = new Uint8Array(largura * altura)
  for (let i = 0; i < tinta.length; i += 1) tinta[i] = data[i * 4 + 3] > 128 ? 1 : 0
  return { tinta, largura, altura, origemX, linhaDeBase, escala }
}

/**
 * O caminho da caneta sobre cada letra, na ordem em que se escreve e sempre de
 * cima para baixo: a haste do "f" (saindo da ponta do gancho), a barra, o braço
 * curto do "y" e o braço longo, até o fim da cauda. Cada um com a largura da
 * máscara que revela a letra embaixo dele.
 *
 * As letras vêm medidas na fonte em uso (`geometriaDoF`, `geometriaDoY`): a
 * caneta passa no meio de cada traço e a máscara tem a espessura dele. Se a
 * medição falhar, vale um desenho por proporções da caixa da letra
 * (`getExtentOfChar`). Os dois primeiros revelam só o "f", os dois últimos só
 * o "y" (`LETRA_DO_TRACO`).
 */
function tracosDoFy(texto) {
  const [f, y] = [texto.getExtentOfChar(0), texto.getExtentOfChar(1)]
  const [inicioDoF, inicioDoY] = [texto.getStartPositionOfChar(0).x, texto.getStartPositionOfChar(1).x]
  const imagemF = desenharLetra(texto, 'f')
  const imagemY = desenharLetra(texto, 'y')
  const geoF = imagemF && geometriaDoF(imagemF)
  const geoY = imagemY && geometriaDoY(imagemY)
  const px = (caixa, fracao) => caixa.x + caixa.width * fracao
  // Alturas em centésimos do corpo, acima (negativo) ou abaixo da linha de base.
  const py = (centesimos) => (centesimos * CORPO_DO_FY) / 100

  const doF = geoF
    ? (() => {
        const { haste, topo, gancho, barra } = geoF
        const x = (u) => inicioDoF + u
        const meio = barra.espessura / 2
        return [
          {
            // Da ponta do gancho, contorna o topo até a haste e desce até a linha de base.
            d: `M ${x(gancho.x)} ${gancho.y} C ${x(gancho.x)} ${topo} ${x(haste.x)} ${topo} ${x(haste.x)} ${topo + haste.espessura * 1.5} L ${x(haste.x)} ${-haste.espessura / 2}`,
            largura: haste.espessura + FOLGA_DA_MASCARA * 2,
          },
          { d: `M ${x(barra.de + meio)} ${barra.y} L ${x(barra.ate - meio)} ${barra.y}`, largura: barra.espessura + FOLGA_DA_MASCARA * 2 },
        ]
      })()
    : [
        { d: `M ${px(f, 0.95)} ${py(-66)} C ${px(f, 0.8)} ${py(-77)} ${px(f, 0.4)} ${py(-79)} ${px(f, 0.4)} ${py(-55)} L ${px(f, 0.4)} 0`, largura: LARGURA_DA_MASCARA },
        { d: `M ${px(f, 0.02)} ${py(-50)} L ${px(f, 0.92)} ${py(-50)}`, largura: LARGURA_DA_MASCARA },
      ]
  const noY = (pontos) => pontos.map((p) => ({ x: inicioDoY + p.x, y: p.y }))
  const doY = geoY
    ? [
        { d: caminhoSuave(noY(geoY.curto)), largura: geoY.espessura + FOLGA_DA_MASCARA * 2 },
        { d: caminhoSuave(noY(geoY.longo)), largura: geoY.espessura + FOLGA_DA_MASCARA * 2 },
      ]
    : [
        { d: `M ${px(y, 0.1)} ${py(-52)} L ${px(y, 0.52)} ${py(-2)}`, largura: LARGURA_DA_MASCARA },
        { d: `M ${px(y, 0.9)} ${py(-52)} L ${px(y, 0.42)} ${py(12)} Q ${px(y, 0.27)} ${py(24)} ${px(y, 0.05)} ${py(22)}`, largura: LARGURA_DA_MASCARA },
      ]
  return [...doF, ...doY]
}
const LETRA_DO_TRACO = ['f', 'f', 'y', 'y']

/** Uma caneta-tinteiro apontando para baixo, com a pena em (0, 0). */
function Caneta() {
  return (
    <>
      <rect x="-7.5" y="-100" width="15" height="75" rx="6" className="fill-ink-800 dark:fill-ink-200" />
      <rect x="-7.5" y="-74" width="15" height="3" className={COR_FRIA} />
      <rect x="-6" y="-27" width="12" height="10" rx="2" className="fill-ink-600 dark:fill-ink-400" />
      <path d="M0 0 C -2 -6 -5.5 -12 -5.5 -18 L 5.5 -18 C 5.5 -12 2 -6 0 0 Z" className="fill-ink-500 dark:fill-ink-300" />
      <path d="M0 -3 V -12" strokeWidth="0.9" strokeLinecap="round" className="stroke-white dark:stroke-ink-950" />
      <circle cx="0" cy="-13.2" r="1.2" className="fill-white dark:fill-ink-950" />
    </>
  )
}

export default function Abertura({ onFim, pronto = true }) {
  const notaRef = useRef(null)
  const textoRef = useRef(null)
  const fyRef = useRef(null)
  const grupoFyRef = useRef(null)
  const letrasRef = useRef({})
  const tracosRef = useRef([])
  const canetaRef = useRef(null)
  const cenaRef = useRef(null)
  // Medidas que dependem da fonte de cada sistema: onde "Note" acaba e a caixa de cada letra do "fy".
  const [medidas, setMedidas] = useState(null)
  const fimRef = useRef(onFim)
  fimRef.current = onFim
  const prontoRef = useRef(pronto)
  prontoRef.current = pronto

  // Efeito comum, e não de layout: mede depois que o tema e a fonte escolhida já valem
  // (o `UIContext` aplica os dois em efeitos de layout, que rodam antes de todo efeito comum).
  // Até lá a tela é só o fundo: "Note" está transparente e o "fy" ainda nem existe.
  useEffect(() => {
    const fy = fyRef.current
    setMedidas({
      nota: textoRef.current.getComputedTextLength(),
      fy: fy.getComputedTextLength(),
      // Onde cada letra começa, medido com as duas juntas: o espaço entre elas é o da fonte.
      letras: { f: fy.getStartPositionOfChar(0).x, y: fy.getStartPositionOfChar(1).x },
      tracos: tracosDoFy(fy),
    })
  }, [])

  useEffect(() => {
    if (!medidas) return undefined
    const reduzido = comoAbrir(modoDaAbertura(), reduzMovimento()) === 'reduzida'
    const tracos = tracosRef.current
    const comprimentos = tracos.map((traco) => traco.getTotalLength())
    tracos.forEach((traco, i) => (traco.style.strokeDasharray = `${comprimentos[i]}`))
    // Cada traço em pontos a cada unidade: é sobre eles que a escrita é planejada como um gesto só.
    const plano = planejarEscrita(
      tracos.map((traco, i) => {
        const n = Math.max(2, Math.ceil(comprimentos[i]))
        return Array.from({ length: n + 1 }, (_, k) => {
          const { x, y } = traco.getPointAtLength((comprimentos[i] * k) / n)
          return { x, y }
        })
      }),
    )
    const origem = medidas.nota + ENTRE_NOTE_E_FY

    let inicio = null
    let pulouEm = null
    let cenaAoPular = 1
    let anterior = null
    let angulo = ANGULO + 22
    let giro = 0
    let quadroPedido = 0

    const segura = inicioDaSaida(reduzido)
    const desenhar = (agora) => {
      inicio ??= agora
      // O app ainda carregando: o tempo para logo antes da saída (pular continua valendo).
      if (!prontoRef.current && pulouEm === null && agora - inicio > segura) inicio = agora - segura
      const q = quadroDaAbertura(agora - inicio, { reduzido })
      if (pulouEm !== null) {
        // Pular: o que já foi escrito fica, e a tela some a partir de onde estava.
        q.cena = cenaAoPular * Math.max(0, 1 - (agora - pulouEm) / SAIDA_AO_PULAR)
        q.fim = q.cena === 0
      }

      notaRef.current.style.opacity = q.nota
      // Sem a caneta, o "fy" já está inteiro: entra junto com o "Note", e não antes dele.
      grupoFyRef.current.style.opacity = reduzido ? q.nota : 1
      notaRef.current.style.transform = `translateY(${q.subida}px)`
      cenaRef.current.style.opacity = q.cena

      // Quanto de cada traço já foi escrito, e onde está a ponta (no papel ou no ar, entre traços).
      const ponta = plano.em(q.escrita)
      tracos.forEach((traco, i) => {
        traco.style.strokeDashoffset = `${comprimentos[i] * (1 - ponta.revelados[i])}`
        // Com nada escrito, a ponta redonda de um traço vazio ainda revela um ponto.
        traco.style.visibility = ponta.revelados[i] > 0 ? 'visible' : 'hidden'
      })
      // Escrito tudo, as máscaras saem: fica a letra inteira da fonte, sem depender da folga delas.
      if (q.escrita >= 1) Object.values(letrasRef.current).forEach((letra) => letra.removeAttribute('mask'))
      // No ar entre um traço e outro, a caneta sobe e desce de novo.
      const erguida = ponta.noAr === null ? 0 : ERGUIDA_NO_AR * Math.sin(Math.PI * ponta.noAr)

      // A mão: a velocidade da ponta dá o alvo da inclinação, e a mola leva até ele.
      const x = origem + ponta.x
      const dt = anterior ? Math.min(0.05, (agora - anterior.agora) / 1000) : 0
      const vx = dt ? (x - anterior.x) / dt : 0
      const vy = dt ? (ponta.y - anterior.y) / dt : 0
      anterior = { agora, x, y: ponta.y }
      const longe = Math.max(q.afastamento, erguida)
      const alvo = ANGULO - Math.max(-12, Math.min(12, vx * 0.05)) + Math.max(-5, Math.min(5, vy * 0.02)) + 22 * longe
      if (dt) {
        giro += (MOLA.rigidez * (alvo - angulo) - MOLA.amortecimento * giro) * dt
        angulo += giro * dt
      }
      // Longe do papel ela vem num arco (o x chega antes do y) e a sombra se afasta e espalha.
      canetaRef.current.style.opacity = q.caneta
      canetaRef.current.style.filter = `drop-shadow(${3 + 10 * longe}px ${4 + 20 * longe}px ${3 + 9 * longe}px rgb(0 0 0 / ${0.22 - 0.1 * longe}))`
      canetaRef.current.setAttribute(
        'transform',
        `translate(${x + AFASTAMENTO.x * longe ** 1.6} ${ponta.y + AFASTAMENTO.y * longe}) rotate(${angulo}) scale(${TAMANHO_DA_CANETA * (1 + 0.08 * longe)})`,
      )

      if (q.fim) fimRef.current?.()
      else quadroPedido = requestAnimationFrame(desenhar)
    }
    quadroPedido = requestAnimationFrame(desenhar)

    // Qualquer clique ou tecla pula; a tecla não segue para o app (Ctrl+K no meio da abertura não abre a busca atrás dela).
    const pular = (e) => {
      if (e.type === 'keydown') {
        e.preventDefault()
        e.stopPropagation()
      }
      if (pulouEm !== null) return
      pulouEm = performance.now()
      cenaAoPular = Number(cenaRef.current.style.opacity || 1)
    }
    window.addEventListener('keydown', pular, true)
    window.addEventListener('pointerdown', pular, true)
    return () => {
      cancelAnimationFrame(quadroPedido)
      window.removeEventListener('keydown', pular, true)
      window.removeEventListener('pointerdown', pular, true)
    }
  }, [medidas])

  const origem = (medidas?.nota ?? 0) + ENTRE_NOTE_E_FY
  const largura = origem + (medidas?.fy ?? 90)

  return (
    <div
      ref={cenaRef}
      aria-hidden
      className="fixed inset-0 z-[200] flex cursor-default select-none items-center justify-center bg-white dark:bg-ink-950"
    >
      <svg
        viewBox={`-10 -100 ${largura + 20} 160`}
        className="w-[min(44vw,320px)] overflow-visible"
      >
        <g ref={notaRef} style={{ opacity: 0 }}>
          <text ref={textoRef} x="0" y="0" fontSize="100" letterSpacing="-2" className="fill-ink-900 font-serif dark:fill-ink-50">
            Note
          </text>
        </g>
        <g ref={grupoFyRef} transform={`translate(${origem} 0)`}>
          {['f', 'y'].map((letra) => (
            <mask key={letra} id={`abertura-${letra}`} maskUnits="userSpaceOnUse" x="-50" y="-150" width="400" height="250">
              <g fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
                {medidas?.tracos.map(({ d, largura }, i) =>
                  LETRA_DO_TRACO[i] === letra ? (
                    <path key={i} ref={(el) => (tracosRef.current[i] = el)} d={d} strokeWidth={largura} style={{ visibility: 'hidden' }} />
                  ) : null,
                )}
              </g>
            </mask>
          ))}
          {/* Só para medir: as duas letras juntas dão a posição de cada uma com o espaçamento da fonte. */}
          <text ref={fyRef} x="0" y="0" fontSize={CORPO_DO_FY} fontWeight="500" letterSpacing="-2" visibility="hidden" className="font-sans">
            fy
          </text>
          {medidas &&
            ['f', 'y'].map((letra) => (
              <text
                key={letra}
                ref={(el) => (letrasRef.current[letra] = el)}
                x={medidas.letras[letra]}
                y="0"
                fontSize={CORPO_DO_FY}
                fontWeight="500"
                mask={`url(#abertura-${letra})`}
                className={`font-sans ${COR_FRIA}`}
              >
                {letra}
              </text>
            ))}
        </g>
        <g ref={canetaRef} style={{ opacity: 0 }}>
          <Caneta />
        </g>
      </svg>
    </div>
  )
}

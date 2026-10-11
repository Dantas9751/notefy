import { acharCamada, caixaAbsoluta, uniao } from '@/lib/design'
import { cn } from '@/lib/utils'
import { nomeDaCamada } from './PainelDeCamadas'

/**
 * Tudo o que se desenha POR CIMA do quadro, em pixels de tela: nome dos
 * frames, contorno do hover, seleção com alças, medida, guias de encaixe,
 * área de seleção e a marca de onde o item entra no auto layout.
 *
 * Fica fora do palco (que tem `scale`) para as alças terem sempre o mesmo
 * tamanho, em qualquer zoom. Só alças e nomes recebem o ponteiro; o resto
 * deixa o clique passar para a camada embaixo.
 */

const CANTOS = ['nw', 'ne', 'se', 'sw']
const ANGULO_DA_ALCA = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }
const CURSORES = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']

/** O cursor de redimensionar certo para a alça, com a camada girada. */
const cursorDaAlca = (alca, rotacao) => CURSORES[Math.round((((ANGULO_DA_ALCA[alca] + rotacao) % 180) + 180) % 180 / 45) % 4]

const CURSOR_GIRAR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
)}") 10 10, crosshair`

const POSICAO_DA_ALCA = {
  nw: { left: 0, top: 0 },
  ne: { left: '100%', top: 0 },
  se: { left: '100%', top: '100%' },
  sw: { left: 0, top: '100%' },
}

/** Caixa alinhada aos eixos de um retângulo girado, para pôr a medida embaixo. */
function caixaGirada(r) {
  const rad = ((r.rotation ?? 0) * Math.PI) / 180
  const w = Math.abs(r.w * Math.cos(rad)) + Math.abs(r.h * Math.sin(rad))
  const h = Math.abs(r.w * Math.sin(rad)) + Math.abs(r.h * Math.cos(rad))
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h }
}

function Caixa({ r, rotacao = 0, className, children, style }) {
  return (
    <div
      className={cn('pointer-events-none absolute', className)}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h, transform: rotacao ? `rotate(${rotacao}deg)` : undefined, ...style }}
    >
      {children}
    </div>
  )
}

function Alcas({ r, rotacao, linha, girar, pequena }) {
  if (linha) {
    return (
      <Caixa r={{ ...r, h: 0 }} rotacao={rotacao} style={{ transformOrigin: '0 0' }}>
        {['inicio', 'fim'].map((qual) => (
          <span
            key={qual}
            data-ponta={qual}
            className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-accent-500 bg-white [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-4"
            style={{ left: qual === 'inicio' ? 0 : '100%', top: 0 }}
          />
        ))}
      </Caixa>
    )
  }
  return (
    <Caixa r={r} rotacao={rotacao}>
      {/* Lados: faixas invisíveis, como no Figma — puxa-se de qualquer ponto da borda. */}
      {!pequena &&
        ['n', 'e', 's', 'w'].map((alca) => (
          <span
            key={alca}
            data-alca={alca}
            className="pointer-events-auto absolute"
            style={{
              cursor: cursorDaAlca(alca, rotacao),
              ...(alca === 'n' || alca === 's'
                ? { left: 6, right: 6, height: 8, top: alca === 'n' ? -4 : undefined, bottom: alca === 's' ? -4 : undefined }
                : { top: 6, bottom: 6, width: 8, left: alca === 'w' ? -4 : undefined, right: alca === 'e' ? -4 : undefined }),
            }}
          />
        ))}
      {girar &&
        CANTOS.map((canto) => (
          <span
            key={`g${canto}`}
            data-girar={canto}
            className="pointer-events-auto absolute h-4 w-4 [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-3"
            style={{
              cursor: CURSOR_GIRAR,
              left: canto.includes('w') ? -18 : undefined,
              right: canto.includes('e') ? -18 : undefined,
              top: canto.includes('n') ? -18 : undefined,
              bottom: canto.includes('s') ? -18 : undefined,
            }}
          />
        ))}
      {CANTOS.map((alca) => (
        <span
          key={alca}
          data-alca={alca}
          className="pointer-events-auto absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-accent-500 bg-white [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-4"
          style={{ ...POSICAO_DA_ALCA[alca], cursor: cursorDaAlca(alca, rotacao) }}
        />
      ))}
    </Caixa>
  )
}

export default function Sobreposicao({ camadas, selecao, hover, vista, visual, editando, somenteLeitura, mostrarNomes = true }) {
  const z = vista.zoom
  const tela = (r) => ({ x: r.x * z + vista.x, y: r.y * z + vista.y, w: r.w * z, h: r.h * z, rotation: r.rotation ?? 0 })
  const desloc = visual?.tipo === 'mover' ? { dx: visual.dx * z, dy: visual.dy * z } : { dx: 0, dy: 0 }
  const movidos = new Set(visual?.tipo === 'mover' ? visual.ids : [])
  const comDesloc = (r, id) => (movidos.has(id) ? { ...r, x: r.x + desloc.dx, y: r.y + desloc.dy } : r)

  const caixas = selecao
    .map((id) => {
      const abs = caixaAbsoluta(camadas, id)
      const camada = acharCamada(camadas, id)
      return abs && { id, tipo: camada?.type, travada: !!camada?.locked, r: comDesloc(tela(abs), id) }
    })
    .filter(Boolean)
  const unica = caixas.length === 1 ? caixas[0] : null
  const caixaDaSelecao = caixas.length > 1 ? uniao(caixas.map((c) => caixaGirada(c.r))) : null
  const gesto = visual?.tipo
  const medida = unica ? caixaAbsoluta(camadas, unica.id) : caixaDaSelecao && uniao(selecao.map((id) => caixaGirada(caixaAbsoluta(camadas, id))))
  const pe = unica ? caixaGirada(unica.r) : caixaDaSelecao
  const hoverAbs = hover && !selecao.includes(hover) && !gesto ? caixaAbsoluta(camadas, hover) : null
  // A linha gira pela ponta inicial, não pelo centro.
  const linhaEmHover = hoverAbs && acharCamada(camadas, hover)?.type === 'line'

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Nome dos frames do topo: clicar seleciona o frame (é o único jeito de pegar um frame cheio). */}
      {mostrarNomes &&
        camadas
          .filter((c) => c.type === 'frame' && c.visible !== false)
          .map((c) => {
            const r = comDesloc(tela(c), c.id)
            if (r.w < 24) return null
            return (
              <div
                key={c.id}
                data-rotulo={c.id}
                className={cn(
                  'pointer-events-auto absolute cursor-default select-none truncate text-[11px] leading-4 [@media(pointer:coarse)]:-translate-y-2 [@media(pointer:coarse)]:py-2',
                  selecao.includes(c.id) ? 'text-accent-600 dark:text-accent-400' : 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200',
                )}
                style={{ left: r.x, top: r.y - 18, maxWidth: r.w }}
              >
                {nomeDaCamada(c)}
              </div>
            )
          })}

      {hoverAbs && (
        <Caixa
          r={linhaEmHover ? { ...tela(hoverAbs), h: 0 } : tela(hoverAbs)}
          rotacao={hoverAbs.rotation}
          className="border-[1.5px] border-accent-500"
          style={linhaEmHover ? { transformOrigin: '0 0' } : undefined}
        />
      )}

      {caixas.map(({ id, tipo, r }) => (
        <Caixa key={id} r={tipo === 'line' ? { ...r, h: 0 } : r} rotacao={r.rotation} className="border border-accent-500" style={tipo === 'line' ? { transformOrigin: '0 0' } : undefined} />
      ))}

      {!somenteLeitura && unica && !unica.travada && editando !== unica.id && gesto !== 'mover' && (
        <Alcas r={unica.r} rotacao={unica.r.rotation} linha={unica.tipo === 'line'} girar pequena={unica.r.w < 20 || unica.r.h < 20} />
      )}
      {!somenteLeitura && caixaDaSelecao && !caixas.some((c) => c.travada) && gesto !== 'mover' && (
        <>
          <Caixa r={caixaDaSelecao} className="border border-accent-500" />
          <Alcas r={caixaDaSelecao} rotacao={0} pequena={caixaDaSelecao.w < 20 || caixaDaSelecao.h < 20} />
        </>
      )}

      {pe && medida && gesto !== 'area' && (
        <div
          className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-accent-600 px-1 py-px text-[10px] font-medium tabular-nums text-white"
          style={{ left: pe.x + pe.w / 2, top: pe.y + pe.h + 6 }}
        >
          {gesto === 'girar' ? `${Math.round(visual.angulo)}\u00B0` : `${Math.round(medida.w * 100) / 100} \u00D7 ${Math.round(medida.h * 100) / 100}`}
        </div>
      )}

      {visual?.guias?.map((g, i) => {
        const a = g.eixo === 'x' ? { x: g.pos, y: g.de } : { x: g.de, y: g.pos }
        const p = tela({ ...a, w: 0, h: 0 })
        const comprimento = (g.ate - g.de) * z
        return (
          <div
            key={i}
            className={cn('absolute', g.vao ? 'bg-fuchsia-500' : 'bg-rose-500')}
            style={g.eixo === 'x' ? { left: p.x, top: p.y, width: 1, height: comprimento } : { left: p.x, top: p.y, height: 1, width: comprimento }}
          />
        )
      })}

      {visual?.indicador && (() => {
        const { x1, y1, x2, y2 } = visual.indicador.linha
        const a = tela({ x: x1, y: y1, w: 0, h: 0 })
        const b = tela({ x: x2, y: y2, w: 0, h: 0 })
        return <div className="absolute rounded-full bg-accent-500" style={{ left: Math.min(a.x, b.x) - 1, top: Math.min(a.y, b.y) - 1, width: Math.abs(b.x - a.x) + 2, height: Math.abs(b.y - a.y) + 2 }} />
      })()}

      {gesto === 'area' && visual.rect && (
        <Caixa r={tela(visual.rect)} className="border border-accent-500 bg-accent-500/10" />
      )}
    </div>
  )
}


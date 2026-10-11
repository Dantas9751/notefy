import { useCallback, useEffect, useRef, useState } from 'react'
import { Timer, X } from 'lucide-react'
import BlocoRelogio from '@/components/inicio/BlocoRelogio'
import { usePreferencias } from '@/hooks/usePreferencias'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { chaveDoDia, formatarDuracao, lerTotal } from '@/lib/estudo'
import { RELOGIO_FLUTUANTE, layoutDoInicio, prenderNaTela } from '@/lib/inicio'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

const CHAVE_ABERTO = 'notefy.relogio.aberto'
const CHAVE_CAIXA = 'notefy.relogio.caixa'

function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto === null ? padrao : JSON.parse(bruto)
  } catch {
    return padrao
  }
}
function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    /* modo privado: vale só nesta sessão */
  }
}

const tela = () => ({ w: window.innerWidth, h: window.innerHeight })

/** O tempo de estudo de hoje, como o cronômetro da barra lateral o grava (a cada segundo). */
function useEstudoDeHoje() {
  const [segundos, setSegundos] = useState(() => lerTotal(chaveDoDia()))
  useEffect(() => {
    const tique = setInterval(() => setSegundos(lerTotal(chaveDoDia())), 1000)
    return () => clearInterval(tique)
  }, [])
  return segundos
}

/**
 * O relógio do Início solto sobre o app (Alt+R, ou o botão no bloco): com o
 * mesmo fundo e recorte, e o tempo de estudo de hoje no canto. Fica por
 * cima enquanto se navega e se mexe nos itens; arrasta-se por qualquer ponto
 * livre dele, o canto de baixo muda o tamanho, e ele nunca sai da janela.
 * Aberto, posição e tamanho ficam no aparelho.
 */
export default function RelogioFlutuante() {
  const { prefs } = usePreferencias()
  const foto = layoutDoInicio(prefs.home_layout).foto
  const [aberto, setAberto] = useState(() => ler(CHAVE_ABERTO, false) === true)
  const [caixa, setCaixa] = useState(() =>
    prenderNaTela(
      ler(CHAVE_CAIXA, null) ?? { x: window.innerWidth - RELOGIO_FLUTUANTE.w - 24, y: 72, w: RELOGIO_FLUTUANTE.w, h: RELOGIO_FLUTUANTE.h },
      tela(),
    ),
  )
  const gesto = useRef(null)
  const estudo = useEstudoDeHoje()

  const alternar = useCallback(() => {
    setAberto((atual) => {
      guardar(CHAVE_ABERTO, !atual)
      return !atual
    })
  }, [])

  useListenerDeJanela('notefy:relogio', alternar)
  useListenerDeJanela('keydown', (e) => {
    // Alt+R: livre no navegador e no app; \`code\`, e não \`key\`, para valer
    // em qualquer layout de teclado.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyR') {
      e.preventDefault()
      alternar()
    }
  })
  // A janela encolheu: o relógio vem junto, em vez de ficar fora de vista.
  useListenerDeJanela('resize', () => setCaixa((c) => prenderNaTela(c, tela())))

  if (!aberto) return null

  const comecar = (tipo) => (e) => {
    if (e.button !== 0 || (tipo === 'mover' && e.target.closest('button'))) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    gesto.current = { tipo, x: e.clientX, y: e.clientY, inicio: caixa }
  }
  const mover = (e) => {
    const g = gesto.current
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    const proxima =
      g.tipo === 'mover'
        ? { ...g.inicio, x: g.inicio.x + dx, y: g.inicio.y + dy }
        : { ...g.inicio, w: g.inicio.w + dx, h: g.inicio.h + dy }
    setCaixa(prenderNaTela(proxima, tela()))
  }
  const soltar = () => {
    if (!gesto.current) return
    gesto.current = null
    setCaixa((c) => {
      guardar(CHAVE_CAIXA, c)
      return c
    })
  }

  return (
    <div
      role="dialog"
      aria-label={t('Relógio')}
      style={{ left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h }}
      onPointerDown={comecar('mover')}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      className="fixed z-[45] cursor-grab touch-none select-none overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop active:cursor-grabbing dark:border-ink-700 dark:bg-ink-900"
    >
      <BlocoRelogio
        foto={foto}
        flutuante
        canto={(claro) => (
          <>
            <button
              type="button"
              onClick={alternar}
              title={t('Fechar o relógio (Alt+R)')}
              aria-label={t('Fechar o relógio')}
              className={cn(
                'rounded-full p-1 opacity-0 transition focus-visible:opacity-100 group-hover/relogio:opacity-100 [@media(hover:none)]:opacity-100',
                claro ? 'text-white/85 hover:bg-white/15 hover:text-white' : 'text-ink-500 hover:bg-ink-900/10 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-white/10 dark:hover:text-ink-50',
              )}
            >
              <X size={14} />
            </button>
            <span
              title={t('Estudo hoje')}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums backdrop-blur-sm',
                claro ? 'bg-black/35 text-white' : 'bg-ink-900/[0.07] text-ink-700 dark:bg-white/10 dark:text-ink-200',
              )}
            >
              <Timer size={12} aria-hidden />
              {formatarDuracao(estudo)}
            </span>
          </>
        )}
      />
      {/* O canto que muda o tamanho. */}
      <span
        aria-hidden
        onPointerDown={(e) => {
          e.stopPropagation()
          comecar('tamanho')(e)
        }}
        className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize"
      />
    </div>
  )
}

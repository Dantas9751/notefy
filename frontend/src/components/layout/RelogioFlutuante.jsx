import { useCallback, useEffect, useState } from 'react'
import { Timer, X } from 'lucide-react'
import BlocoRelogio from '@/components/inicio/BlocoRelogio'
import { usePreferencias } from '@/hooks/usePreferencias'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { chaveDoDia, formatarDuracao, lerTotal } from '@/lib/estudo'
import useCaixaFlutuante from '@/hooks/useCaixaFlutuante'
import { LIMITES_DO_RELOGIO, guardarNoAparelho, lerDoAparelho } from '@/lib/flutuante'
import { layoutDoInicio } from '@/lib/inicio'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'
import { casa, comTecla } from '@/lib/atalhos'

const CHAVE_ABERTO = 'notefy.relogio.aberto'
const CHAVE_CAIXA = 'notefy.relogio.caixa'

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
 * O relógio do Início solto sobre o app (pelo atalho, Ctrl+Shift+O de fábrica,
 * ou o botão no bloco): com o
 * mesmo fundo e recorte, e o tempo de estudo de hoje no canto. Fica por
 * cima enquanto se navega e se mexe nos itens; arrasta-se por qualquer ponto
 * livre dele, o canto de baixo muda o tamanho, e ele nunca sai da janela.
 * Aberto, posição e tamanho ficam no aparelho.
 */
export default function RelogioFlutuante() {
  const { prefs } = usePreferencias()
  const foto = layoutDoInicio(prefs.home_layout).foto
  const [aberto, setAberto] = useState(() => lerDoAparelho(CHAVE_ABERTO, false) === true)
  const { estilo, alca, canto, acompanhar } = useCaixaFlutuante(CHAVE_CAIXA, LIMITES_DO_RELOGIO)
  const estudo = useEstudoDeHoje()

  const alternar = useCallback(() => {
    setAberto((atual) => {
      guardarNoAparelho(CHAVE_ABERTO, !atual)
      return !atual
    })
  }, [])

  useListenerDeJanela('notefy:relogio', alternar)
  useListenerDeJanela('keydown', (e) => {
    if (casa(e, 'relogio')) {
      e.preventDefault()
      alternar()
    }
  })

  if (!aberto) return null

  return (
    <div
      role="dialog"
      aria-label={t('Relógio')}
      style={estilo}
      {...alca}
      {...acompanhar}
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
              title={comTecla(t('Fechar o relógio'), 'relogio')}
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
        {...canto}
        className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9"
      />
    </div>
  )
}

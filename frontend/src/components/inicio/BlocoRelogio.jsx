import { useEffect, useState } from 'react'
import { Music2, Pause, PictureInPicture2, Play, SkipBack, SkipForward } from 'lucide-react'
import { noDesktop } from '@/lib/desktop'
import { idioma, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { FotoDaCapa, fundoDaCapa, textoDaCapa } from './Capa'

/** A hora, renovada a cada virada de minuto (e não a cada segundo: o relógio não mostra segundos). */
function useAgora() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    let timer
    const agendar = () => {
      timer = setTimeout(() => {
        setAgora(new Date())
        agendar()
      }, 60_000 - (Date.now() % 60_000) + 50)
    }
    agendar()
    return () => clearTimeout(timer)
  }, [])
  return agora
}

//: De quanto em quanto tempo perguntar ao sistema o que está tocando.
const INTERVALO_DA_MIDIA = 2000

/**
 * A música que está tocando no computador (`midia.rs`). Só existe no app de
 * desktop: o navegador não tem como saber o que outro programa toca.
 */
function useMidia() {
  const [midia, setMidia] = useState(null)
  useEffect(() => {
    if (!noDesktop()) return undefined
    let vivo = true
    let timer
    // ponytail: pergunta a cada 2 s; trocar por evento do sistema se pesar.
    const ler = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const atual = await invoke('midia_atual')
        if (vivo) setMidia(atual)
      } catch {
        if (vivo) setMidia(null)
      }
      // Aba escondida não precisa saber da música.
      if (vivo) timer = setTimeout(ler, document.hidden ? INTERVALO_DA_MIDIA * 5 : INTERVALO_DA_MIDIA)
    }
    ler()
    return () => {
      vivo = false
      clearTimeout(timer)
    }
  }, [])

  const comando = async (acao) => {
    const { invoke } = await import('@tauri-apps/api/core')
    // Já mostra o novo estado: o sistema leva um instante para responder.
    if (acao === 'tocar') setMidia((m) => m && { ...m, tocando: !m.tocando })
    await invoke('midia_comando', { acao }).catch(() => {})
    setTimeout(async () => setMidia(await invoke('midia_atual').catch(() => null)), 400)
  }

  return { midia, comando }
}

function BotaoDaMidia({ rotulo, onClick, claro, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        'rounded-full p-1.5 transition',
        claro ? 'text-white/85 hover:bg-white/15 hover:text-white' : 'text-ink-600 hover:bg-ink-900/10 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-white/10 dark:hover:text-ink-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * O bloco do relógio: a hora sobre o fundo escolhido (uma foto, um dos
 * materiais da capa ou nada — o bloco liso, como os outros) e, no app do
 * computador, a música que está tocando, com tocar/pausar, anterior e próxima.
 *
 * O mesmo relógio vive no Início e solto sobre o app (`flutuante`, Alt+R).
 * `canto(claro)` desenha o que vai no canto de cima à direita; no Início,
 * sem ele, fica ali o botão de destacar (`onDestacar`).
 */
export const relogioClaro = (foto) =>
  foto?.tipo === 'imagem' || (foto?.tipo === 'gradiente' && textoDaCapa(foto) === 'claro')

export default function BlocoRelogio({ foto, flutuante = false, onDestacar, canto }) {
  const agora = useAgora()
  const { midia, comando } = useMidia()
  const tipo = foto?.tipo ?? 'nenhuma'
  //: Texto branco sobre foto e material escuro; o da página no papel e no bloco liso.
  const claro = relogioClaro(foto)

  return (
    // Altura própria (e não só `absolute inset-0`): o Início dá a um bloco
    // novo a altura que o conteúdo pede, e conteúdo todo absoluto pedia zero.
    <div
      data-relogio={flutuante ? undefined : ''}
      className={cn('group/relogio relative h-full overflow-hidden', !flutuante && 'min-h-[190px]', claro ? 'text-white' : 'text-ink-900 dark:text-ink-50')}
    >
      {tipo === 'imagem' && <FotoDaCapa capa={foto} />}
      {tipo === 'gradiente' && <div className="absolute inset-0" style={{ background: fundoDaCapa(foto) }} />}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {canto
          ? canto(claro)
          : onDestacar && (
              <BotaoDaMidia claro={claro} rotulo={t('Destacar o relógio (Alt+R)')} onClick={onDestacar} className="opacity-0 focus-visible:opacity-100 group-hover/relogio:opacity-100 [@media(hover:none)]:opacity-100">
                <PictureInPicture2 size={15} />
              </BotaoDaMidia>
            )}
      </div>
      <div className={cn('relative flex h-full flex-col justify-between gap-3 p-4', claro && '[text-shadow:0_1px_8px_rgb(0_0_0/0.45)]')}>
        <div>
          <p className={cn('font-display tabular-nums leading-none tracking-tight', flutuante ? 'text-4xl' : 'text-5xl')}>
            {agora.toLocaleTimeString(idioma, { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="mt-1.5 text-sm opacity-85 first-letter:uppercase">
            {agora.toLocaleDateString(idioma, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {midia && (
          <div className={cn('flex items-center gap-2 rounded-lg py-1.5 pl-3 pr-1.5 backdrop-blur-sm [text-shadow:none]', claro ? 'bg-black/40' : 'bg-ink-900/[0.06] dark:bg-white/10')}>
            <Music2 size={15} className="shrink-0 opacity-80" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{midia.titulo || t('Sem título')}</p>
              <p className="truncate text-xs opacity-75">{midia.artista || midia.app}</p>
            </div>
            <BotaoDaMidia claro={claro} rotulo={t('Anterior')} onClick={() => comando('anterior')}>
              <SkipBack size={15} className="fill-current" />
            </BotaoDaMidia>
            <BotaoDaMidia claro={claro} rotulo={midia.tocando ? t('Pausar') : t('Tocar')} onClick={() => comando('tocar')}>
              {midia.tocando ? <Pause size={17} className="fill-current" /> : <Play size={17} className="fill-current" />}
            </BotaoDaMidia>
            <BotaoDaMidia claro={claro} rotulo={t('Próxima')} onClick={() => comando('proxima')}>
              <SkipForward size={15} className="fill-current" />
            </BotaoDaMidia>
          </div>
        )}
      </div>
    </div>
  )
}

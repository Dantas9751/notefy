import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, Bell, Settings, X } from 'lucide-react'
import { useNotificacoes } from '@/context/NotificacoesContext'
import { cn, formatRelative } from '@/lib/utils'

/** Por quanto tempo o aviso flutuante fica na tela, sem o mouse em cima. */
const DURACAO_FLUTUANTE_MS = 8000

/**
 * A cor diz a urgência, e só ela: o texto já diz quanto falta. Um dia ou
 * uma hora antes é informação; dez minutos é aviso; passou do prazo é
 * alerta.
 */
const COR_DA_ETAPA = {
  '1d': 'text-ink-400',
  '1h': 'text-ink-400',
  '10m': 'text-amber-500',
  prazo: 'text-red-500',
}

function IconeDaEtapa({ etapa, excluida }) {
  return (
    <AlarmClock
      size={15}
      className={cn('mt-0.5 shrink-0', excluida ? 'text-ink-300 dark:text-ink-600' : COR_DA_ETAPA[etapa])}
    />
  )
}

/**
 * O sino, no canto superior direito, e a lista que ele abre.
 *
 * Mora na ponta da barra de abas porque é a única faixa que existe em
 * toda tela, no desktop e no celular. O cabeçalho de página muda a cada
 * rota, e no painel dividido existem dois.
 */
export function CentralDeNotificacoes() {
  const { itens, naoLidas, marcarLidas, limpar, abrirTarefa } = useNotificacoes()
  const [aberta, setAberta] = useState(false)
  // As que chegaram sem ser vistas, congeladas no momento em que a lista
  // abriu. Abrir já marca tudo como lido (o número do sino some), mas
  // quem abriu ainda precisa saber quais são as novas.
  const [novas, setNovas] = useState(() => new Set())
  const raizRef = useRef(null)

  const alternar = () => {
    if (aberta) {
      setAberta(false)
      return
    }
    setNovas(new Set(itens.filter((i) => !i.lida).map((i) => i.chave)))
    marcarLidas()
    setAberta(true)
  }

  useEffect(() => {
    if (!aberta) return undefined
    const fora = (e) => {
      if (!raizRef.current?.contains(e.target)) setAberta(false)
    }
    const esc = (e) => {
      if (e.key === 'Escape') setAberta(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberta])

  const rotulo = naoLidas
    ? `Notificações, ${naoLidas} ${naoLidas === 1 ? 'nova' : 'novas'}`
    : 'Notificações'

  return (
    <div ref={raizRef} className="relative flex shrink-0">
      <button
        type="button"
        onClick={alternar}
        title={rotulo}
        aria-label={rotulo}
        aria-expanded={aberta}
        aria-haspopup="dialog"
        className={cn(
          'relative flex items-center border-l border-ink-200 px-3 transition dark:border-ink-800',
          aberta
            ? 'bg-white text-ink-800 dark:bg-ink-950 dark:text-ink-100'
            : 'text-ink-400 hover:bg-ink-100/70 hover:text-ink-700 dark:hover:bg-ink-800/50 dark:hover:text-ink-200',
        )}
      >
        <Bell size={14} />
        {naoLidas > 0 && (
          <span className="absolute right-1.5 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-600 px-1 text-[9px] font-semibold leading-none text-white">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberta && (
        <div
          role="dialog"
          aria-label="Notificações"
          className="absolute right-1 top-full z-40 mt-1 w-[22rem] max-w-[calc(100vw-1rem)] animate-fade-in overflow-hidden rounded-lg border border-ink-200 bg-white shadow-pop dark:border-ink-700 dark:bg-ink-900"
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 dark:border-ink-800">
            <h2 className="secao">Notificações</h2>
            <Link
              to="/settings/notificacoes"
              onClick={() => setAberta(false)}
              title="Escolher quando avisar"
              aria-label="Configurar notificações"
              className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
            >
              <Settings size={13} />
            </Link>
          </div>

          {itens.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs leading-relaxed text-ink-400">
              Nada por aqui. Tarefas com prazo avisam neste sino antes de vencer.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto dark:divide-ink-800">
              {itens.map((item) => (
                <li key={item.chave}>
                  <button
                    type="button"
                    disabled={item.excluida}
                    onClick={() => {
                      setAberta(false)
                      abrirTarefa(item)
                    }}
                    className={cn(
                      'flex w-full gap-2.5 px-3 py-2.5 text-left transition',
                      item.excluida
                        ? 'cursor-default'
                        : 'hover:bg-ink-50 dark:hover:bg-ink-800/60',
                      novas.has(item.chave) && 'bg-accent-50/60 dark:bg-accent-500/10',
                    )}
                  >
                    <IconeDaEtapa etapa={item.etapa} excluida={item.excluida} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            'truncate text-[13px] font-medium',
                            item.excluida
                              ? 'text-ink-400 line-through'
                              : 'text-ink-800 dark:text-ink-100',
                          )}
                        >
                          {item.titulo}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-ink-400">
                          {formatRelative(item.criadoEm)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
                        {item.texto}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {itens.length > 0 && (
            <div className="border-t border-ink-100 px-3 py-1.5 text-right dark:border-ink-800">
              <button
                type="button"
                onClick={limpar}
                className="rounded px-2 py-1 text-[11px] text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100"
              >
                Limpar tudo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AvisoFlutuante({ item, dispensar, abrir }) {
  const [pausado, setPausado] = useState(false)

  // Parado enquanto o mouse está em cima: quem foi ler não perde o aviso
  // no meio da frase.
  useEffect(() => {
    if (pausado) return undefined
    const timer = setTimeout(() => dispensar(item.chave), DURACAO_FLUTUANTE_MS)
    return () => clearTimeout(timer)
  }, [pausado, item.chave, dispensar])

  return (
    <div
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className="pointer-events-auto flex animate-fade-in items-start gap-2.5 rounded-lg border border-ink-200 bg-white p-3 shadow-pop dark:border-ink-700 dark:bg-ink-900"
    >
      <IconeDaEtapa etapa={item.etapa} />
      <button type="button" onClick={() => abrir(item)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-medium text-ink-800 dark:text-ink-100">
          {item.titulo}
        </span>
        <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">{item.texto}</span>
      </button>
      <button
        type="button"
        onClick={() => dispensar(item.chave)}
        aria-label="Dispensar aviso"
        className="shrink-0 rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
      >
        <X size={13} />
      </button>
    </div>
  )
}

/**
 * O aviso que aparece na hora, logo abaixo do sino.
 *
 * Some sozinho em alguns segundos e continua guardado no sino: aqui é só
 * a chegada. `aria-live` para o leitor de tela anunciar sem roubar o foco
 * de quem está escrevendo.
 */
export function AvisosFlutuantes() {
  const { flutuantes, dispensarFlutuante, abrirTarefa } = useNotificacoes()

  return (
    <div
      role="status"
      aria-live="polite"
      // `top-24` no celular: o cabeçalho (56px) mais a barra de abas.
      // No desktop só a barra de abas fica acima.
      className="pointer-events-none fixed right-3 top-24 z-[55] flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 lg:top-10"
    >
      {flutuantes.map((item) => (
        <AvisoFlutuante
          key={item.chave}
          item={item}
          dispensar={dispensarFlutuante}
          abrir={abrirTarefa}
        />
      ))}
    </div>
  )
}

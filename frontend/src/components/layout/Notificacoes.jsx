import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, AlertCircle, Bell, CheckCircle2, Loader2, Settings, X } from 'lucide-react'
import { useNotificacoes } from '@/context/NotificacoesContext'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { EVENTO_AVISO } from '@/lib/avisoFlutuante'
import { cn, formatRelative } from '@/lib/utils'
import { t } from '@/lib/i18n'

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
    ? t(naoLidas === 1 ? 'Notificações, {n} nova' : 'Notificações, {n} novas', { n: naoLidas })
    : t('Notificações')

  return (
    <div ref={raizRef} className="relative flex shrink-0">
      <button
        type="button"
        onClick={alternar}
        title={rotulo}
        aria-label={rotulo}
        aria-expanded={aberta}
        aria-haspopup="dialog"
        // Com nome, como o botão do Laviel ao lado: só o sino, no canto da
        // barra de abas, passava despercebido.
        className={cn(
          'relative flex items-center gap-1.5 border-l border-ink-200 px-3 text-xs font-medium transition dark:border-ink-800',
          aberta
            ? 'bg-white text-ink-800 dark:bg-ink-950 dark:text-ink-100'
            : naoLidas > 0
              ? 'text-accent-600 hover:bg-ink-100/70 dark:text-accent-400 dark:hover:bg-ink-800/50'
              : 'text-ink-600 hover:bg-ink-100/70 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800/50 dark:hover:text-ink-50',
        )}
      >
        <Bell size={16} />
        <span className="hidden sm:inline">{t('Avisos')}</span>
        {naoLidas > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white max-sm:absolute max-sm:right-1 max-sm:top-1.5">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberta && (
        <div
          role="dialog"
          aria-label={t('Notificações')}
          className="absolute right-1 top-full z-40 mt-1 w-[22rem] max-w-[calc(100vw-1rem)] animate-fade-in overflow-hidden rounded-lg border border-ink-200 bg-white shadow-pop dark:border-ink-700 dark:bg-ink-900"
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 dark:border-ink-800">
            <h2 className="secao">{t('Notificações')}</h2>
            <Link
              to="/settings/notificacoes"
              onClick={() => setAberta(false)}
              title={t('Escolher quando avisar')}
              aria-label={t('Configurar notificações')}
              className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
            >
              <Settings size={13} />
            </Link>
          </div>

          {itens.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs leading-relaxed text-ink-400">
              {t('Nada por aqui. Tarefas com prazo avisam neste sino antes de vencer.')}
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
                {t('Limpar tudo')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * O cartão do canto, o mesmo para prazo e para resultado de ação.
 * `duracao` nula fica até ser dispensado (o progresso da IA).
 */
function CartaoFlutuante({ chave, dispensar, icone, titulo, texto, onAbrir, duracao = DURACAO_FLUTUANTE_MS, alerta }) {
  const [pausado, setPausado] = useState(false)

  // Parado enquanto o mouse está em cima: quem foi ler não perde o aviso
  // no meio da frase.
  useEffect(() => {
    if (pausado || !duracao) return undefined
    const timer = setTimeout(() => dispensar(chave), duracao)
    return () => clearTimeout(timer)
  }, [pausado, duracao, chave, dispensar])

  const corpo = titulo ? (
    <>
      <span className="block truncate text-[13px] font-medium text-ink-800 dark:text-ink-100">{titulo}</span>
      <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">{texto}</span>
    </>
  ) : (
    <span className="block text-[13px] text-ink-700 dark:text-ink-200">{texto}</span>
  )

  return (
    <div
      role={alerta ? 'alert' : undefined}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className="pointer-events-auto flex animate-fade-in items-start gap-2.5 rounded-lg border border-ink-200 bg-white p-3 shadow-pop dark:border-ink-700 dark:bg-ink-900"
    >
      {icone}
      {onAbrir ? (
        <button type="button" onClick={onAbrir} className="min-w-0 flex-1 text-left">
          {corpo}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{corpo}</div>
      )}
      <button
        type="button"
        onClick={() => dispensar(chave)}
        aria-label={t('Dispensar aviso')}
        className="shrink-0 rounded p-0.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
      >
        <X size={13} />
      </button>
    </div>
  )
}

const ICONE_DO_AVISO = {
  erro: <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />,
  sucesso: <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />,
  progresso: <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-ink-400" />,
}

/** Os avisos de ação (`lib/avisoFlutuante.js`). O mesmo id troca no lugar: o "Resumindo..." vira o erro. */
function useAvisosDeAcao() {
  const [avisos, setAvisos] = useState([])
  const dispensar = useCallback((id) => setAvisos((lista) => lista.filter((aviso) => aviso.id !== id)), [])

  useListenerDeJanela(EVENTO_AVISO, ({ detail }) => {
    if (detail.fechar) dispensar(detail.fechar)
    else setAvisos((lista) => [...lista.filter((aviso) => aviso.id !== detail.id), detail].slice(-3))
  })

  return { avisos, dispensar }
}

/**
 * Os avisos que aparecem na hora: a chegada de um prazo (que continua
 * guardado no sino) e o resultado de uma ação.
 *
 * No canto de baixo: no de cima, logo abaixo do sino, o cartão cobria os
 * botões do cabeçalho da página (Criar, Importar) enquanto estava na tela.
 * No celular fica acima da barra de seleção, que mora no rodapé.
 *
 * `aria-live` para o leitor de tela anunciar sem roubar o foco de quem
 * está escrevendo; o erro de uma ação é `alert`.
 */
export function AvisosFlutuantes() {
  const { flutuantes, dispensarFlutuante, abrirTarefa } = useNotificacoes()
  const { avisos, dispensar } = useAvisosDeAcao()

  return (
    <div
      role="status"
      aria-live="polite"
      className="app-avisos pointer-events-none fixed bottom-20 right-3 z-[55] flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 lg:bottom-6"
    >
      {avisos.map((aviso) => {
        const erro = aviso.tipo === 'erro'
        return (
          <CartaoFlutuante
            key={aviso.id}
            chave={aviso.id}
            dispensar={dispensar}
            alerta={erro}
            texto={aviso.texto}
            // Erro: o tempo do prazo, ou mais, para um texto longo.
            // Progresso fica até virar outro aviso.
            duracao={
              erro
                ? Math.max(DURACAO_FLUTUANTE_MS, aviso.texto.length * 60)
                : aviso.tipo === 'sucesso' ? DURACAO_FLUTUANTE_MS : null
            }
            icone={ICONE_DO_AVISO[aviso.tipo]}
            onAbrir={
              aviso.aoAbrir &&
              (() => {
                aviso.aoAbrir()
                dispensar(aviso.id)
              })
            }
          />
        )
      })}
      {flutuantes.map((item) => (
        <CartaoFlutuante
          key={item.chave}
          chave={item.chave}
          dispensar={dispensarFlutuante}
          icone={<IconeDaEtapa etapa={item.etapa} />}
          titulo={item.titulo}
          texto={item.texto}
          onAbrir={() => abrirTarefa(item)}
        />
      ))}
    </div>
  )
}

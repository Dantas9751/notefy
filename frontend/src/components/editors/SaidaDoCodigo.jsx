import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

const COR_DO_FLUXO = {
  saida: 'text-ink-800 dark:text-ink-100',
  erro: 'text-red-600 dark:text-red-400',
  entrada: 'text-accent-600 dark:text-accent-400',
  aviso: 'italic text-ink-400',
}

const ROTULO_DO_ESTADO = {
  carregando: 'Preparando o Python...',
  rodando: 'Executando...',
  esperando: 'Esperando sua resposta',
}

/**
 * Saída de um bloco de código, embaixo dele. Não é salva na nota: é o
 * resultado da última execução, como num terminal.
 */
export default function SaidaDoCodigo({ estado, saida, onResponder, onFechar }) {
  const rolagem = useRef(null)
  const campo = useRef(null)
  const [resposta, setResposta] = useState('')
  const esperando = estado === 'esperando'

  useEffect(() => {
    const el = rolagem.current
    if (el) el.scrollTop = el.scrollHeight
  }, [saida, esperando])

  useEffect(() => {
    if (esperando) campo.current?.focus()
  }, [esperando])

  const enviar = (event) => {
    event.preventDefault()
    onResponder(resposta)
    setResposta('')
  }

  return (
    <div className="border-t border-ink-200 bg-ink-50/60 dark:border-ink-700 dark:bg-ink-900/60">
      <div className="flex items-center gap-2 px-3 pt-1.5 text-[11px] text-ink-500">
        <span className="font-medium">{t('Saída')}</span>
        {estado !== 'parado' && (
          <span className="flex items-center gap-1 text-ink-400" role="status">
            {!esperando && <Loader2 size={11} className="animate-spin" />}
            {t(ROTULO_DO_ESTADO[estado])}
          </span>
        )}
        <button
          onClick={onFechar}
          disabled={estado !== 'parado'}
          aria-label={t('Fechar a saída')}
          title={t('Fechar a saída')}
          className="ml-auto rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 disabled:invisible dark:hover:bg-ink-700"
        >
          <X size={12} />
        </button>
      </div>
      <div ref={rolagem} className="max-h-72 overflow-auto px-3 pb-2" aria-live="polite">
        <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.55]">
          {saida.map((pedaco, i) => (
            <span key={i} className={COR_DO_FLUXO[pedaco.fluxo]}>
              {pedaco.texto}
            </span>
          ))}
          {!saida.length && estado === 'parado' && (
            <span className={COR_DO_FLUXO.aviso}>{t('O código terminou sem escrever nada.')}</span>
          )}
        </pre>
        {esperando && (
          <form onSubmit={enviar} className="mt-1 flex items-center gap-1.5">
            <span aria-hidden className="font-mono text-[12.5px] text-accent-600 dark:text-accent-400">›</span>
            <input
              ref={campo}
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              aria-label={t('Resposta para o código')}
              enterKeyHint="send"
              placeholder={t('Digite e aperte Enter')}
              className={cn(
                'h-7 min-w-0 flex-1 rounded border border-ink-200 bg-white px-2 font-mono text-[12.5px]',
                'focus:border-accent-400 focus:ring-1 focus:ring-accent-400 dark:border-ink-700 dark:bg-ink-950',
              )}
            />
          </form>
        )}
      </div>
    </div>
  )
}

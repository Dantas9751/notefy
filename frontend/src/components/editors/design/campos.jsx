import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Os controles do painel de propriedades, no desenho compacto do Figma:
 * rótulo curto à esquerda, valor à direita, 28 px de altura.
 */

const CAIXA =
  'flex h-7 min-w-0 items-center gap-1 rounded-md border border-transparent bg-ink-100 px-1.5 text-xs text-ink-800 transition focus-within:border-accent-500 hover:border-ink-200 dark:bg-ink-800 dark:text-ink-100 dark:hover:border-ink-700'

const arred = (n, casas) => {
  const f = 10 ** casas
  return Math.round(n * f) / f
}

/**
 * Número com rótulo que se ARRASTA para mudar o valor (como no Figma).
 * `valor` null = seleção com valores diferentes ("Misto"). Confirma no
 * Enter e ao sair; Esc volta ao valor de antes.
 */
export function CampoNumero({ rotulo, titulo, valor, onChange, min = -Infinity, max = Infinity, passo = 1, casas = 2, sufixo, className, disabled, vazio }) {
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState(false)
  const arrasteRef = useRef(null)
  const mostrado = valor == null ? '' : String(arred(valor, casas))

  useEffect(() => {
    if (!editando) setTexto(mostrado)
  }, [mostrado, editando])

  const prender = (n) => Math.min(max, Math.max(min, n))
  const confirmar = () => {
    setEditando(false)
    if (texto.trim() === '' || texto === mostrado) return setTexto(mostrado)
    // Aceita conta simples, como o Figma: "120+16", "50*2".
    const limpo = texto.replace(',', '.').replace(/[^\d.+\-*/() ]/g, '')
    let n = Number(limpo)
    if (!Number.isFinite(n) && /^[\d.+\-*/() ]+$/.test(limpo)) {
      try {
        n = Function(`"use strict";return (${limpo})`)()
      } catch {
        n = NaN
      }
    }
    if (Number.isFinite(n)) onChange(prender(arred(n, casas)))
    else setTexto(mostrado)
  }

  return (
    <label title={titulo} className={cn(CAIXA, disabled && 'pointer-events-none opacity-50', className)}>
      {rotulo && (
        <span
          className="shrink-0 cursor-ew-resize select-none px-0.5 text-[11px] text-ink-400"
          onPointerDown={(e) => {
            if (disabled || valor == null) return
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            arrasteRef.current = { x: e.clientX, inicio: valor }
          }}
          onPointerMove={(e) => {
            const a = arrasteRef.current
            if (!a) return
            const fator = e.shiftKey ? 10 : 1
            onChange(prender(arred(a.inicio + Math.round((e.clientX - a.x) / 2) * passo * fator, casas)))
          }}
          onPointerUp={() => {
            arrasteRef.current = null
          }}
        >
          {rotulo}
        </span>
      )}
      <input
        value={texto}
        placeholder={valor == null ? vazio ?? t('Misto') : undefined}
        disabled={disabled}
        onFocus={(e) => {
          setEditando(true)
          e.currentTarget.select()
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setTexto(mostrado)
            setEditando(false)
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (valor == null) return
            e.preventDefault()
            const n = prender(arred(valor + (e.key === 'ArrowUp' ? 1 : -1) * passo * (e.shiftKey ? 10 : 1), casas))
            onChange(n)
            setTexto(String(n))
          }
        }}
        className="w-full min-w-0 bg-transparent text-xs tabular-nums outline-none placeholder:text-ink-400"
      />
      {sufixo && <span className="shrink-0 text-[11px] text-ink-400">{sufixo}</span>}
    </label>
  )
}

/** Cor: quadradinho (abre o seletor do sistema), hex e opacidade. */
export function CampoCor({ cor, opacidade = 1, onChange, onOpacidade, comOpacidade = true, vazio }) {
  const [hex, setHex] = useState('')
  const mostrado = (cor ?? '').replace('#', '').toUpperCase()
  useEffect(() => setHex(mostrado), [mostrado])
  const confirmarHex = () => {
    let h = hex.replace('#', '').trim()
    if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('')
    if (/^[0-9a-f]{6}$/i.test(h)) onChange(`#${h.toUpperCase()}`)
    else setHex(mostrado)
  }
  return (
    <div className={cn(CAIXA, 'flex-1')}>
      <label
        className="relative h-4 w-4 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-black/10 dark:border-white/15"
        style={{ background: cor ?? 'transparent' }}
        title={t('Escolher cor')}
      >
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(cor ?? '') ? cor : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={hex}
        placeholder={cor == null ? vazio ?? t('Misto') : undefined}
        onChange={(e) => setHex(e.target.value)}
        onBlur={confirmarHex}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-full min-w-0 bg-transparent font-mono text-[11px] uppercase outline-none"
        aria-label={t('Cor em hexadecimal')}
      />
      {comOpacidade && (
        <CampoNumero
          valor={Math.round((opacidade ?? 1) * 100)}
          onChange={(n) => onOpacidade(n / 100)}
          min={0}
          max={100}
          casas={0}
          sufixo="%"
          titulo={t('Opacidade')}
          className="w-14 shrink-0 bg-transparent px-0 hover:border-transparent dark:bg-transparent"
        />
      )}
    </div>
  )
}

/** Bloco do painel: título, botão de adicionar e o conteúdo. */
export function Secao({ titulo, onAdicionar, tituloAdicionar, acoes, children, vazio = false }) {
  return (
    <section className="border-b border-ink-200 px-3 py-2.5 dark:border-ink-800">
      <header className={cn('flex h-6 items-center justify-between', !vazio && 'mb-1.5')}>
        <h3 className={cn('text-[11px] font-semibold', vazio ? 'text-ink-400' : 'text-ink-700 dark:text-ink-200')}>{titulo}</h3>
        <div className="flex items-center gap-0.5">
          {acoes}
          {onAdicionar && (
            <BotaoIcone titulo={tituloAdicionar ?? t('Adicionar')} onClick={onAdicionar}>
              <Plus size={14} />
            </BotaoIcone>
          )}
        </div>
      </header>
      {children}
    </section>
  )
}

export function BotaoIcone({ titulo, ativo, onClick, children, className, disabled }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md text-ink-500 transition disabled:opacity-40',
        ativo
          ? 'bg-accent-100 text-accent-700 dark:bg-accent-500/20 dark:text-accent-300'
          : 'hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-800 dark:hover:text-ink-100',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Linha de uma lista de pintura/efeito: olho, conteúdo, remover. */
export function LinhaDeItem({ visivel = true, onVisivel, onRemover, children }) {
  return (
    <div className="mb-1 flex items-center gap-1">
      <div className={cn('flex min-w-0 flex-1 items-center gap-1', !visivel && 'opacity-50')}>{children}</div>
      {onVisivel && (
        <BotaoIcone titulo={visivel ? t('Ocultar') : t('Mostrar')} onClick={onVisivel}>
          {visivel ? <Eye size={13} /> : <EyeOff size={13} />}
        </BotaoIcone>
      )}
      <BotaoIcone titulo={t('Remover')} onClick={onRemover}>
        <Minus size={14} />
      </BotaoIcone>
    </div>
  )
}

/** `<select>` no mesmo desenho dos campos. */
export function Escolha({ valor, onChange, opcoes, titulo, className }) {
  return (
    <select
      value={valor ?? ''}
      title={titulo}
      aria-label={titulo}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CAIXA, 'cursor-pointer appearance-none pr-5 outline-none', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='3'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center',
      }}
    >
      {valor == null && <option value="">{t('Misto')}</option>}
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  )
}

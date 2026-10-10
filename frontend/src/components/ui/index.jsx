import { forwardRef, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Trash2, X } from 'lucide-react'
import { cn, readableTextColor } from '@/lib/utils'
import { t } from '@/lib/i18n'

/* -------------------------------------------------------------------- */
/* Button                                                                */
/* -------------------------------------------------------------------- */

const VARIANTS = {
  primary:
    'bg-accent-600 text-white hover:bg-accent-700 disabled:bg-accent-300 dark:disabled:bg-accent-800',
  secondary:
    'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-ink-800',
  ghost: 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const SIZES = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-8 w-8',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...props
}) {
  return (
    <button
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={15} className="animate-spin" aria-hidden />
      ) : (
        Icon && <Icon size={15} aria-hidden />
      )}
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------- */
/* Modal                                                                 */
/* -------------------------------------------------------------------- */

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    // Trava o scroll do fundo enquanto o modal está aberto.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        className="fixed inset-0 animate-fade-in bg-ink-950/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Nunca mais alto que a tela: o conteúdo rola por dentro, entre o
        // título e os botões, que ficam sempre à vista. Sem isto, um modal
        // longo (os atalhos) passava da tela e escondia o topo e o pé.
        className={cn(
          'relative flex max-h-[calc(100dvh-2rem)] w-full animate-slide-up flex-col rounded-xl border border-ink-200 bg-white shadow-pop',
          'focus:outline-none dark:border-ink-800 dark:bg-ink-900',
          widths[size],
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t('Fechar')}
            className="-mr-1 rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
          >
            <X size={17} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-ink-100 px-5 py-3.5 dark:border-ink-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------- */
/* Estados                                                               */
/* -------------------------------------------------------------------- */

export function Spinner({ className, size = 18 }) {
  return <Loader2 size={size} className={cn('animate-spin text-ink-400', className)} />
}

export function Skeleton({ className }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded bg-ink-100 dark:bg-ink-800',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-gradient-to-r after:from-transparent after:via-white/50 after:to-transparent',
        'dark:after:via-white/5',
        className,
      )}
    />
  )
}

/** Esqueleto de lista — mantém o layout estável durante o carregamento. */
export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border border-ink-100 p-4 dark:border-ink-800">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ink-200 px-6 py-14 text-center dark:border-ink-800">
      {Icon && (
        <div className="mb-3 rounded-full bg-ink-100 p-3 text-ink-400 dark:bg-ink-800">
          <Icon size={22} />
        </div>
      )}
      <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * Erro que mora na tela: o de um formulário (junto dos campos) e o de uma
 * tela que não carregou (com "Tentar novamente"). O resultado de uma ação
 * vai para o aviso flutuante (`lib/avisoFlutuante.js`).
 */
export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-medium underline underline-offset-2">
          {t('Tentar novamente')}
        </button>
      )}
    </div>
  )
}

/**
 * Barra flutuante da seleção múltipla, a mesma em todas as listas.
 * `children` entra antes de "Excluir" (a lixeira põe "Restaurar" ali).
 * `rotulo` troca o "N selecionados" quando o item é feminino (pastas).
 */
export function BarraDeSelecao({ total, rotulo, onExcluir, onLimpar, children }) {
  if (!total) return null
  return (
    // `w-max`: preso em `left-1/2`, a barra só tinha meia tela de largura e
    // o "1 selecionado" quebrava em duas linhas no celular.
    <div className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 animate-slide-up items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 text-white shadow-xl dark:bg-ink-800">
      <span className="whitespace-nowrap text-xs font-medium">
        {rotulo ?? t(total === 1 ? '1 selecionado' : '{n} selecionados', { n: total })}
      </span>
      <div className="h-4 w-px bg-ink-700" />
      {children}
      <button
        type="button"
        onClick={onExcluir}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/20"
      >
        <Trash2 size={14} />
        {t('Excluir')}
      </button>
      <button
        type="button"
        onClick={onLimpar}
        aria-label={t('Limpar seleção')}
        title={t('Limpar seleção')}
        className="rounded p-1 text-ink-400 transition hover:text-white"
      >
        <X size={14} />
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------- */
/* Badges e campos                                                       */
/* -------------------------------------------------------------------- */

export function Badge({ children, className, color }) {
  // Com `color`, o fundo é a cor da categoria e o texto é calculado para
  // manter contraste legível qualquer que seja o tom escolhido.
  const style = color
    ? { backgroundColor: `${color}22`, color, borderColor: `${color}44` }
    : undefined
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium leading-5',
        !color && className,
      )}
    >
      {children}
    </span>
  )
}

export function ColorDot({ color, size = 8 }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: color || '#a8a29b' }}
    />
  )
}

/**
 * `action` é um controle opcional alinhado à direita do rótulo — um "+"
 * para criar a opção que falta, por exemplo. Fica FORA do `<label>`: um
 * botão dentro dele herdaria o comportamento de ativação do rótulo.
 */
export function Field({ label, error, hint, action, children }) {
  return (
    <div>
      {(label || action) && (
        <div className="flex items-end justify-between gap-2">
          {label && <label className="label">{label}</label>}
          {action}
        </div>
      )}
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn('input cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  )
}

/**
 * `forwardRef` porque no React 18 componente de função não recebe `ref`
 * como prop, e quem abre um campo dentro de um modal precisa focá-lo na
 * mão: o `Modal` foca o painel ao abrir e desfaz qualquer `autoFocus`.
 */
export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn('input', className)} {...props} />
})

export function Textarea({ className, ...props }) {
  return <textarea className={cn('input resize-y', className)} {...props} />
}

export { readableTextColor }

import { cn } from '@/lib/utils'

/** Uma tecla desenhada como tecla. */
export function Tecla({ children, className }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/** Uma combinação: `['Ctrl', 'Shift', 'F']`. */
export function Combinacao({ teclas, className }) {
  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      {teclas.map((tecla, i) => (
        <Tecla key={i}>{tecla}</Tecla>
      ))}
    </span>
  )
}

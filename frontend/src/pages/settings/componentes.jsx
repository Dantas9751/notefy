import { cn } from '@/lib/utils'

/**
 * Peças que as abas de Configurações repartem.
 *
 * `Bloco` e `Chave` estavam copiados em `Settings.jsx` e em `Profile.jsx`,
 * idênticos até no espaçamento. Duas cópias da mesma caixa é como o
 * "Foto" do perfil acaba com uma margem diferente do "Tema": alguém
 * ajusta uma e não sabe da outra.
 */

/** Um assunto dentro da aba, com título e uma linha de explicação. */
export function Bloco({ title, description, children }) {
  return (
    <section className="border-b border-ink-100 pb-8 last:border-0 dark:border-ink-800">
      <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
        {title}
      </h2>
      {description && (
        <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{description}</p>
      )}
      <div className="mt-4 max-w-md space-y-4">{children}</div>
    </section>
  )
}

/** Liga/desliga. O rótulo inteiro é clicável, não só o interruptor. */
export function Chave({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition',
          checked ? 'bg-accent-600' : 'bg-ink-300 dark:bg-ink-700',
        )}
      >
        <span
          className={cn(
            'block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-ink-800 dark:text-ink-100">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}

import { Interruptor } from '@/components/ui'
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

/** Uma entre poucas opções, lado a lado. `opcoes`: `[[id, nome], ...]`. */
export function Segmentos({ rotulo, opcoes, valor, onEscolher, dica }) {
  return (
    <div>
      <span className="label">{rotulo}</span>
      <div role="radiogroup" aria-label={rotulo} className="inline-flex flex-wrap rounded-md border border-ink-200 p-0.5 dark:border-ink-700">
        {opcoes.map(([id, nome]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={valor === id}
            onClick={() => onEscolher(id)}
            className={cn(
              'rounded px-3 py-1 text-sm transition',
              valor === id
                ? 'bg-accent-600 text-white'
                : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
            )}
          >
            {nome}
          </button>
        ))}
      </div>
      {dica && <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{dica}</p>}
    </div>
  )
}

/** Liga/desliga. O rótulo inteiro é clicável, não só o interruptor. */
export function Chave({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <Interruptor checked={checked} onChange={onChange} className="mt-0.5" />
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

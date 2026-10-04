import { cn } from '@/lib/utils'

/**
 * A moldura de um bloco do Início.
 *
 * Fio fino e título em versalete, como o resto do app: o bloco é uma
 * divisão da página, e não um cartão com ícone num quadradinho colorido.
 */
export default function Bloco({ id, titulo, icon: Icon, acoes, children, className, corpoClassName }) {
  return (
    <section id={id} className={cn('flex min-w-0 flex-col rounded-lg border border-ink-150 bg-white dark:border-ink-800 dark:bg-ink-900/50', className)}>
      {/* Quebra de linha no celular: título e controles não cabem lado a
          lado, e espremer o título até "C..." apagava o nome do bloco. */}
      <header className="flex min-h-[42px] flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-ink-100 px-4 py-1.5 dark:border-ink-800">
        {Icon && <Icon size={13} className="shrink-0 text-ink-400" />}
        <h2 className="secao shrink-0">{titulo}</h2>
        {acoes && <div className="ml-auto flex shrink-0 items-center gap-1">{acoes}</div>}
      </header>
      <div className={cn('min-h-0 flex-1 p-4', corpoClassName)}>{children}</div>
    </section>
  )
}

/** Abas pequenas no cabeçalho de um bloco (Recentes | Favoritos). */
export function Abas({ valor, opcoes, onTrocar, rotulo }) {
  return (
    <div role="tablist" aria-label={rotulo} className="flex rounded-md bg-ink-100 p-0.5 dark:bg-ink-800">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={valor === o.id}
          onClick={() => onTrocar(o.id)}
          className={cn(
            'rounded px-2 py-0.5 text-[11px] font-medium transition [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-1.5',
            valor === o.id
              ? 'bg-white text-ink-800 shadow-subtle dark:bg-ink-700 dark:text-ink-50'
              : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100',
          )}
        >
          {o.nome}
        </button>
      ))}
    </div>
  )
}

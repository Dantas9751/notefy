import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'
import { useBlocoDaGrade } from './GradeDoInicio'

/**
 * A moldura de um bloco do Início.
 *
 * Fio fino e título em versalete, como o resto do app: o bloco é uma
 * divisão da página, e não um cartão com ícone num quadradinho colorido.
 *
 * No Início o título é por onde o bloco se arrasta: com o mouse, em
 * qualquer ponto livre dele; no toque, segurando até o bloco subir, como
 * um ícone no celular; no teclado, pela alça à esquerda. O corpo rola
 * quando o conteúdo passa da altura escolhida.
 */
export default function Bloco({ id, titulo, icon: Icon, acoes, children, className, corpoClassName }) {
  const grade = useBlocoDaGrade()

  return (
    <section id={id} className={cn('flex h-full min-w-0 flex-col rounded-lg border border-ink-150 bg-white dark:border-ink-800 dark:bg-ink-900/50', className)}>
      {/* Quebra de linha no celular: título e controles não cabem lado a
          lado, e espremer o título até "C..." apagava o nome do bloco. */}
      <header
        onPointerDown={grade?.apertarCabecalho}
        onContextMenu={grade ? (e) => e.preventDefault() : undefined}
        className={cn(
          'relative flex min-h-[42px] flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-ink-100 px-4 py-1.5 dark:border-ink-800',
          grade && 'select-none [-webkit-touch-callout:none] [@media(pointer:fine)]:cursor-grab',
        )}
      >
        {grade && (
          // A alça mora no respiro à esquerda do título: aparecer e sumir
          // com o mouse não empurra nada do cabeçalho.
          <button
            type="button"
            data-alca-do-bloco
            onKeyDown={grade.teclarNaAlca}
            aria-label={t('Mover {nome}', { nome: titulo })}
            title={t('Arraste para mover · setas mudam a ordem · Shift+setas mudam o tamanho')}
            className="absolute left-0 top-1/2 flex h-6 w-4 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-ink-300 opacity-0 transition hover:text-ink-600 focus-visible:opacity-100 group-hover/bloco:opacity-100 dark:text-ink-600 dark:hover:text-ink-300 [@media(hover:none)]:opacity-100"
          >
            <GripVertical size={12} />
          </button>
        )}
        {Icon && <Icon size={13} className="shrink-0 text-ink-400" />}
        <h2 className="secao shrink-0">{titulo}</h2>
        {acoes && <div className="ml-auto flex shrink-0 items-center gap-1">{acoes}</div>}
      </header>
      {/* `corpoClassName` substitui o respiro de 16px em vez de somar: o `cn`
          só junta classes, e com `p-4` e `p-0` juntos quem vencia era o p-4
          (vem depois no CSS) — o "sem margem" dos blocos não valia. */}
      <div className={cn('min-h-0 flex-1 overflow-auto', corpoClassName ?? 'p-4')}>{children}</div>
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

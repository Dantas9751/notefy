import { kindMeta } from '@/lib/documents'
import { emojiDe } from '@/lib/icone'
import { cn } from '@/lib/utils'

/**
 * O emoji que a pessoa deu ao item, ou o ícone do tipo dele. `size` vale para
 * os dois, e a cor (`style`) só para o ícone do tipo: o emoji já tem as suas.
 */
export default function IconeDoItem({ item, kind, size = 16, className, style }) {
  const emoji = emojiDe(item)
  if (emoji) {
    return (
      <span
        aria-hidden
        className={cn('inline-flex shrink-0 select-none items-center justify-center leading-none', className)}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.9) }}
      >
        {emoji}
      </span>
    )
  }
  const Icone = kindMeta(kind ?? item?.kind).icon
  return <Icone size={size} className={cn('shrink-0', className)} style={style} aria-hidden />
}

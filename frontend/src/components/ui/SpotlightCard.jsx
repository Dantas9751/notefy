import { useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Cartão com um foco de luz que segue o ponteiro.
 *
 * Adaptado do SpotlightCard do reactbits.dev. O original é CSS puro —
 * `radial-gradient` posicionado por duas custom properties — então não
 * entrou dependência nenhuma: nem a biblioteca, nem GSAP, nem three.
 *
 * É o ÚNICO efeito de destaque da tela. O brilho aparece só no hover e
 * some em 300ms; quem pediu menos movimento não vê nada (a regra global
 * de `prefers-reduced-motion` em index.css zera a transição).
 *
 * O evento fica no elemento, e não numa escuta global de `mousemove`:
 * fora do cartão nada é calculado.
 */
export default function SpotlightCard({ as: Tag = 'div', className, children, ...props }) {
  const ref = useRef(null)

  const mover = (evento) => {
    const el = ref.current
    if (!el) return
    const caixa = el.getBoundingClientRect()
    // Coordenada relativa ao cartão. Escrever direto no style evita um
    // `setState` por pixel de movimento do mouse.
    el.style.setProperty('--x', `${evento.clientX - caixa.left}px`)
    el.style.setProperty('--y', `${evento.clientY - caixa.top}px`)
  }

  // `as` existe só para o cartão de item continuar sendo <article>: o
  // efeito não pode custar a semântica que a lista já tinha.
  return (
    <Tag ref={ref} onMouseMove={mover} className={cn('spotlight', className)} {...props}>
      {children}
    </Tag>
  )
}

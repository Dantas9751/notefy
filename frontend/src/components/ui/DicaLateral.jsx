import { useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * O nome ao lado do ícone, para a barra lateral recolhida. Aparece na hora,
 * no mouse e no foco do teclado — o `title` nativo demora um segundo e não
 * aparece no foco. Em portal: a lista da barra rola, e o `overflow` dela
 * cortaria a dica.
 *
 * `ativa={false}` devolve o filho sem nada em volta (barra aberta, onde o
 * nome já está escrito).
 */
export default function DicaLateral({ rotulo, ativa = true, children }) {
  const [pos, setPos] = useState(null)
  if (!ativa) return children

  const mostrar = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ left: r.right + 8, top: r.top + r.height / 2 })
  }
  const esconder = () => setPos(null)

  return (
    <div onMouseEnter={mostrar} onMouseLeave={esconder} onFocus={mostrar} onBlur={esconder} onClick={esconder}>
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={pos}
            className="pointer-events-none fixed z-[70] -translate-y-1/2 animate-fade-in whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs font-medium text-white shadow-pop dark:bg-ink-800 dark:ring-1 dark:ring-ink-700"
          >
            {rotulo}
          </span>,
          document.body,
        )}
    </div>
  )
}

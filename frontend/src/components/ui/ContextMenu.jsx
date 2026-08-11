import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Menu de botão direito.
 *
 * Renderizado em portal e reposicionado após medir, para nunca vazar da
 * janela quando aberto perto da borda direita ou inferior.
 */
export function ContextMenu({ open, x, y, onClose, items }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ x, y })

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    setPosition({
      x: Math.min(x, window.innerWidth - box.width - 8),
      y: Math.min(y, window.innerHeight - box.height - 8),
    })
  }, [open, x, y])

  useEffect(() => {
    if (!open) return undefined
    const close = () => onClose()
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    // `scroll` com capture: rolar qualquer contêiner deixaria o menu
    // ancorado num ponto que já não corresponde ao item.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60]"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
        aria-hidden
      />
      <div
        ref={ref}
        role="menu"
        style={{ left: position.x, top: position.y }}
        className="fixed z-[61] min-w-[190px] animate-fade-in rounded-md border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900"
      >
        {items.map((item, index) =>
          item.separator ? (
            <div
              key={`sep-${index}`}
              className="my-1 border-t border-ink-100 dark:border-ink-800"
            />
          ) : (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose()
                item.onClick?.()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm transition',
                'disabled:cursor-not-allowed disabled:opacity-40',
                item.danger
                  ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10'
                  : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
              )}
            >
              {item.icon && <item.icon size={14} className="shrink-0" />}
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && <span className="text-[10px] text-ink-400">{item.hint}</span>}
            </button>
          ),
        )}
      </div>
    </>,
    document.body,
  )
}

/** Estado e handler de `onContextMenu` para quem usa o menu. */
export function useContextMenu() {
  const [state, setState] = useState(null)

  const open = useCallback((event, payload) => {
    event.preventDefault()
    event.stopPropagation()
    setState({ x: event.clientX, y: event.clientY, payload })
  }, [])

  const close = useCallback(() => setState(null), [])

  return { menu: state, openMenu: open, closeMenu: close }
}

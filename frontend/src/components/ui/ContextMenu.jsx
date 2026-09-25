import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ICONE } from '@/lib/ui'

/**
 * Menu de botão direito.
 *
 * Renderizado em portal e reposicionado após medir, para nunca vazar da
 * janela quando aberto perto da borda direita ou inferior.
 *
 * Um item com `submenu` (lista no mesmo formato) abre um menu aninhado ao
 * passar o mouse — suporta qualquer profundidade ("Exportar > formatos",
 * "IA > Traduzir para > idioma"). Cada nível é um `Menu` próprio que lembra
 * qual filho está aberto, então submenus dentro de submenus funcionam sem
 * conflito de índice (a versão anterior olhava `items[submenuFor]` sempre
 * no array de topo e quebrava no segundo nível).
 */
/** Respiro mínimo entre o menu e a borda da janela. */
const MARGEM = 8

/**
 * Distância entre o item e o submenu.
 *
 * Pequena de propósito: o ponteiro atravessa esse vão para chegar no
 * submenu, e um vão largo é espaço onde ele já saiu do item sem ainda
 * ter entrado no submenu.
 */
const VAO = 2

/** Quanto o submenu sobrevive depois que o ponteiro sai do item. */
const ATRASO_PARA_FECHAR = 220

function Menu({ items, x = 0, y = 0, anchor = null, onClose, onMouseEnter }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ x, y })
  const [openChild, setOpenChild] = useState(null)
  const [childAnchor, setChildAnchor] = useState(null)
  const timerRef = useRef(null)

  useLayoutEffect(() => {
    if (!ref.current) return
    // Medir DEPOIS de renderizar é o ponto: a versão anterior posicionava
    // o submenu com um tamanho chutado (160x240) antes de ele existir. Num
    // menu mais alto que o chute, o `Math.min` o arremessava para bem
    // acima do item; perto da borda direita, o encaixava por cima do menu
    // pai. O elemento já está no DOM aqui, então dá para perguntar.
    const box = ref.current.getBoundingClientRect()
    const limiteX = window.innerWidth - MARGEM
    const limiteY = window.innerHeight - MARGEM

    let px
    if (anchor) {
      // Submenu: abre à direita do item. Sem espaço, vira para a ESQUERDA
      // — deslizar para caber deixaria o submenu sobre o menu pai, com os
      // dois disputando o mesmo clique.
      px = anchor.right + VAO
      if (px + box.width > limiteX) px = anchor.left - VAO - box.width
    } else {
      px = Math.min(x, limiteX - box.width)
    }

    // Sobe só o que faltar para caber, mantendo o topo alinhado ao item
    // sempre que possível.
    let py = anchor ? anchor.top : y
    if (py + box.height > limiteY) py = limiteY - box.height

    setPos({ x: Math.max(MARGEM, px), y: Math.max(MARGEM, py) })
  }, [x, y, anchor])

  const cancelarFechamento = useCallback(() => clearTimeout(timerRef.current), [])

  /**
   * O ponteiro vai do item ao submenu na diagonal e raspa nos itens
   * vizinhos no caminho. Fechar no instante em que ele sai do item tornava
   * o submenu inalcançável — sumia antes de o mouse chegar.
   */
  const agendarFechamento = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setOpenChild(null)
      setChildAnchor(null)
    }, ATRASO_PARA_FECHAR)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <>
      <div
        ref={ref}
        role="menu"
        onMouseEnter={onMouseEnter}
        style={{ left: pos.x, top: pos.y }}
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
              onMouseEnter={(event) => {
                // Item sem submenu fecha o aninhado — senão ele fica
                // persistido e vira um "Exportar" órfão na tela. Com
                // atraso, para não matar o submenu que o ponteiro ainda
                // está atravessando a tela para alcançar.
                if (!item.submenu) {
                  agendarFechamento()
                  return
                }
                cancelarFechamento()
                // Nomes distintos de `item`: uma const com esse nome aqui
                // sombreia o `item` do map e joga o `item.submenu` acima
                // na zona morta temporal.
                const caixaDoItem = event.currentTarget.getBoundingClientRect()
                const caixaDoMenu = ref.current.getBoundingClientRect()
                setOpenChild(index)
                // Cópia simples, e não a DOMRect: ela é viva e serve de
                // dependência do efeito que posiciona o submenu.
                //
                // O topo vem do ITEM (é nele que o submenu se alinha), mas
                // os lados vêm do MENU: o item fica alguns pixels para
                // dentro por causa do padding, e ancorar nele encostava o
                // submenu sobre a borda do menu pai.
                setChildAnchor({
                  top: caixaDoItem.top,
                  left: caixaDoMenu.left,
                  right: caixaDoMenu.right,
                })
              }}
              onClick={() => {
                if (item.submenu) return
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
              {item.icon && (
                <item.icon
                  size={ICONE.md}
                  className="shrink-0"
                  // `iconColor` serve aos menus que distinguem itens pela
                  // cor do tipo (nota, planilha, diagrama...).
                  style={item.iconColor ? { color: item.iconColor } : undefined}
                />
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {/* O atalho ao lado do rótulo é como o usuário descobre que
                  F2 existe — um atalho que só aparece na documentação não
                  existe. */}
              {item.atalho && (
                <kbd className="shrink-0 rounded border border-ink-200 px-1 font-sans text-[10px] text-ink-400 dark:border-ink-700">
                  {item.atalho}
                </kbd>
              )}
              {item.hint && <span className="text-[10px] text-ink-400">{item.hint}</span>}
              {item.submenu && <ChevronRight size={ICONE.sm} className="shrink-0 opacity-50" />}
            </button>
          ),
        )}
      </div>

      {openChild !== null && items[openChild]?.submenu && childAnchor && (
        <Menu
          items={items[openChild].submenu}
          anchor={childAnchor}
          onClose={onClose}
          // Entrar no submenu cancela o fechamento agendado pelo pai —
          // é o que permite passar por cima dos vizinhos no caminho.
          onMouseEnter={cancelarFechamento}
        />
      )}
    </>
  )
}

/** Estado e handler de `onContextMenu` para quem usa o menu. */
export function ContextMenu({ open, x, y, onClose, items }) {
  useEffect(() => {
    if (!open) return undefined
    const close = () => onClose()
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close()
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
      <Menu items={items} x={x} y={y} onClose={onClose} />
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

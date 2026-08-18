import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, X, XCircle } from 'lucide-react'
import { useTabs } from '@/context/TabsContext'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { abrirEmNovaJanela } from '@/lib/desktop'
import { kindMeta } from '@/lib/documents'
import { cn } from '@/lib/utils'

/** Segue a convenção de `lib/dnd.js`: cada arraste tem o seu MIME. */
const TAB_MIME = 'application/x-notefy-tab'

/**
 * As abas dos documentos abertos.
 *
 * Some quando não há nada aberto: quem nunca abriu um documento não ganha
 * uma faixa vazia ocupando altura. A barra só aparece quando passa a ter
 * função.
 */
export default function TabBar() {
  const { tabs, activeKey, closeTab, closeOthers, closeAll, moveTab } = useTabs()
  const navigate = useNavigate()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const [arrastando, setArrastando] = useState(null)
  const ativaRef = useRef(null)

  // Trocar de aba pelo teclado ou abrir um documento de outra tela deixa a
  // aba ativa fora da vista quando há muitas. Trazê-la de volta é o que
  // torna os atalhos utilizáveis.
  useEffect(() => {
    ativaRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeKey])

  useEffect(() => {
    const aoTeclar = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return

      // Alt e não Ctrl: Ctrl+W e Ctrl+Tab pertencem ao navegador e não
      // dá para interceptá-los. Alt+seta também não serve — é o
      // voltar/avançar do histórico, e o navegador o consome antes da
      // página. Alt+número está livre nos dois lugares.
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (activeKey) closeTab(activeKey)
        return
      }

      const numero = Number(e.key)
      if (numero >= 1 && numero <= 9 && tabs[numero - 1]) {
        e.preventDefault()
        navigate(tabs[numero - 1].path)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [activeKey, closeTab, tabs, navigate])

  if (tabs.length === 0) return null

  const menuDe = (tab) => [
    { label: 'Fechar', icon: X, hint: 'Alt+W', onClick: () => closeTab(tab.key) },
    {
      label: 'Fechar as outras',
      icon: XCircle,
      onClick: () => closeOthers(tab.key),
      disabled: tabs.length < 2,
    },
    { label: 'Fechar todas', icon: XCircle, onClick: closeAll },
    { separator: true },
    {
      label: 'Abrir em nova janela',
      icon: ExternalLink,
      onClick: () => abrirEmNovaJanela(tab.path, tab.title || 'Notefy'),
    },
  ]

  return (
    <>
      <div
        role="tablist"
        aria-label="Documentos abertos"
        className="app-tabs flex shrink-0 select-none items-stretch overflow-x-auto border-b border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/40"
      >
        {tabs.map((tab, indice) => {
          const meta = kindMeta(tab.kind)
          const Icon = meta.icon
          const ativa = tab.key === activeKey

          return (
            // `div` e não `button`: a aba carrega o próprio botão de
            // fechar dentro, e botão dentro de botão é HTML inválido —
            // além de quebrar o arraste nativo, que é como se reordena.
            <div
              key={tab.key}
              ref={ativa ? ativaRef : null}
              role="tab"
              tabIndex={0}
              aria-selected={ativa}
              title={tab.title || 'Sem título'}
              draggable
              onDragStart={(e) => {
                // A origem viaja no `dataTransfer`, e não só no estado:
                // entre o `dragstart` e o `drop` o React pode não ter
                // re-renderizado, e o handler leria a posição antiga.
                // MIME próprio, como no resto do app, para que uma aba
                // nunca seja confundida com um item sendo movido.
                e.dataTransfer.setData(TAB_MIME, String(indice))
                e.dataTransfer.effectAllowed = 'move'
                setArrastando(indice)
              }}
              onDragOver={(e) => {
                if (!Array.from(e.dataTransfer.types ?? []).includes(TAB_MIME)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                const origem = Number(e.dataTransfer.getData(TAB_MIME))
                if (Number.isNaN(origem)) return
                e.preventDefault()
                moveTab(origem, indice)
                setArrastando(null)
              }}
              onDragEnd={() => setArrastando(null)}
              onClick={() => navigate(tab.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(tab.path)
                }
              }}
              // Botão do meio fecha, como em todo navegador.
              onAuxClick={(e) => {
                if (e.button !== 1) return
                e.preventDefault()
                closeTab(tab.key)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openMenu(e, { tab })
              }}
              className={cn(
                'group flex min-w-[8rem] max-w-[13rem] shrink-0 cursor-pointer items-center gap-1.5 border-r border-ink-200 px-3 py-1.5 text-xs transition dark:border-ink-800',
                ativa
                  ? 'bg-white text-ink-900 dark:bg-ink-950 dark:text-ink-50'
                  : 'text-ink-500 hover:bg-ink-100/70 dark:text-ink-400 dark:hover:bg-ink-800/50',
                arrastando === indice && 'opacity-40',
              )}
            >
              <Icon size={13} className="shrink-0" style={{ color: meta.accent }} />
              <span className="min-w-0 flex-1 truncate">{tab.title || 'Sem título'}</span>

              {/* Ponto de não salvo ocupa o mesmo lugar do X e some ao
                  passar o mouse: sem isso, o botão de fechar empurraria o
                  título e a aba dançaria a cada hover. */}
              {tab.dirty && (
                <span
                  aria-label="Alterações não salvas"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500 group-hover:hidden"
                />
              )}
              <button
                type="button"
                aria-label={`Fechar ${tab.title || 'aba'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.key)
                }}
                className={cn(
                  'shrink-0 rounded p-0.5 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700 dark:hover:text-ink-100',
                  tab.dirty && 'hidden group-hover:block',
                )}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? menuDe(menu.payload.tab) : []}
      />
    </>
  )
}

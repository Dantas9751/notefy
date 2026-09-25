import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Columns2, ExternalLink, LayoutDashboard, Plus, X, XCircle } from 'lucide-react'
import { useTabs } from '@/context/TabsContext'
import { semQuery, useSplit } from '@/context/SplitContext'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { abrirEmNovaJanela } from '@/lib/desktop'
import { CREATABLE_KINDS, kindMeta } from '@/lib/documents'
import DestinationModal from '@/components/modals/DestinationModal'
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
  const {
    tabs,
    activeKey,
    chaveEmFoco,
    ativar,
    closeTab,
    closeOthers,
    closeAll,
    duplicarAba,
    moveTab,
  } = useTabs()
  const { abrirAoLado, painel, fecharPainel } = useSplit()
  const navigate = useNavigate()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const [arrastando, setArrastando] = useState(null)
  // Posição do menu do `+`, medida na hora de abrir. Guardar a coordenada
  // — e não um booleano — é o que permite renderizá-lo em portal, fora do
  // contêiner que rola e recorta.
  const [novoEm, setNovoEm] = useState(null)
  const maisRef = useRef(null)
  // Tipo escolhido no `+`, esperando a pasta de destino. Todo documento
  // mora numa pasta, então o seletor é parte de criar — não um campo a
  // ajustar depois.
  const [destino, setDestino] = useState(null)
  const ativaRef = useRef(null)

  // Trocar de aba pelo teclado ou abrir um documento de outra tela deixa a
  // aba ativa fora da vista quando há muitas. Trazê-la de volta é o que
  // torna os atalhos utilizáveis.
  useEffect(() => {
    ativaRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeKey])

  /** Aba da esquerda e painel lateral mostram a mesma rota? */
  const painelMostra = (path) => painel && semQuery(path) === painel.path

  /**
   * Fecha a aba e, se o painel lateral está mostrando a MESMA rota,
   * fecha o painel junto. Sem isto, fechar a aba de um documento que
   * estava aberto ao lado deixava metade da tela presa num spinner —
   * o painel continuava vivo, órfão, sem aba que o fechasse.
   */
  const aoFechar = (tab) => {
    if (painelMostra(tab.path)) fecharPainel()
    closeTab(tab.key)
  }

  useEffect(() => {
    const aoTeclar = (e) => {
      // Ctrl+Q fecha a aba em foco. Ctrl+W pertence ao navegador (fecha
      // a aba do navegador) e não dá para interceptá-lo; Alt+W dependia
      // do layout do teclado (alguns mapeiam Alt+W para a seta de cima,
      // e o navegador engole o Alt antes da página). Ctrl+Q fica livre
      // no Chrome e no Edge.
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        const tecla = (e.key || '').toLowerCase()
        if (tecla === 'q' || e.code === 'KeyQ') {
          e.preventDefault()
          // `chaveEmFoco` e não `activeKey`: em rota não-abrível (ajustes,
          // busca, rota com query) o `activeKey` é null e o atalho só
          // piscava o realce da aba sem fechar coisa alguma.
          const ativa = tabs.find((t) => t.key === chaveEmFoco)
          if (ativa) aoFechar(ativa)
        }
        return
      }

      // Alt+número ativa a n-ésima aba. Alt não é Ctrl: Ctrl+Tab é do
      // navegador, e Alt+seta é o voltar/avançar do histórico — só o
      // número fica livre nos dois lugares.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const numero = Number(e.key)
        if (numero >= 1 && numero <= 9 && tabs[numero - 1]) {
          e.preventDefault()
          ativar(tabs[numero - 1].key)
          navigate(tabs[numero - 1].path)
        }
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [chaveEmFoco, aoFechar, tabs, navigate])

  /** Abre o menu do `+` ancorado no botão, sem deixá-lo sair da janela. */
  const abrirMenuNovo = () => {
    if (novoEm) {
      setNovoEm(null)
      return
    }
    const caixa = maisRef.current?.getBoundingClientRect()
    if (!caixa) return
    const LARGURA = 208
    setNovoEm({
      x: Math.min(caixa.left, window.innerWidth - LARGURA - 8),
      y: caixa.bottom + 2,
    })
  }

  if (tabs.length === 0) return null

  const menuDe = (tab) => [
    { label: 'Fechar', icon: X, hint: 'Ctrl+Q', onClick: () => aoFechar(tab) },
    {
      label: 'Fechar as outras',
      icon: XCircle,
      onClick: () => {
        closeOthers(tab.key)
        // Se o painel mostra uma rota que vai deixar de ter aba, ele
        // vira órfão — metade da tela presa num item sem dono.
        if (painel && semQuery(tab.path) !== painel.path) fecharPainel()
      },
      disabled: tabs.length < 2,
    },
    {
      label: 'Fechar todas',
      icon: XCircle,
      onClick: () => {
        closeAll()
        fecharPainel()
      },
    },
    { separator: true },
    {
      label: 'Abrir ao lado',
      icon: Columns2,
      disabled: semQuery(tab.path).endsWith('/new'),
      onClick: () => {
        // Sem `|| 'Sem título'`: o painel mostra o path quando não há
        // nome, e "Sem título" como título fixo deixava uma aba inútil
        // que só confundia.
        abrirAoLado({ path: tab.path, title: tab.title ?? null })
      },
    },
    {
      label: 'Abrir em nova janela',
      icon: ExternalLink,
      onClick: () => abrirEmNovaJanela(tab.path, tab.title || 'Notefy'),
    },
  ]

  /** Menu de contexto da aba do painel lateral. */
  const menuDePainel = (p) => [
    {
      label: 'Fechar painel',
      icon: X,
      onClick: () => fecharPainel(),
    },
    { separator: true },
    {
      label: 'Abrir em nova janela',
      icon: ExternalLink,
      onClick: () => abrirEmNovaJanela(p.path, p.title || 'Notefy'),
    },
  ]

  const itensDoMenu = (payload) => (payload.painel ? menuDePainel(payload.painel) : menuDe(payload.tab))

  return (
    <>
      <div
        role="tablist"
        aria-label="Documentos abertos"
        className="flex min-w-0 flex-1 select-none items-stretch overflow-x-auto"
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
              onClick={() => {
                // Com abas duplicadas (dois "Início"), navegar para o
                // path não diz QUAL delas ativa — o desempate é a última
                // ativada na mão, registrada aqui.
                ativar(tab.key)
                navigate(tab.path)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  ativar(tab.key)
                  navigate(tab.path)
                }
              }}
              // Botão do meio fecha, como em todo navegador.
              onAuxClick={(e) => {
                if (e.button !== 1) return
                e.preventDefault()
                aoFechar(tab)
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
                  aoFechar(tab)
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

        {/* Aba do painel lateral: só o X fecha.
            Não tem rota — a aba existe pra dar ao fechamento do painel o
            mesmo lugar onde a abertura acontece, e é onde todo usuário de
            navegador espera encontrar um X. Clicar no corpo dela NÃO
            fecha: fechar por engano custa a viagem inteira do painel, e
            não há "reabrir" que a devolva. O botão direito abre o próprio
            menu da aba do painel (fechar, abrir em nova janela). */}
        {painel && (
          <div
            role="tab"
            tabIndex={0}
            aria-selected={false}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openMenu(e, { painel })
            }}
            className={cn(
              'group flex min-w-[8rem] max-w-[13rem] shrink-0 cursor-default items-center gap-1.5 border-r border-ink-200 px-3 py-1.5 text-xs transition dark:border-ink-800',
              'text-ink-500 dark:text-ink-400',
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
              <Columns2 size={12} className="shrink-0 text-ink-400" />
              {painel.title || painel.path || 'Ao lado'}
            </span>
            <button
              type="button"
              aria-label="Fechar painel"
              onClick={(e) => {
                e.stopPropagation()
                fecharPainel()
              }}
              className="shrink-0 rounded p-0.5 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700 dark:hover:text-ink-100"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Novo documento, logo depois da última aba — onde todo
            navegador o põe, e onde a mão já está quando se trabalha com
            abas. Rola JUNTO com elas, e é por isso que o menu precisa
            sair em portal: aqui dentro o `overflow-x-auto` da fileira o
            recortaria na altura da barra. */}
        <button
          ref={maisRef}
          type="button"
          onClick={abrirMenuNovo}
          title="Novo documento"
          aria-label="Novo documento"
          aria-expanded={!!novoEm}
          className="flex shrink-0 items-center border-r border-ink-200 px-2.5 text-ink-400 transition hover:bg-ink-100/70 hover:text-accent-600 dark:border-ink-800 dark:hover:bg-ink-800/50"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Mesmo componente dos outros menus do app. A versão anterior era
          uma cópia da marcação do ContextMenu, e cópia incompleta: não
          fechava com Esc, nem ao rolar, nem ao redimensionar, e não tinha
          ajuste vertical. */}
      <ContextMenu
        open={!!novoEm}
        x={novoEm?.x ?? 0}
        y={novoEm?.y ?? 0}
        onClose={() => setNovoEm(null)}
        items={[
          {
            label: 'Início',
            icon: LayoutDashboard,
            onClick: () => {
              // Segunda aba de Início: navegar só focaria a que já
              // existe — o `+` é o pedido explícito de uma nova.
              duplicarAba('/')
              navigate('/')
            },
          },
          { separator: true },
          ...CREATABLE_KINDS.map((kind) => {
            const meta = kindMeta(kind)
            return {
              label: meta.label,
              icon: meta.icon,
              iconColor: meta.accent,
              onClick: () => setDestino(kind),
            }
          }),
        ]}
      />


      <DestinationModal
        open={!!destino}
        kind={destino}
        onClose={() => setDestino(null)}
        onPick={(folderId) => {
          const kind = destino
          setDestino(null)
          navigate(`${kindMeta(kind).route}/new?folder=${folderId}`)
        }}
      />

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? itensDoMenu(menu.payload) : []}
      />
    </>
  )
}

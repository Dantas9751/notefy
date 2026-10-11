import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Columns3,
  Eye,
  EyeOff,
  Frame,
  Group,
  Image,
  Lock,
  Minus,
  Plus,
  Rows3,
  Square,
  Type,
  Unlock,
} from 'lucide-react'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { nomeDoTipo, temLayout } from '@/lib/design'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Esquerda do editor: páginas em cima, camadas embaixo — o painel do Figma.
 *
 * As camadas aparecem de cima para baixo na ordem da PILHA (a de cima
 * na tela é a primeira da lista), o contrário do array, que vai de baixo
 * para cima. Arrastar uma linha reordena ou muda de pai.
 */

const MIME = 'application/x-notefy-camadas'

function iconeDa(camada) {
  if (camada.type === 'frame') return temLayout(camada) ? (camada.layout.mode === 'column' ? Rows3 : Columns3) : Frame
  if (camada.type === 'group') return Group
  if (camada.type === 'text') return Type
  if (camada.type === 'ellipse') return Circle
  if (camada.type === 'line') return Minus
  if (camada.fills?.some((f) => f.type === 'image')) return Image
  return Square
}

export const nomeDaCamada = (camada) => camada.name || (camada.type === 'text' && camada.text?.slice(0, 40)) || nomeDoTipo(camada.type)

function Renomear({ inicial, onFim }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      defaultValue={inicial}
      onBlur={(e) => onFim(e.target.value.trim())}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') onFim(null)
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-5 min-w-0 flex-1 rounded border border-accent-500 bg-white px-1 text-xs outline-none dark:bg-ink-900"
    />
  )
}

export default function PainelDeCamadas({
  paginas,
  paginaId,
  onPagina,
  onNovaPagina,
  onRenomearPagina,
  onDuplicarPagina,
  onExcluirPagina,
  camadas,
  selecao,
  onSelecionar,
  hover,
  onHover,
  onAlternar,
  onRenomear,
  renomeando,
  onRenomeando,
  onSoltar,
  somenteLeitura,
}) {
  const [abertas, setAbertas] = useState(() => new Map())
  const [paginasAbertas, setPaginasAbertas] = useState(true)
  const [renomeandoPagina, setRenomeandoPagina] = useState(null)
  const [soltando, setSoltando] = useState(null)
  const { menu, openMenu, closeMenu } = useContextMenu()
  const listaRef = useRef(null)
  const sel = useMemo(() => new Set(selecao), [selecao])

  // Ancestrais da seleção abrem sozinhos: selecionar no quadro mostra a camada na lista.
  const ancestrais = useMemo(() => {
    const ids = new Set()
    const andar = (lista, trilha) => {
      for (const c of lista) {
        if (sel.has(c.id)) trilha.forEach((id) => ids.add(id))
        if (c.children) andar(c.children, [...trilha, c.id])
      }
    }
    andar(camadas, [])
    return ids
  }, [camadas, sel])

  useEffect(() => {
    if (!selecao.length) return
    listaRef.current?.querySelector(`[data-linha="${CSS.escape(selecao.at(-1))}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selecao])

  const aberta = (c, profundidade) => abertas.get(c.id) ?? (ancestrais.has(c.id) || (profundidade === 0 && c.type === 'frame'))

  const linhas = []
  const montar = (lista, profundidade, dentroDeSelecionada) => {
    for (const c of [...lista].reverse()) {
      linhas.push({ camada: c, profundidade, dentroDeSelecionada })
      if (c.children?.length && aberta(c, profundidade)) montar(c.children, profundidade + 1, dentroDeSelecionada || sel.has(c.id))
    }
  }
  montar(camadas, 0, false)
  // A linha que entra no Tab: a selecionada, se estiver à vista (pai recolhido a esconde), senão a primeira.
  const idDoFoco = linhas.some((l) => l.camada.id === selecao.at(-1)) ? selecao.at(-1) : linhas[0]?.camada.id

  const posicaoDoSoltar = (e, camada) => {
    const caixa = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - caixa.top) / caixa.height
    if (camada.type === 'frame' || camada.type === 'group') return y < 0.25 ? 'acima' : y > 0.75 ? 'abaixo' : 'dentro'
    return y < 0.5 ? 'acima' : 'abaixo'
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      {/* Páginas */}
      <div className="shrink-0 border-b border-ink-200 dark:border-ink-800">
        <header className="flex h-9 items-center justify-between px-3">
          <button
            type="button"
            onClick={() => setPaginasAbertas((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-ink-700 dark:text-ink-200"
          >
            {paginasAbertas ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {t('Páginas')}
          </button>
          {!somenteLeitura && (
            <button
              type="button"
              title={t('Nova página')}
              aria-label={t('Nova página')}
              onClick={onNovaPagina}
              className="rounded p-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              <Plus size={14} />
            </button>
          )}
        </header>
        {paginasAbertas && (
          <ul className="max-h-40 overflow-y-auto pb-1.5">
            {paginas.map((p) => (
              <li key={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onPagina(p.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onPagina(p.id)}
                  onDoubleClick={() => !somenteLeitura && setRenomeandoPagina(p.id)}
                  onContextMenu={(e) => !somenteLeitura && openMenu(e, { pagina: p })}
                  className={cn(
                    'mx-1.5 flex h-7 items-center rounded-md px-2 transition [@media(pointer:coarse)]:h-10',
                    p.id === paginaId
                      ? 'font-medium text-ink-900 dark:text-ink-50'
                      : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
                  )}
                >
                  {renomeandoPagina === p.id ? (
                    <Renomear
                      inicial={p.name}
                      onFim={(nome) => {
                        setRenomeandoPagina(null)
                        if (nome) onRenomearPagina(p.id, nome)
                      }}
                    />
                  ) : (
                    <span className="truncate">{p.name}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Camadas */}
      <header className="flex h-9 shrink-0 items-center px-3 text-[11px] font-semibold text-ink-700 dark:text-ink-200">{t('Camadas')}</header>
      <div
        ref={listaRef}
        role="tree"
        aria-label={t('Camadas')}
        aria-multiselectable="true"
        className="min-h-0 flex-1 overflow-y-auto pb-6"
        onPointerLeave={() => onHover(null)}
      >
        {!linhas.length && (
          <p className="px-3 py-2 leading-relaxed text-ink-400">{t('Use as ferramentas da barra de baixo para desenhar. Comece por um Frame (F): ele é a sua tela.')}</p>
        )}
        {linhas.map(({ camada: c, profundidade, dentroDeSelecionada }) => {
          const Icone = iconeDa(c)
          const selecionada = sel.has(c.id)
          const marcaSoltar = soltando?.id === c.id ? soltando.posicao : null
          return (
            <div
              key={c.id}
              data-linha={c.id}
              role="treeitem"
              aria-selected={selecionada}
              aria-level={profundidade + 1}
              aria-expanded={c.children?.length ? aberta(c, profundidade) : undefined}
              // Uma linha só entra no Tab (a selecionada, ou a primeira): as setas andam entre elas.
              tabIndex={c.id === idDoFoco ? 0 : -1}
              onKeyDown={(e) => {
                if (renomeando === c.id || e.target !== e.currentTarget) return
                const vai = (alvo) => {
                  const linha = alvo && listaRef.current?.querySelector(`[data-linha="${CSS.escape(alvo.camada.id)}"]`)
                  if (!linha) return
                  e.preventDefault()
                  e.stopPropagation()
                  linha.focus()
                  onSelecionar(alvo.camada.id, { somar: e.shiftKey })
                }
                const i = linhas.findIndex((l) => l.camada.id === c.id)
                if (e.key === 'ArrowDown') vai(linhas[i + 1])
                else if (e.key === 'ArrowUp') vai(linhas[i - 1])
                else if (e.key === 'Home') vai(linhas[0])
                else if (e.key === 'End') vai(linhas.at(-1))
                else if (e.key === 'ArrowRight' && c.children?.length && !aberta(c, profundidade)) {
                  e.preventDefault()
                  setAbertas((m) => new Map(m).set(c.id, true))
                } else if (e.key === 'ArrowLeft' && c.children?.length && aberta(c, profundidade)) {
                  e.preventDefault()
                  setAbertas((m) => new Map(m).set(c.id, false))
                } else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onSelecionar(c.id, { somar: e.ctrlKey || e.metaKey })
                } else if (e.key === 'F2' && !somenteLeitura) {
                  e.preventDefault()
                  onRenomeando(c.id)
                }
              }}
              draggable={!somenteLeitura && renomeando !== c.id}
              onDragStart={(e) => {
                const ids = selecionada ? selecao : [c.id]
                e.dataTransfer.setData(MIME, JSON.stringify(ids))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(MIME)) return
                e.preventDefault()
                setSoltando({ id: c.id, posicao: posicaoDoSoltar(e, c) })
              }}
              onDragLeave={() => setSoltando(null)}
              onDrop={(e) => {
                e.preventDefault()
                setSoltando(null)
                const ids = JSON.parse(e.dataTransfer.getData(MIME) || '[]')
                if (ids.length && !ids.includes(c.id)) onSoltar(ids, c.id, posicaoDoSoltar(e, c))
              }}
              onClick={(e) => onSelecionar(c.id, { somar: e.shiftKey || e.ctrlKey || e.metaKey })}
              onDoubleClick={() => !somenteLeitura && onRenomeando(c.id)}
              onPointerEnter={() => onHover(c.id)}
              className={cn(
                'group relative flex h-7 cursor-default items-center gap-1 pr-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500 [@media(pointer:coarse)]:h-10',
                selecionada
                  ? 'bg-accent-100 text-ink-900 dark:bg-accent-500/20 dark:text-ink-50'
                  : dentroDeSelecionada
                    ? 'bg-accent-50 text-ink-700 dark:bg-accent-500/5 dark:text-ink-200'
                    : hover === c.id
                      ? 'bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-100'
                      : 'text-ink-700 dark:text-ink-300',
                c.visible === false && 'text-ink-400 dark:text-ink-500',
              )}
              style={{ paddingLeft: 6 + profundidade * 14 }}
            >
              {marcaSoltar === 'acima' && <span className="absolute inset-x-1 top-0 h-0.5 bg-accent-500" />}
              {marcaSoltar === 'abaixo' && <span className="absolute inset-x-1 bottom-0 h-0.5 bg-accent-500" />}
              {marcaSoltar === 'dentro' && <span className="pointer-events-none absolute inset-0 rounded border-2 border-accent-500" />}
              {c.children?.length ? (
                <button
                  type="button"
                  aria-label={aberta(c, profundidade) ? t('Recolher') : t('Expandir')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setAbertas((m) => new Map(m).set(c.id, !aberta(c, profundidade)))
                  }}
                  className="flex h-5 w-4 shrink-0 items-center justify-center text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
                >
                  {aberta(c, profundidade) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <Icone size={13} className={cn('shrink-0', c.type === 'frame' && profundidade === 0 ? 'text-ink-500' : 'text-ink-400')} />
              {renomeando === c.id ? (
                <Renomear
                  inicial={nomeDaCamada(c)}
                  onFim={(nome) => {
                    onRenomeando(null)
                    if (nome) onRenomear(c.id, nome)
                  }}
                />
              ) : (
                <span className={cn('min-w-0 flex-1 truncate', profundidade === 0 && c.type === 'frame' && 'font-medium')}>{nomeDaCamada(c)}</span>
              )}
              {!somenteLeitura && (
                <span
                  className={cn(
                    'flex shrink-0 items-center',
                    !(c.locked || c.visible === false) && 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
                  )}
                >
                  <button
                    type="button"
                    title={c.locked ? t('Destravar') : t('Travar')}
                    aria-label={c.locked ? t('Destravar') : t('Travar')}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAlternar(c.id, 'locked')
                    }}
                    className={cn('rounded p-1 hover:bg-ink-200 dark:hover:bg-ink-700', !c.locked && 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100')}
                  >
                    {c.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                  <button
                    type="button"
                    title={c.visible === false ? t('Mostrar') : t('Ocultar')}
                    aria-label={c.visible === false ? t('Mostrar') : t('Ocultar')}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAlternar(c.id, 'visible')
                    }}
                    className={cn('rounded p-1 hover:bg-ink-200 dark:hover:bg-ink-700', c.visible !== false && 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100')}
                  >
                    {c.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload?.pagina
            ? [
                { label: t('Renomear'), onClick: () => setRenomeandoPagina(menu.payload.pagina.id) },
                { label: t('Duplicar página'), onClick: () => onDuplicarPagina(menu.payload.pagina.id) },
                { separator: true },
                {
                  label: t('Excluir página'),
                  danger: true,
                  disabled: paginas.length < 2,
                  onClick: () => onExcluirPagina(menu.payload.pagina.id),
                },
              ]
            : []
        }
      />
    </div>
  )
}

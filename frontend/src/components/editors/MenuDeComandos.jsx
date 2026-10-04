import { useLayoutEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Pilcrow,
  Quote,
  SeparatorHorizontal,
  Table2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

const ICONES = {
  texto: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  checklist: ListChecks,
  ul: List,
  ol: ListOrdered,
  table: Table2,
  code: Code2,
  citacao: Quote,
  divisor: SeparatorHorizontal,
  imagem: ImagePlus,
  link: Link2,
  data: CalendarDays,
}

/**
 * O menu do "/": digitar uma barra no começo da linha (ou depois de um
 * espaço) lista o que dá para inserir ali, e o resto do que se digita
 * filtra — "/tab" e Enter é uma tabela. É o caminho sem mouse para tudo
 * o que antes só nascia clicando entre os blocos.
 *
 * Fica preso ao cursor, com posição FIXA: o pedaço de texto onde a
 * pessoa digita pode estar em qualquer altura da folha, e abre para cima
 * quando embaixo não cabe (o teclado do celular costuma morar ali).
 */
export default function MenuDeComandos({ ancora, itens, ativo, onEscolher, onPassar }) {
  const ref = useRef(null)
  const listaRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!ref.current || !ancora) return
    const altura = ref.current.offsetHeight
    const largura = ref.current.offsetWidth
    const limite = window.visualViewport?.height ?? window.innerHeight
    const cabeEmbaixo = ancora.bottom + 6 + altura <= limite - 8
    setPos({
      top: cabeEmbaixo ? ancora.bottom + 6 : Math.max(8, ancora.top - 6 - altura),
      left: Math.min(Math.max(8, ancora.left - 8), window.innerWidth - largura - 8),
    })
  }, [ancora, itens.length])

  // O item ativo sempre à vista quando a seta passa da borda da lista.
  useLayoutEffect(() => {
    listaRef.current?.querySelector('[data-ativo]')?.scrollIntoView({ block: 'nearest' })
  }, [ativo])

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={t('Inserir')}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="fixed z-[80] w-64 animate-fade-in overflow-hidden rounded-lg border border-ink-200 bg-white shadow-pop dark:border-ink-700 dark:bg-ink-900"
    >
      {itens.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-ink-400">{t('Nada com esse nome. Esc fecha.')}</p>
      ) : (
        <ul ref={listaRef} className="max-h-72 overflow-y-auto p-1">
          {itens.map((item, i) => {
            const Icone = ICONES[item.id] ?? Pilcrow
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === ativo}
                  data-ativo={i === ativo ? '' : undefined}
                  // Sem roubar o foco: o cursor continua no texto, onde o
                  // comando vai agir.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => onPassar(i)}
                  onClick={() => onEscolher(item)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition [@media(pointer:coarse)]:py-2.5',
                    i === ativo ? 'bg-ink-100 dark:bg-ink-800' : 'hover:bg-ink-50 dark:hover:bg-ink-800/60',
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-300">
                    <Icone size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink-800 dark:text-ink-100">{item.rotulo}</span>
                    <span className="block truncate text-[11px] text-ink-400">{item.dica}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

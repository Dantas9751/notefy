import { useNavigate } from 'react-router-dom'
import { ColorDot } from '@/components/ui'
import DocumentCard from '@/components/DocumentCard'
import FavoriteButton from '@/components/FavoriteButton'
import { propsDoCampo } from '@/hooks/useRenomear'
import { limparDragPayload, setDragPayload } from '@/lib/dnd'
import { documentPath, kindMeta } from '@/lib/documents'
import { cn, formatRelative } from '@/lib/utils'

/**
 * Os itens do Início em três desenhos, à escolha:
 *
 * - **Cartões**: a grade de sempre, com o começo do texto.
 * - **Pilha**: um embaixo do outro, largos, com duas linhas do texto — o
 *   jeito de ler várias notas de relance, como a lista com trechos do
 *   Evernote.
 * - **Lista**: uma linha por item, só nome, lugar e quando — para quem
 *   tem muita coisa e só quer achar.
 *
 * Seleção, menu e arrastar para uma pasta funcionam igual nos três: quem
 * decide é a tela (`onClickCapture`, `onContextMenu`), aqui só desenha.
 */
export default function ItensDoInicio({ itens, layout, selecionados, renomear, onClickCapture, onContextMenu }) {
  const navigate = useNavigate()

  if (layout === 'cartoes') {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {itens.map((doc) => {
          const marcado = selecionados.includes(`document:${doc.id}`)
          return (
            <div
              key={doc.id}
              onClickCapture={(e) => onClickCapture(doc, e)}
              onContextMenu={(e) => onContextMenu(doc, e)}
              className={cn(
                'cursor-pointer overflow-hidden rounded-xl transition',
                marcado && 'bg-accent-50/50 ring-2 ring-accent-500 dark:bg-accent-500/10',
              )}
            >
              <DocumentCard
                document={doc}
                showFolder
                selecionado={marcado}
                renomeando={renomear.estaEditando(doc.id)}
                onRename={() => renomear.abrir(doc.id)}
                erroDeRenomear={renomear.estaEditando(doc.id) ? renomear.erro : null}
                camposDeRenomear={propsDoCampo({
                  valorAtual: doc.title,
                  endpoint: `/documents/${doc.id}/`,
                  campo: 'title',
                  gravar: renomear.gravar,
                  fechar: renomear.fechar,
                })}
              />
            </div>
          )
        })}
      </div>
    )
  }

  const pilha = layout === 'pilha'
  return (
    <ul className={cn('divide-y divide-ink-100 dark:divide-ink-800', !pilha && '-mx-2')}>
      {itens.map((doc) => {
        const meta = kindMeta(doc.kind)
        const Icon = meta.icon
        const marcado = selecionados.includes(`document:${doc.id}`)
        return (
          <li
            key={doc.id}
            draggable
            onDragStart={(e) =>
              setDragPayload(e, { type: 'document', id: doc.id, title: doc.title, folderId: doc.folder, kind: doc.kind })
            }
            onDragEnd={() => limparDragPayload()}
            onClickCapture={(e) => onClickCapture(doc, e)}
            onClick={() => navigate(documentPath(doc))}
            onContextMenu={(e) => onContextMenu(doc, e)}
            className={cn(
              'group flex cursor-pointer gap-3 rounded-md px-2 transition',
              pilha ? 'items-start py-3' : 'items-center py-2 [@media(pointer:coarse)]:py-3',
              marcado ? 'bg-accent-100 dark:bg-accent-500/20' : 'hover:bg-ink-50 dark:hover:bg-ink-800/50',
            )}
          >
            <Icon size={pilha ? 16 : 14} className={cn('shrink-0', pilha && 'mt-0.5')} style={{ color: doc.color || meta.accent }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={cn('truncate text-ink-800 first-letter:uppercase group-hover:text-accent-700 dark:text-ink-100 dark:group-hover:text-accent-300', pilha ? 'titulo text-[15px]' : 'text-[13.5px]')}>
                  {doc.title}
                </span>
                {!pilha && doc.category && (
                  <span className="hidden min-w-0 items-center gap-1 truncate text-[11px] text-ink-400 sm:flex">
                    <ColorDot color={doc.category.color} size={6} />
                    {doc.folder_name || doc.category.name}
                  </span>
                )}
              </div>
              {pilha && doc.excerpt && doc.kind !== 'file' && (
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">{doc.excerpt}</p>
              )}
              {pilha && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-400">
                  <span>{meta.label}</span>
                  {doc.category && (
                    <span className="flex items-center gap-1">
                      <ColorDot color={doc.category.color} size={6} />
                      {doc.category.name}
                      {doc.folder_name && ` / ${doc.folder_name}`}
                    </span>
                  )}
                  <span>{formatRelative(doc.updated_at)}</span>
                </p>
              )}
            </div>
            {!pilha && <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{formatRelative(doc.updated_at)}</span>}
            <FavoriteButton endpoint={`/documents/${doc.id}/`} value={doc.is_favorite} className={cn(pilha && 'mt-0.5')} />
          </li>
        )
      })}
    </ul>
  )
}

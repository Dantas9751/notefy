import { FolderOpen } from 'lucide-react'
import FavoriteButton from '@/components/FavoriteButton'
import { CampoDeRenomear } from '@/hooks/useRenomear'
import { limparDragPayload, setDragPayload } from '@/lib/dnd'
import { cn, formatRelative } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * O cartão de uma pasta, o mesmo na categoria e dentro de outra pasta:
 * nome (que vira campo no F2, no duplo clique ou no "Renomear"),
 * descrição, contagem, data e a estrela.
 *
 * Clique, botão direito e o que vai no arraste são da tela, que sabe a
 * seleção e de onde a pasta sai.
 */
export default function PastaCard({ pasta, selecionada, renomear, arraste, onClickCapture, onContextMenu, onFavoritou }) {
  const renomeando = !!renomear?.estaEditando(pasta.id)

  return (
    <article
      draggable={!renomeando}
      onDragStart={(event) => setDragPayload(event, arraste)}
      onDragEnd={() => limparDragPayload()}
      onClickCapture={onClickCapture}
      // Duplo clique renomeia só o que já está selecionado, como no
      // cartão de documento: num cartão solto o primeiro clique já abriu.
      onDoubleClick={(event) => {
        if (!renomear || !selecionada) return
        event.preventDefault()
        renomear.abrir(pasta.id)
      }}
      onContextMenu={onContextMenu}
      className={cn(
        'card group flex cursor-pointer items-start gap-3 p-4 transition active:cursor-grabbing',
        selecionada && 'bg-accent-50/50 ring-2 ring-accent-500 dark:bg-accent-500/10',
      )}
    >
      <FolderOpen
        size={18}
        className="mt-0.5 shrink-0 text-ink-400"
        style={pasta.color ? { color: pasta.color } : undefined}
      />
      <div className="min-w-0 flex-1">
        {renomeando ? (
          <CampoDeRenomear
            renomear={renomear}
            valorAtual={pasta.name}
            endpoint={`/folders/${pasta.id}/`}
            className="titulo text-[15px]"
          />
        ) : (
          <p className="titulo truncate text-[15px] group-hover:text-accent-700 dark:group-hover:text-accent-300">
            {pasta.name}
          </p>
        )}
        {pasta.description && (
          <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-500 dark:text-ink-400">{pasta.description}</p>
        )}
        <p className="mt-1.5 text-[11px] text-ink-400">
          {t('{itens} item(ns) · {subpastas} subpasta(s) ·', { itens: pasta.document_count, subpastas: pasta.child_count })}{' '}
          {formatRelative(pasta.updated_at)}
        </p>
      </div>
      <FavoriteButton endpoint={`/folders/${pasta.id}/`} value={pasta.is_favorite} onChanged={onFavoritou} />
    </article>
  )
}

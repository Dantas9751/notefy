import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Folder as FolderIcon, Star } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { kindMeta } from '@/lib/documents'
import { cn, formatRelative } from '@/lib/utils'

/**
 * Tudo que está com a estrela, cruzando documentos e pastas.
 *
 * O servidor já devolve a lista pronta no formato da busca global
 * (`type`, `title`, `subtitle`, `url`), então aqui é só desenhar — sem
 * juntar duas requisições nem reordenar na tela.
 */
export default function FavoritesView() {
  const { data, loading, error, refetch } = useFetch('/favorites/')

  // Favoritar em qualquer lugar do app muda esta lista. É o mesmo evento
  // que a sidebar escuta.
  useEffect(() => {
    window.addEventListener('notefy:favorites-changed', refetch)
    return () => window.removeEventListener('notefy:favorites-changed', refetch)
  }, [refetch])

  const itens = data?.results ?? []

  return (
    <>
      <PageHeader
        title="Favoritos"
        subtitle={
          itens.length
            ? `${itens.length} item(ns) marcados com a estrela.`
            : 'O que você marcar com a estrela aparece aqui.'
        }
      />

      <PageBody>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : itens.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Nenhum favorito ainda"
            description="Clique na estrela de um item ou de uma pasta para fixá-lo aqui e no topo da pasta onde ele mora."
          />
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
            {itens.map((item, i) => {
              // Pasta tem ícone próprio; o resto é `kind` de documento.
              const meta = item.type === 'folder' ? null : kindMeta(item.type)
              const Icon = meta?.icon ?? FolderIcon

              return (
                <li key={`${item.type}:${item.id}`}>
                  <Link
                    to={item.url}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-900',
                      i === 0 && 'rounded-t-[9px]',
                      i === itens.length - 1 && 'rounded-b-[9px]',
                    )}
                  >
                    <Icon
                      size={16}
                      className="shrink-0"
                      style={meta ? { color: meta.accent } : undefined}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="truncate text-xs text-ink-400">{item.subtitle}</p>
                      )}
                    </div>

                    <Star size={13} className="shrink-0 fill-amber-400 text-amber-400" />

                    <span className="shrink-0 text-[11px] text-ink-400">
                      {formatRelative(item.updated_at)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PageBody>
    </>
  )
}

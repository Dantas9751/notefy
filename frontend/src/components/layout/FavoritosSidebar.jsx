import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Folder as FolderIcon } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { kindMeta } from '@/lib/documents'
import { ICONE } from '@/lib/ui'
import { cn } from '@/lib/utils'
import FavoriteButton from '@/components/FavoriteButton'

/**
 * Quantos favoritos a barra mostra sem pedir licença.
 *
 * O teto não é sobre caber na tela: a barra já rola, e a seção fica no
 * fim dela. É sobre quanto da rolagem os favoritos podem tomar antes de
 * empurrar a árvore de categorias para fora da vista. Seis é onde a
 * lista ainda se lê de relance; do sétimo em diante ela vira uma segunda
 * árvore competindo com a primeira.
 *
 * O resto abre atrás do "Exibir mais", numa caixa com rolagem PRÓPRIA:
 * a barra inteira rolando levaria as categorias junto.
 */
const VISIVEIS = 6

/**
 * Os favoritos, na barra lateral e em nenhum outro lugar.
 *
 * Existia uma PÁGINA `/favorites` desenhando a mesma lista. Uma tela
 * inteira para oito links é uma parada a mais no caminho de quem só
 * queria chegar no item: a barra já está aberta, já mostra os mesmos
 * nomes e está visível de qualquer lugar do app. A página saiu, e o que
 * ela tinha de exclusivo — poder desfavoritar sem abrir o item — virou a
 * estrela à direita de cada linha.
 */
export default function FavoritosSidebar({ aoAbrirMenu }) {
  const [expandido, setExpandido] = useState(false)
  const { pathname } = useLocation()

  // Uma chamada só, servida já ordenada e com pastas e itens misturados.
  // A barra fazia duas (`/documents/` e `/folders/`) e concatenava, o que
  // colocava toda pasta na frente de todo documento: com a lista cortada
  // em seis, sete pastas favoritas escondiam os itens.
  const { data, loading, setData, refetch } = useFetch('/favorites/')

  // Favoritar acontece longe daqui: no cartão da pasta, no cabeçalho do
  // editor, no menu de contexto. O evento é o mesmo que o botão dispara.
  useEffect(() => {
    window.addEventListener('notefy:favorites-changed', refetch)
    return () => window.removeEventListener('notefy:favorites-changed', refetch)
  }, [refetch])

  const itens = data?.results ?? []
  const visiveis = expandido ? itens : itens.slice(0, VISIVEIS)
  const escondidos = itens.length - VISIVEIS

  // A lista volta a caber sozinha: sem isto, tirar a estrela do sétimo
  // item deixava a seção aberta e vazia embaixo do "Exibir menos".
  useEffect(() => {
    if (itens.length <= VISIVEIS) setExpandido(false)
  }, [itens.length])

  const endpointDe = (item) =>
    `/${item.type === 'folder' ? 'folders' : 'documents'}/${item.id}/`

  /**
   * Tirar a estrela some com a linha na hora.
   *
   * O `refetch` do evento também vai acontecer, mas ele é uma ida ao
   * servidor: até a resposta chegar, o item ficava ali com a estrela já
   * apagada, parecendo que o clique não pegou.
   */
  const removerDaLista = (id) =>
    setData((atual) => ({
      ...atual,
      results: (atual?.results ?? []).filter((i) => i.id !== id),
    }))

  return (
    <>
      {/* Sem ícone: o título já diz "Favoritos", e a estrela ao lado
          dele repetia a mesma informação que cada linha abaixo já
          carrega na ponta direita. "Categorias" também é só o nome. */}
      <h2 className="secao px-2 pb-1 pt-5">Favoritos</h2>

      {loading && !data ? null : itens.length === 0 ? (
        <p className="px-2 pb-2 text-xs text-ink-400">
          Clique na estrela de um item ou de uma pasta para deixá-lo aqui.
        </p>
      ) : (
        <>
          <ul
            className={cn(
              'pb-1',
              // A rolagem só nasce quando a lista é aberta. Um contêiner
              // com `overflow-auto` sempre ligado corta a sombra do foco
              // do teclado nas bordas mesmo sem ter o que rolar.
              expandido && 'max-h-52 overflow-y-auto',
            )}
          >
            {visiveis.map((item) => {
              const Icon = item.type === 'folder' ? FolderIcon : kindMeta(item.type).icon
              const ativo = pathname === item.url

              return (
                <li
                  key={`${item.type}:${item.id}`}
                  // A estrela é um botão e não pode morar DENTRO do link
                  // (um <a> não aceita outro interativo dentro). Por isso
                  // o fundo fica no <li>, que é quem abraça os dois.
                  className={cn(
                    'group flex items-center rounded transition',
                    ativo
                      ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                      : 'text-ink-600 hover:bg-ink-200/60 dark:text-ink-300 dark:hover:bg-ink-800',
                  )}
                >
                  <NavLink
                    to={item.url}
                    title={item.subtitle ? `${item.title} • ${item.subtitle}` : item.title}
                    onContextMenu={(evento) =>
                      aoAbrirMenu?.(evento, { type: 'bookmark', item })
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-2 text-xs"
                  >
                    <Icon
                      size={ICONE.sm}
                      className="shrink-0 text-ink-400"
                      style={item.color ? { color: item.color } : undefined}
                    />
                    <span className="truncate">{item.title}</span>
                  </NavLink>

                  <FavoriteButton
                    endpoint={endpointDe(item)}
                    value
                    onChanged={() => removerDaLista(item.id)}
                    className="mr-1"
                  />
                </li>
              )
            })}
          </ul>

          {escondidos > 0 && (
            <button
              type="button"
              onClick={() => setExpandido((v) => !v)}
              className="mb-2 flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] text-ink-500 transition hover:bg-ink-200/60 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100"
            >
              <ChevronDown
                size={12}
                className={cn('shrink-0 transition-transform', expandido && 'rotate-180')}
              />
              {expandido ? 'Exibir menos' : `Exibir mais (${escondidos})`}
            </button>
          )}
        </>
      )}
    </>
  )
}

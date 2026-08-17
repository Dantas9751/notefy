import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Estrela de favorito.
 *
 * Não existe rota própria de bookmark: `is_favorite` é um campo de
 * `Document` e de `Folder` desde o começo, e o editor já o alterna por
 * PATCH. Este botão usa o mesmo caminho — inventar `/bookmarks/toggle/`
 * criaria uma segunda porta para o mesmo dado, com o risco clássico de as
 * duas discordarem.
 *
 * O estado é otimista: a estrela acende no clique e volta atrás se o
 * servidor recusar. Numa grade de cartões, esperar a resposta faria a
 * estrela piscar meio segundo depois do clique.
 */
export default function FavoriteButton({ endpoint, value = false, onChanged, className }) {
  const [ativo, setAtivo] = useState(value)
  const [salvando, setSalvando] = useState(false)

  // O pai pode recarregar a lista e trazer outro valor (restaurar da
  // lixeira, importar backup). Sem isto a estrela ficaria presa no que
  // este componente achava que era verdade.
  useEffect(() => setAtivo(value), [value])

  // O mesmo item aparece em vários lugares ao mesmo tempo — cartão na
  // pasta, cartão em Recentes, linha na sidebar. Cada estrela guarda o
  // próprio estado otimista, então desfavoritar numa delas deixava as
  // outras acesas até um F5. O evento carrega QUAL item mudou; quem tem o
  // mesmo endpoint se corrige, o resto ignora.
  useEffect(() => {
    const aoMudar = (event) => {
      const detalhe = event.detail
      if (!detalhe || detalhe.endpoint !== endpoint) return
      setAtivo(detalhe.is_favorite)
    }
    window.addEventListener('notefy:favorites-changed', aoMudar)
    return () => window.removeEventListener('notefy:favorites-changed', aoMudar)
  }, [endpoint])

  const alternar = async (event) => {
    // O cartão inteiro é clicável e arrastável: sem barrar aqui, favoritar
    // abriria o item.
    event.preventDefault()
    event.stopPropagation()

    const novo = !ativo
    setAtivo(novo)
    setSalvando(true)

    try {
      await api.patch(endpoint, { is_favorite: novo })
      // Mesmo canal de `notefy:moved`: a sidebar não está na árvore de
      // quem clicou, e passar um callback por todas as listagens só para
      // avisá-la seria enfiar a sidebar na assinatura de cada cartão.
      window.dispatchEvent(
        new CustomEvent('notefy:favorites-changed', {
          detail: { endpoint, is_favorite: novo },
        }),
      )
      onChanged?.(novo)
    } catch {
      setAtivo(!novo)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={salvando}
      title={ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      aria-label={ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      aria-pressed={ativo}
      className={cn(
        'shrink-0 rounded p-0.5 transition',
        ativo
          ? 'text-amber-400'
          : // Fora do hover a estrela vazia some para não competir com o
            // título; quem já favoritou continua vendo a sua.
            'text-ink-300 opacity-0 hover:text-amber-400 focus-visible:opacity-100 group-hover:opacity-100 dark:text-ink-600',
        className,
      )}
    >
      <Star size={13} className={cn(ativo && 'fill-amber-400')} />
    </button>
  )
}

import { useCallback, useState } from 'react'

import api, { extractError } from '@/lib/api'

import ConfirmDialog from '@/components/modals/ConfirmDialog'

/**
 * Exclusão de categoria e pasta — em cascata, com aviso.
 *
 * Fluxo normal:
 *   1. DELETE /folders/:id/
 *   2. Se houver conteúdo, backend responde 409 + requires_confirmation
 *   3. Abre o popup
 *   4. Confirma → DELETE /folders/:id/?force=true
 *
 * Também suporta exclusão em massa através de:
 *
 *   onConfirmOverride
 *
 * Nesse caso, o chamador assume o controle da exclusão depois
 * que o usuário confirmar no popup.
 */

const KIND = {
  folder: { label: 'pasta', article: 'A pasta' },
  category: { label: 'categoria', article: 'A categoria' },
}

// Chaves de `counts` que o backend devolve.
const COUNT_LABEL = {
  folders: ['pasta', 'pastas'],
  documents: ['item', 'itens'],
}

// Todo `kind` que o hook recebe, e não só categoria: o `else` mandava
// documento e tarefa para `/folders/<id>/`, que responde 404 "No Folder
// matches the given query" — era essa a mensagem que aparecia no lugar do
// erro real ao excluir um item sozinho na busca ou em recentes.
const ROTAS = {
  category: 'categories',
  folder: 'folders',
  document: 'documents',
  task: 'tasks',
}

const endpointFor = (target) => `/${ROTAS[target.kind] ?? 'folders'}/${target.id}/`

/**
 * Avisa as outras telas que a hierarquia mudou.
 */
const announce = () => {
  window.dispatchEvent(new Event('notefy:moved'))
}

/**
 * `{documents: 3, folders: 1}` →
 * "3 itens e 1 pasta"
 */
function describe(counts) {
  const parts = Object.entries(counts ?? {})
    .filter(([, total]) => total > 0)
    .map(([key, total]) => {
      const [one, many] = COUNT_LABEL[key] ?? [key, key]

      return `${total} ${total === 1 ? one : many}`
    })

  if (parts.length < 2) {
    return parts[0] ?? ''
  }

  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

/**
 * Hook de exclusão em cascata.
 *
 * @param onDeleted chamado depois que o alvo foi excluído
 * @param onError recebe mensagem quando a exclusão falhar
 */
export function useCascadeDelete({ onDeleted, onError } = {}) {
  const [pending, setPending] = useState(null)

  /**
   * Solicita exclusão.
   *
   * Se estiver vazio, exclui imediatamente.
   *
   * Se tiver conteúdo, o backend retorna requires_confirmation
   * e abrimos o ConfirmDialog.
   *
   * Também aceita:
   *
   * onConfirmOverride
   *
   * para fluxos especiais, como exclusão em massa.
   */
  const requestDelete = useCallback(
    async (target) => {
      try {
        await api.delete(endpointFor(target))

        announce()

        await onDeleted?.(target)
      } catch (err) {
        const status = err.response?.status
        const data = err.response?.data

        // TRAVA DE SEGURANÇA: Se for 423 Locked (contém favoritos), NUNCA abre diálogo de confirmação.
        if (status === 423) {
          onError?.(data?.detail || "Este item contém favoritos e não pode ser excluído.")
          return
        }

        if (data?.requires_confirmation) {
          setPending({
            ...target,
            counts: data.counts,
          })

          return
        }

        onError?.(extractError(err))
      }
    },
    [onDeleted, onError],
  )

  const summary = describe(pending?.counts)

  const dialogs = (
    <ConfirmDialog
      open={!!pending}
      title={`Excluir ${KIND[pending?.kind]?.label ?? 'item'} com conteúdo`}
      message={
        pending && (
          <>
            Tem certeza?{' '}
            {KIND[pending.kind].article}{' '}
            <strong>{pending.name}</strong>{' '}
            ainda contém conteúdo
            {summary && ` (${summary})`}. Tudo que está dentro
            dela será excluído junto, e isso não pode ser desfeito.
          </>
        )
      }
      confirmLabel="Excluir tudo"
      onClose={() => setPending(null)}
      onConfirm={async () => {
        /**
         * ============================================================
         * FLUXO PERSONALIZADO
         * ============================================================
         *
         * Usado pela exclusão em massa.
         *
         * O componente que chamou requestDelete decide
         * exatamente o que será excluído.
         */
        try {
          if (pending?.onConfirmOverride) {
            await pending.onConfirmOverride()

            setPending(null)

            return
          }

          /**
           * ============================================================
           * FLUXO NORMAL
           * ============================================================
           *
           * Usado para uma única pasta/categoria.
           */
          await api.delete(`${endpointFor(pending)}?force=true`)

          setPending(null)

          announce()

          await onDeleted?.(pending)
        } catch (err) {
          setPending(null)
          const status = err.response?.status
          const data = err.response?.data

          // Garante que se o force=true bater na parede do favorito, o erro aparece na tela
          if (status === 423) {
            onError?.(data?.detail || "Este item contém favoritos e não pode ser excluído.")
            return
          }

          onError?.(extractError(err))
        }
      }}
    />
  )

  return {
    requestDelete,
    dialogs,
  }
}
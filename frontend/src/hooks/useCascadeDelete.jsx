import { useCallback, useState } from 'react'

import api, { extractError } from '@/lib/api'

import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { t, traduzirMensagem } from '@/lib/i18n'

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
  folder: { get label() { return t('pasta') }, get article() { return t('A pasta') } },
  category: { get label() { return t('categoria') }, get article() { return t('A categoria') } },
}

// Chaves de `counts` que o backend devolve.
const COUNT_LABEL = {
  get folders() { return [t('pasta'), t('pastas')] },
  get documents() { return [t('item'), t('itens')] },
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

  return t('{lista} e {ultimo}', { lista: parts.slice(0, -1).join(', '), ultimo: parts[parts.length - 1] })
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
          onError?.(traduzirMensagem(data?.detail) || t('Este item contém favoritos e não pode ser excluído.'))
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
      title={t('Excluir {valor} com conteúdo', { valor: KIND[pending?.kind]?.label ?? t('item') })}
      message={
        pending && (
          <>
            {t('Tem certeza?')}{' '}
            {KIND[pending.kind].article}{' '}
            <strong>{pending.name}</strong>{' '}
            {t('ainda contém conteúdo')}
            {/* Vai para a lixeira, como tudo que se exclui: dizer "não pode ser
                desfeito" contradizia a Lixeira, que guarda por 30 dias. */}
            {summary && ` (${summary})`}{t('. Tudo que está dentro dela vai junto para a lixeira.')}
          </>
        )
      }
      confirmLabel={t('Excluir tudo')}
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
            onError?.(traduzirMensagem(data?.detail) || t('Este item contém favoritos e não pode ser excluído.'))
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
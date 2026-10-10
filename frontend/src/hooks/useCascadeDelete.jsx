import { useCallback, useState } from 'react'

import api, { extractError } from '@/lib/api'
import { parseKey } from '@/hooks/useMultiSelect'
import { emLote, ignorar404 } from '@/lib/lote'

import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { avisarErro } from '@/lib/avisoFlutuante'
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
 * O Excluir da seleção de uma lista é `useExcluirSelecao`, mais abaixo.
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

// Fora da tabela ficam os tipos de documento da busca (note, spreadsheet...),
// que moram todos em `/documents/`.
const endpointFor = (target) => `/${ROTAS[target.kind] ?? 'documents'}/${target.id}/`

/** Avisa as outras telas que a hierarquia mudou. */
const announce = () => window.dispatchEvent(new Event('notefy:moved'))

/**
 * Exclui um item que a pessoa já confirmou; a recusa sai como erro. 404
 * conta como excluído (outra aba chegou antes); 423 é o bloqueio por
 * favorito, que `?force=true` não derruba; o resto (409, "tem conteúdo")
 * repete com `?force=true`, porque o diálogo já avisou que tudo vai junto.
 */
async function excluirConfirmado(chave) {
  const { type, id } = parseKey(chave)
  const endpoint = endpointFor({ kind: type, id })
  try {
    await api.delete(endpoint)
  } catch (err) {
    if (err.response?.status === 404) return
    if (err.response?.status === 423) throw err
    await api.delete(`${endpoint}?force=true`).catch(ignorar404)
  }
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

/** A mensagem de uma recusa. 423 é o bloqueio por favorito, nunca um diálogo. */
function motivoDaRecusa(err) {
  if (err.response?.status === 423) {
    return traduzirMensagem(err.response.data?.detail) || t('Este item contém favoritos e não pode ser excluído.')
  }
  return extractError(err)
}

/**
 * Hook de exclusão em cascata.
 *
 * `requestDelete(alvo)` exclui na hora o que está vazio; com conteúdo, o
 * backend pede confirmação e o diálogo abre.
 *
 * @param onDeleted chamado depois que o alvo foi excluído
 * @param onError recebe a mensagem de uma recusa; por padrão, o aviso flutuante
 */
export function useCascadeDelete({ onDeleted, onError = avisarErro } = {}) {
  const [pending, setPending] = useState(null)

  const requestDelete = useCallback(
    async (target) => {
      try {
        await api.delete(endpointFor(target))
        announce()
        await onDeleted?.(target)
      } catch (err) {
        const data = err.response?.data
        if (err.response?.status !== 423 && data?.requires_confirmation) {
          setPending({ ...target, counts: data.counts })
          return
        }
        onError?.(motivoDaRecusa(err))
      }
    },
    [onDeleted, onError],
  )

  // Sucesso fecha pelo `onClose` do próprio diálogo, que espera a exclusão
  // com o botão girando. A recusa fecha aqui e vira aviso na tela.
  const confirmar = async () => {
    try {
      await api.delete(`${endpointFor(pending)}?force=true`)
      announce()
      await onDeleted?.(pending)
    } catch (err) {
      setPending(null)
      onError?.(motivoDaRecusa(err))
    }
  }

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
      onConfirm={confirmar}
    />
  )

  return { requestDelete, dialogs }
}

/** "<Nome> vai para a lixeira, junto com 2 anexo(s)." A mesma frase em toda exclusão de um item. */
export function MensagemDeExclusao({ nome, anexos = 0 }) {
  return (
    <>
      <strong>{nome}</strong> {t('vai para a lixeira')}
      {anexos > 0 && t(', junto com {attachment_count} anexo(s)', { attachment_count: anexos })}.
    </>
  )
}

const nomeDo = (item) => item?.name ?? item?.title ?? ''

/**
 * O "Excluir" da seleção de uma lista, igual em toda tela:
 * - uma pasta ou categoria sozinha segue a cascata, que só pergunta quando
 *   há conteúdo e diz o quê;
 * - o resto pergunta uma vez, com o nome se for um item, com a contagem se
 *   forem vários; um item só pergunta como no menu de botão direito.
 *
 * `itemDe(chave)` devolve o item da lista, de onde sai o nome; `onExcluido`
 * limpa a seleção e recarrega o que a tela precisar. A lista em si
 * recarrega pelo `notefy:moved` que toda exclusão anuncia.
 */
export function useExcluirSelecao({ selecionados, itemDe, onExcluido }) {
  const [lote, setLote] = useState(null)
  const { requestDelete, dialogs: dialogsDaCascata } = useCascadeDelete({ onDeleted: onExcluido })

  const pedirExclusao = () => {
    const [chave] = selecionados
    if (!chave) return
    const { type, id } = parseKey(chave)
    if (selecionados.length === 1 && KIND[type]) {
      requestDelete({ kind: type, id, name: nomeDo(itemDe(chave)) })
      return
    }
    setLote([...selecionados])
  }

  const confirmar = async () => {
    const recusa = await emLote(lote, excluirConfirmado)
    announce()
    await onExcluido?.()
    if (recusa) avisarErro(t('{falhas} de {total} não foram excluídos. {motivo}', recusa))
  }

  const total = lote?.length ?? 0
  const unico = total === 1 ? itemDe(lote[0]) : null
  const temPasta = lote?.some((chave) => KIND[parseKey(chave).type])
  const dialogs = (
    <>
      {dialogsDaCascata}
      <ConfirmDialog
        open={!!lote}
        title={total === 1 ? t('Excluir item') : t('Excluir {n} itens', { n: total })}
        message={
          total === 1 ? (
            <MensagemDeExclusao nome={nomeDo(unico)} anexos={unico?.attachment_count} />
          ) : temPasta ? (
            t('{n} itens vão para a lixeira, junto com o que houver dentro das pastas.', { n: total })
          ) : (
            t('{n} itens vão para a lixeira.', { n: total })
          )
        }
        confirmLabel={total === 1 ? t('Excluir') : t('Excluir {n} itens', { n: total })}
        onClose={() => setLote(null)}
        onConfirm={confirmar}
      />
    </>
  )

  return { pedirExclusao, requestDelete, dialogs }
}

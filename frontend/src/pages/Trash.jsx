import { useMemo, useState } from 'react'
import {
  FileText,
  FolderOpen,
  Kanban,
  RotateCcw,
  Tag,
  Trash2,
  CheckSquare,
  Clock,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import { parseKey, useMultiSelect } from '@/hooks/useMultiSelect'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { BarraDeSelecao, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { avisarErro } from '@/lib/avisoFlutuante'
import { emLote } from '@/lib/lote'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { kindMeta } from '@/lib/documents'
import { cn, formatRelative } from '@/lib/utils'
import { t } from '@/lib/i18n'

const ICONES = {
  category: Tag,
  folder: FolderOpen,
  document: FileText,
  task: CheckSquare,
  board: Kanban,
}

const ROTULOS = {
  get category() { return t('Categoria') },
  get folder() { return t('Pasta') },
  get document() { return t('Item') },
  get task() { return t('Tarefa') },
  get board() { return t('Quadro') },
}

/**
 * Lixeira.
 *
 * Excluir no Notefy marca a data em vez de apagar, e é aqui que o que foi
 * marcado aparece. Restaurar traz de volta junto com os pais — devolver um
 * item para dentro de uma pasta que continua excluída seria devolvê-lo
 * para lugar nenhum.
 */
export default function Trash() {
  const { data, loading, error, refetch } = useFetch('/trash/')
  const { refresh } = useWorkspace()
  const [confirmarEsvaziar, setConfirmarEsvaziar] = useState(false)
  const [confirmarItem, setConfirmarItem] = useState(null)
  const [confirmarLote, setConfirmarLote] = useState(false)

  const itens = data?.results ?? []

  // Mesmo hook das outras listagens. Aqui a chave composta não é luxo: a
  // lixeira mistura cinco tipos e os ids só são únicos dentro do tipo.
  const selectableKeys = useMemo(
    () => itens.map((item) => `${item.type}:${item.id}`),
    [itens],
  )

  const { selected, isSelected, clear, selectOnly, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  // Restaurar devolve o item para a pasta e para a busca; esvaziar tira de
  // vez. Nos dois casos as outras telas estão desatualizadas, e o evento é o
  // que as faz recarregar — esta inclusive, pelo listener logo abaixo.
  const atualizar = () => {
    clear()
    refresh()
    window.dispatchEvent(new Event('notefy:moved'))
  }

  // Excluir em outra tela enche a lixeira; sem ouvir o evento ela só
  // descobriria isso quando o usuário recarregasse a página.
  useListenerDeJanela('notefy:moved', refetch)

  /** Restaura ou apaga de vez a seleção inteira; `mensagem` monta o aviso do que ficou. */
  const naSelecao = async (operacao, mensagem) => {
    const recusa = await emLote(selected, (chave) => {
      const { type, id } = parseKey(chave)
      return operacao(type, id)
    })
    atualizar()
    if (recusa) avisarErro(mensagem(recusa))
  }

  const restaurar = async (item) => {
    try {
      await api.post(`/trash/${item.type}/${item.id}/`)
      atualizar()
    } catch (err) {
      avisarErro(extractError(err))
    }
  }

  return (
    <>
      <PageHeader
        title={t('Lixeira')}
        // Só a contagem. O prazo de retenção já está no aviso âmbar logo
        // abaixo, e a frase do estado vazio é palavra por palavra a mesma
        // do `EmptyState` — subtítulo carrega dado, não instrução.
        subtitle={itens.length ? t('{length} item(ns)', { length: itens.length }) : undefined}
        actions={
          itens.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              onClick={() => setConfirmarEsvaziar(true)}
            >
              {t('Esvaziar lixeira')}
            </Button>
          )
        }
      />

      <PageBody className="pb-24">
        {/* O prazo vem do servidor (`retention_days`) em vez de estar
            escrito aqui: é o mesmo número que o comando `cleanup_trash`
            aplica, então a tela não promete um prazo que a faxina não
            cumpre. */}
        {itens.length > 0 && (
          <p className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <Clock size={13} className="mt-0.5 shrink-0" />
            {t('Itens na lixeira são excluídos permanentemente após')}{' '}
            {data?.retention_days ?? 30} {t('dias.')}
          </p>
        )}

        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : itens.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title={t('Lixeira vazia')}
            description={t('Itens excluídos ficam aqui e podem ser restaurados a qualquer momento.')}
          />
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
            {itens.map((item, i) => {
              const Icon =
                (item.type === 'document' && item.kind
                  ? kindMeta(item.kind).icon
                  : ICONES[item.type]) ?? FileText

              const chave = `${item.type}:${item.id}`
              const selecionado = isSelected(chave)

              return (
                <li key={chave}>
                  {/* A linha sangra de ponta a ponta: o realce precisa cobrir
                      a largura inteira, não uma faixa encolhida no meio. Para
                      o anel não ser fatiado pelo canto do `<ul>`
                      (`rounded-lg` + `overflow-hidden`), ele é `ring-inset` —
                      nasce DENTRO da caixa — e a primeira e a última linha
                      recebem o raio interno do contêiner (10px do
                      `rounded-lg` menos 1px da borda), de modo que a curva do
                      anel coincida com a da moldura em vez de cruzá-la. */}
                  <div
                    onClick={(event) => handleClick(chave, event, () => selectOnly(chave))}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      handleContextMenu(chave)
                    }}
                    className={cn(
                      'flex cursor-pointer select-none items-center gap-3 px-4 py-2.5 transition',
                      i === 0 && 'rounded-t-[9px]',
                      i === itens.length - 1 && 'rounded-b-[9px]',
                      selecionado
                        ? 'bg-accent-50/60 ring-2 ring-inset ring-accent-500 dark:bg-accent-500/10'
                        : 'hover:bg-ink-50 dark:hover:bg-ink-900',
                    )}
                  >
                    <Icon size={16} className="shrink-0 text-ink-400" />
                    
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-800 dark:text-ink-100">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        {ROTULOS[item.type] ?? item.type} {t('· excluído')}{' '}
                        {formatRelative(item.deleted_at)}
                      </p>
                    </div>

                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        restaurar(item)
                      }}
                      title={t('Restaurar')}
                      className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-accent-600 dark:hover:bg-ink-800"
                    >
                      <RotateCcw size={15} />
                    </button>

                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        setConfirmarItem(item)
                      }}
                      title={t('Excluir definitivamente')}
                      className="rounded p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </PageBody>

      {/* Mesma barra flutuante das outras telas — restaurar em lote é o
          motivo de existir seleção aqui: quem esvaziou uma pasta por engano
          quer o conteúdo todo de volta, não item por item. */}
      <BarraDeSelecao total={selected.length} onExcluir={() => setConfirmarLote(true)} onLimpar={clear}>
        <button
          type="button"
          onClick={() =>
            naSelecao(
              (tipo, id) => api.post(`/trash/${tipo}/${id}/`),
              (recusa) => t('{falhas} de {total} não foram restaurados. {motivo}', recusa),
            )
          }
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-ink-200 transition hover:bg-white/10"
        >
          <RotateCcw size={14} />
          {t('Restaurar')}
        </button>
      </BarraDeSelecao>

      <ConfirmDialog
        open={confirmarEsvaziar}
        title={t('Esvaziar lixeira')}
        message={t('Todos os itens da lixeira serão apagados definitivamente, com os arquivos que estiverem neles. Isso não pode ser desfeito.')}
        confirmLabel={t('Esvaziar')}
        onClose={() => setConfirmarEsvaziar(false)}
        onConfirm={async () => {
          await api.delete('/trash/')
          atualizar()
        }}
      />

      <ConfirmDialog
        open={confirmarLote}
        title={t('Excluir definitivamente')}
        message={
          <>
            <strong>{t('{length} item(ns)', { length: selected.length })}</strong> {t('serão apagados para sempre, com os arquivos que estiverem neles. Isso não pode ser desfeito.')}
          </>
        }
        onClose={() => setConfirmarLote(false)}
        onConfirm={async () => {
          await naSelecao(
            (tipo, id) => api.delete(`/trash/${tipo}/${id}/`),
            (recusa) => t('{falhas} de {total} não foram excluídos. {motivo}', recusa),
          )
          setConfirmarLote(false)
        }}
      />

      <ConfirmDialog
        open={!!confirmarItem}
        title={t('Excluir definitivamente')}
        message={
          <>
            <strong>{confirmarItem?.name}</strong> {t('será apagado para sempre. Isso não pode ser desfeito.')}
          </>
        }
        onClose={() => setConfirmarItem(null)}
        onConfirm={async () => {
          await api.delete(`/trash/${confirmarItem.type}/${confirmarItem.id}/`)
          setConfirmarItem(null)
          atualizar()
        }}
      />
    </>
  )
}
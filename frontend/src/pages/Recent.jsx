import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Download, Trash2, Folder as FolderIcon } from 'lucide-react'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { useExcluirSelecao } from '@/hooks/useCascadeDelete'
import { useMultiSelect } from '@/hooks/useMultiSelect'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { BarraDeSelecao, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import DocumentCard from '@/components/DocumentCard'
import { exportarSelecao } from '@/components/ExportMenu'
import FilterBar from '@/components/filters/FilterBar'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useF2, useRenomear } from '@/hooks/useRenomear'
import { documentPath } from '@/lib/documents'
import { agruparPorData, cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Recentes: tudo em ordem de edição, em grupos por data (Hoje, Ontem, Esta
 * semana...).
 */
export default function Recent() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const debouncedQuery = useDebounced(query, 350)

  const { menu, openMenu, closeMenu } = useContextMenu()


  const { refresh } = useWorkspace()

  const { data, loading, error, refetch } = useFetch('/documents/', {
    params: {
      search: debouncedQuery || undefined,
      category: category || undefined,
      ordering: '-updated_at',
      is_archived: false,
      page_size: 48,
    },
  })

  const documents = data?.results ?? []

  // Mesma seleção do FolderDetail, mesmo hook: aqui a lista é plana, então
  // a ordem das chaves é a ordem em que a grade desenha os cartões.
  const selectableKeys = useMemo(
    () => documents.map((doc) => `document:${doc.id}`),
    [documents],
  )

  // Antes do `useMultiSelect`: o efeito do F2 logo abaixo lê daqui.
  const renomear = useRenomear({ onRenamed: refetch })

  const { selected: selectedIds, isSelected, clear, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  useF2(renomear, selectedIds)

  const { buildMenu, dialogs: docActionDialogs } = useDocumentActions({
    onChanged: refetch,
    onRename: (doc) => renomear.abrir(doc.id),
  })

  const { pedirExclusao, dialogs: deleteDialogs } = useExcluirSelecao({
    selecionados: selectedIds,
    itemDe: (chave) => documents.find((doc) => `document:${doc.id}` === chave),
    onExcluido: () => {
      clear()
      refresh()
    },
  })

  useListenerDeJanela('notefy:moved', refetch)

  const abrirMenu = (doc, event) => {
    const total = handleContextMenu(`document:${doc.id}`)
    openMenu(event, { document: doc, isMultiple: total > 1 })
  }

  return (
    <>
      <PageHeader
        title={t('Recentes')}
        subtitle={data ? t('{count} item(ns) no total', { count: data.count }) : t('Carregando...')}
      >
        <FilterBar
          className="mt-4"
          query={query}
          onQueryChange={setQuery}
          placeholder={t('Buscar entre os recentes...')}
          category={category}
          onCategoryChange={setCategory}
        />
      </PageHeader>

      <PageBody className="pb-24">

        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : documents.length ? (
          // Em grupos por data, como no Google Fotos. A lista já vem em ordem
          // de edição, então a seleção com Shift segue valendo entre grupos.
          <div className="space-y-8">
            {agruparPorData(documents, 'updated_at').map((grupo) => (
              <section key={grupo.rotulo}>
                <h2 className="titulo mb-3 text-[17px]">{grupo.rotulo}</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grupo.itens.map((doc) => {
                    const selectionKey = `document:${doc.id}`
                    const selecionado = isSelected(selectionKey)

                    return (
                      // `contents` porque o wrapper aqui é só área de clique: o
                      // anel desenhado nele seguia o raio do wrapper (14px)
                      // enquanto o cartão tem 10px, e sobrava nos cantos — e o
                      // `overflow-hidden` ainda cortava o anel, que o Tailwind
                      // desenha por FORA da caixa. O realce vai no cartão.
                      <div
                        key={doc.id}
                        onClickCapture={(e) =>
                          handleClick(selectionKey, e, () => navigate(documentPath(doc)))
                        }
                        onContextMenu={(e) => abrirMenu(doc, e)}
                        className="contents"
                      >
                        <DocumentCard
                          document={doc}
                          showFolder
                          selecionado={selecionado}
                          renomear={renomear}
                          className={cn(
                            selecionado &&
                              'ring-2 ring-accent-500 ring-offset-0 bg-accent-50/60 dark:bg-accent-500/10',
                          )}
                        />
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Clock}
            title={query || category ? t('Nenhum resultado') : t('Nada por aqui ainda')}
            description={
              query || category
                ? t('Tente outro termo ou remova o filtro.')
                : t('Assim que você criar conteúdo, ele aparece aqui em ordem de edição.')
            }
          />
        )}
      </PageBody>

      <BarraDeSelecao total={selectedIds.length} onExcluir={pedirExclusao} onLimpar={clear} />

      {/* Menu de Contexto */}
      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload?.isMultiple
            ? [
                {
                  label: t('Exportar ({length}) como .zip', { length: selectedIds.length }),
                  icon: Download,
                  onClick: () => exportarSelecao(selectedIds),
                },
                { separator: true },
                {
                  label: t('Excluir ({length} selecionados)', { length: selectedIds.length }),
                  icon: Trash2,
                  danger: true,
                  onClick: pedirExclusao,
                },
              ]
            : menu?.payload?.document
              ? [
                  ...(menu.payload.document.folder
                    ? [
                        {
                          label: t('Ir para pasta'),
                          icon: FolderIcon,
                          onClick: () => navigate(`/folders/${menu.payload.document.folder}`),
                        },
                        { separator: true },
                      ]
                    : []),
                  ...(typeof buildMenu === 'function' ? buildMenu(menu.payload.document) : []),
                ]
              : []
        }
      />

      {/* Modais de Exclusão e Ações */}
      {deleteDialogs}
      {docActionDialogs}
    </>
  )
}
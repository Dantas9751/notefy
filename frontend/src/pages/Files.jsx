import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileUp, Paperclip, Trash2, Folder as FolderIcon } from 'lucide-react'
import { exportarSelecao } from '@/components/ExportMenu'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useF2, useRenomear } from '@/hooks/useRenomear'
import { useExcluirSelecao } from '@/hooks/useCascadeDelete'
import { avisarErro } from '@/lib/avisoFlutuante'
import { useMultiSelect } from '@/hooks/useMultiSelect'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { BarraDeSelecao, Button, EmptyState, ErrorState, ListSkeleton, Select } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import FilterBar from '@/components/filters/FilterBar'
import DestinationModal from '@/components/modals/DestinationModal'
import { useUploadComConflitos } from '@/components/modals/UploadConflictModal'
import DocumentCard from '@/components/DocumentCard'
import { hasFilePayload } from '@/lib/dnd'
import { documentPath } from '@/lib/documents'
import { agruparPorData, cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

const FILE_KINDS = [
  { value: 'image', get label() { return t('Imagens') } },
  { value: 'audio', get label() { return t('Áudios') } },
  { value: 'video', get label() { return t('Vídeos') } },
  { value: 'pdf', get label() { return t('PDFs') } },
  { value: 'document', get label() { return t('Documentos') } },
  { value: 'archive', get label() { return t('Compactados') } },
  { value: 'other', get label() { return t('Outros') } },
]

export default function Files() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [fileKind, setFileKind] = useState('')
  const [page, setPage] = useState(1)

  const debouncedQuery = useDebounced(query, 350)
  const { menu, openMenu, closeMenu } = useContextMenu()


  const { data, loading, error, refetch } = useFetch('/documents/', {
    params: {
      kind: 'file',
      search: debouncedQuery || undefined,
      category: category || undefined,
      file_kind: fileKind || undefined,
      ordering: '-created_at',
      is_archived: false,
      page,
    },
  })

  const renomear = useRenomear({ onRenamed: refetch })
  const { buildMenu, dialogs: docActionDialogs } = useDocumentActions({
    onChanged: refetch,
    onRename: (doc) => renomear.abrir(doc.id),
  })
  const { refresh } = useWorkspace()

  // Mesma seleção do FolderDetail: a ordem das chaves é a ordem em que a
  // grade desenha os cartões, que é o que dá sentido ao intervalo do Shift.
  const arquivos = data?.results ?? []
  const selectableKeys = useMemo(
    () => arquivos.map((doc) => `document:${doc.id}`),
    [arquivos],
  )
  const { selected: selectedIds, isSelected, clear, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  useF2(renomear, selectedIds)

  const { pedirExclusao, dialogs: deleteDialogs } = useExcluirSelecao({
    selecionados: selectedIds,
    itemDe: (chave) => arquivos.find((doc) => `document:${doc.id}` === chave),
    onExcluido: () => {
      clear()
      refresh()
    },
  })

  useListenerDeJanela('notefy:moved', refetch)

  /* ------------------------------------------------------------------ */
  /* Envio de arquivos                                                  */
  /* ------------------------------------------------------------------ */
  const [pending, setPending] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const { iniciar: iniciarUpload, Modal: ModalDeConflito } = useUploadComConflitos({
    onEnviado: () => {
      refetch()
      refresh()
    },
    onErro: avisarErro,
  })

  const chooseDestination = (chosen) => {
    if (!chosen.length) return
    setPending(chosen)
  }

  const sendTo = async (folderId) => {
    const chosen = pending ?? []
    setPending(null)
    if (!chosen.length) return
    // A lista da pasta de destino não está carregada nesta tela — o
    // próprio hook busca `/folders/{id}/contents/` para decidir o
    // conflito de nomes.
    iniciarUpload(chosen, folderId)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /* ------------------------------------------------------------------ */
  /* Lógica de Multi-Seleção e Exclusão                                 */
  /* ------------------------------------------------------------------ */
  const totalPages = data?.total_pages ?? 1
  const hasFilters = query || category || fileKind

  const abrirMenu = (doc, event) => {
    const total = handleContextMenu(`document:${doc.id}`)
    openMenu(event, { document: doc, isMultiple: total > 1 })
  }

  return (
    <div
      onDragEnter={(event) => {
        if (!hasFilePayload(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!hasFilePayload(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={(event) => {
        setDragging(false)
        const dropped = Array.from(event.dataTransfer.files ?? [])
        if (!dropped.length) return
        event.preventDefault()
        chooseDestination(dropped)
      }}
      className={cn('relative min-h-full pb-20', dragging && 'ring-2 ring-inset ring-accent-400')}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent-50/80 dark:bg-accent-500/10">
          <p className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-accent-700 shadow-pop dark:bg-ink-900 dark:text-accent-300">
            <FileUp size={16} />
            {t('Soltar para escolher a pasta de destino')}
          </p>
        </div>
      )}

      <PageHeader
        title={t('Arquivos')}
        subtitle={
          data
            ? t('{count} arquivo(s)', { count: data.count })
            : t('Carregando...')
        }
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => chooseDestination(Array.from(e.target.files ?? []))}
            />
            <Button size="sm" icon={FileUp} onClick={() => fileInputRef.current?.click()}>
              {t('Importar arquivo')}
            </Button>
          </>
        }
      >
        <FilterBar
          className="mt-4"
          query={query}
          onQueryChange={(v) => {
            setQuery(v)
            setPage(1)
          }}
          placeholder={t('Buscar arquivos...')}
          category={category}
          onCategoryChange={(v) => {
            setCategory(v)
            setPage(1)
          }}
          extra={
            <Select
              value={fileKind}
              onChange={(e) => {
                setFileKind(e.target.value)
                setPage(1)
              }}
              className="h-9 w-auto py-0 text-sm"
              aria-label={t('Filtrar por formato')}
            >
              <option value="">{t('Todos os formatos')}</option>
              {FILE_KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          }
        />
      </PageHeader>

      <PageBody>

        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : arquivos.length ? (
          <>
            {/* Em grupos pela data em que o arquivo entrou (Hoje, Ontem, Esta
                semana...), como os Recentes — a lista já vem por `-created_at`. */}
            <div className="space-y-8">
              {agruparPorData(arquivos, 'created_at').map((grupo) => (
                <section key={grupo.rotulo}>
                  <h2 className="titulo mb-3 text-[17px]">{grupo.rotulo}</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {grupo.itens.map((doc) => {
                      const selectionKey = `document:${doc.id}`
                      const selecionado = isSelected(selectionKey)
                      return (
                        // `contents`: o wrapper é só área de clique. Anel desenhado
                        // aqui seguia o raio do wrapper (14px) contra os 10px do
                        // cartão e sobrava nos cantos — e o `overflow-hidden`
                        // ainda cortava o que sobrava. O realce vai no cartão.
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

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3 text-xs text-ink-500">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t('Anterior')}
                </Button>
                <span>{t('Página {page} de {total}', { page, total: totalPages })}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  {t('Próxima')}
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Paperclip}
            title={hasFilters ? t('Nenhum resultado') : t('Nenhum arquivo ainda')}
            description={
              hasFilters
                ? t('Tente outro termo ou remova os filtros.')
                : t('Use “Importar arquivo” ou arraste arquivos para cá. Depois é só escolher a pasta.')
            }
            action={
              !hasFilters && (
                <Button icon={FileUp} onClick={() => fileInputRef.current?.click()}>
                  {t('Importar arquivo')}
                </Button>
              )
            }
          />
        )}
      </PageBody>

      <BarraDeSelecao total={selectedIds.length} onExcluir={pedirExclusao} onLimpar={clear} />

      <DestinationModal
        open={!!pending}
        kind="file"
        title={t('Enviar para qual pasta?')}
        confirmLabel={t('Enviar')}
        onClose={() => {
          setPending(null)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
        onPick={sendTo}
      />

      {ModalDeConflito}

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
    </div>
  )
}
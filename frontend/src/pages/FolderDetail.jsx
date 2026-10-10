import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronRight,
  Download,
  FileUp,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react'
import api from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useTabState } from '@/context/TabsContext'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useExcluirSelecao } from '@/hooks/useCascadeDelete'
import { avisarErro } from '@/lib/avisoFlutuante'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { useF2, useRenomear } from '@/hooks/useRenomear'
import { useMultiSelect } from '@/hooks/useMultiSelect'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { BarraDeSelecao, Badge, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { usePropriedadesNoMenu } from '@/context/PropriedadesContext'
import DocumentCard from '@/components/DocumentCard'
import PastaCard from '@/components/PastaCard'
import CreateMenu from '@/components/layout/CreateMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import { itensDaPasta } from '@/components/layout/menusDaArvore'
import { exportarSelecao } from '@/components/ExportMenu'
import { useUploadComConflitos } from '@/components/modals/UploadConflictModal'
import {
  canDrop,
  hasFilePayload,
  hasItemPayload,
  readDragPayload,
} from '@/lib/dnd'
import { CREATABLE_KINDS, kindMeta } from '@/lib/documents'
import { TASK_STATUS, cn, formatRelative } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Terceiro nível da navegação: os itens de uma pasta.
 *
 * Aceita `id` por prop para o painel lateral do split — lá dentro
 * `useParams()` devolveria o id da rota principal, não o do painel.
 */
export default function FolderDetail({ id: idProp }) {
  const params = useParams()
  const id = idProp ?? params.id
  const emPainel = !!idProp
  const navigate = useNavigate()
  const { refresh } = useWorkspace()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const fimDoMenu = usePropriedadesNoMenu()

  const { data, loading, error, refetch } = useFetch(
    `/folders/${id}/contents/`,
    { deps: [id] },
  )

  // Nome real da pasta como título da aba; desligado no painel lateral.
  useTabState({ title: data?.folder?.name ?? t('Pasta'), enabled: !emPainel })

  const renomear = useRenomear({ onRenamed: refetch })
  const { buildMenu, dialogs } = useDocumentActions({
    onChanged: refetch,
    onRename: (doc) => renomear.abrir(doc.id),
  })

  const [folderModal, setFolderModal] = useState(null)
  const [kindFilter, setKindFilter] = useState('')
  const [dragging, setDragging] = useState(null)

  const fileInputRef = useRef(null)

  //: Upload com aviso de nome duplicado (estilo OneDrive): a pasta de
  //: destino já está carregada nesta tela, então o hook não precisa
  //: buscá-la de novo.
  const { iniciar: iniciarUpload, Modal: ModalDeConflito } = useUploadComConflitos({
    onEnviado: () => {
      refetch()
      refresh()
    },
    onErro: avisarErro,
  })

  const {
    folder,
    subfolders = [],
    documents = [],
    tasks = [],
    counts_by_kind = {},
  } = data ?? {}

  const visible = kindFilter
    ? documents.filter((document) => document.kind === kindFilter)
    : documents

  const selectableKeys = useMemo(
    () => [
      ...subfolders.map((sub) => `folder:${sub.id}`),
      ...visible.map((document) => `document:${document.id}`),
    ],
    [subfolders, visible],
  )

  const { selected: selectedIds, isSelected, clear, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  useF2(renomear, selectedIds, ['document', 'folder'])

  const { pedirExclusao, requestDelete, dialogs: deleteDialogs } = useExcluirSelecao({
    selecionados: selectedIds,
    itemDe: (chave) =>
      subfolders.find((sub) => `folder:${sub.id}` === chave) ??
      documents.find((doc) => `document:${doc.id}` === chave),
    onExcluido: () => {
      clear()
      refresh()
    },
  })

  useListenerDeJanela('notefy:moved', refetch)

  useEffect(() => {
    clear()
  }, [id, clear])

  const upload = (files) => {
    if (!files.length) return
    // A lista de documentos da pasta já está em mãos — o conflito de
    // nomes é decidido contra ela.
    iniciarUpload(files, id, data?.documents ?? [])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // `&& !data`: um refetch não troca a página pelo esqueleto.
  if (loading && !data) {
    return (
      <PageBody>
        <ListSkeleton rows={5} />
      </PageBody>
    )
  }

  if (error && !data) {
    return (
      <PageBody>
        <ErrorState message={error} onRetry={refetch} />
      </PageBody>
    )
  }

  const isEmpty =
    !subfolders.length &&
    !documents.length &&
    !tasks.length

  const target = {
    type: 'folder',
    id,
    path: folder?.path,
  }

  const handleContextAction = (itemKey, event, payload) => {
    const total = handleContextMenu(itemKey)
    openMenu(event, { ...payload, isMultiple: total > 1 })
  }

  const subfolderMenu = (payload) => {
    const { sub, isMultiple } = payload

    if (isMultiple) {
      return [
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
    }

    return itensDaPasta(sub, {
      navigate,
      novaSubpasta: () => setFolderModal({ parent: sub, categoryId: folder.category }),
      renomear: () => renomear.abrir(sub.id),
      editar: () => setFolderModal({ folder: sub, categoryId: folder.category }),
      excluir: () => requestDelete({ kind: 'folder', id: sub.id, name: sub.name }),
      fimDoMenu,
    })
  }

  const pageMenu = () => [
    ...CREATABLE_KINDS.map((kind) => {
      const meta = kindMeta(kind)
      return {
        label: meta.label,
        icon: meta.icon,
        onClick: () => navigate(`${meta.route}/new?folder=${id}`),
      }
    }),
    { separator: true },
    {
      label: t('Nova subpasta'),
      icon: FolderPlus,
      onClick: () => setFolderModal({ parent: folder, categoryId: folder?.category }),
    },
    // Botão direito no vazio da pasta: as Propriedades DELA, como no Explorer.
    ...fimDoMenu('pasta', id),
  ]

  const documentMenu = (payload) => {
    if (payload.isMultiple) {
      return [
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
    }

    return buildMenu(payload.document)
  }

  return (
    <div
      onDragEnter={(event) => {
        if (!hasFilePayload(event) && !hasItemPayload(event)) return
        event.preventDefault()
        if (hasFilePayload(event)) {
          setDragging('file')
          return
        }
        // Realce só quando o gesto muda algo de fato: item que já mora
        // nesta pasta (ou pasta sobre si mesma/descendente) fica sem
        // fundo. Sem payload legível durante o arraste, mostra mesmo
        // assim — a restrição continua valendo no drop.
        const payload = readDragPayload(event)
        if (payload && !canDrop(payload, target)) return
        setDragging('item')
      }}
      onDragOver={(event) => {
        if (hasFilePayload(event)) {
          event.preventDefault()
          setDragging('file')
          return
        }
        if (!hasItemPayload(event)) return
        event.preventDefault()
        const payload = readDragPayload(event)
        if (payload && !canDrop(payload, target)) return
        setDragging('item')
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setDragging(null)
        }
      }}
      onDrop={async (event) => {
        setDragging(null)

        const files = Array.from(
          event.dataTransfer.files ?? [],
        )

        if (files.length) {
          event.preventDefault()
          upload(files)
          return
        }

        const payload = readDragPayload(event)

        if (!canDrop(payload, target)) return

        event.preventDefault()

        if (payload.type === 'document') {
          await api.post(
            `/documents/${payload.id}/move/`,
            { folder: id },
          )
        } else {
          await api.post(
            `/folders/${payload.id}/move/`,
            { parent: id },
          )
        }

        refetch()
        refresh()
      }}
      className={cn(
        'relative min-h-full pb-20',
        dragging && 'ring-2 ring-inset ring-accent-400',
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent-50/80 dark:bg-accent-500/10">
          <p className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-accent-700 shadow-pop dark:bg-ink-900 dark:text-accent-300">
            <FileUp size={16} />
            {dragging === 'file'
              ? t('Soltar para enviar para')
              : t('Soltar para mover para')}{' '}
            “{folder?.name}”
          </p>
        </div>
      )}

      <PageHeader
        title={folder?.name}
        subtitle={folder?.description || undefined}
        breadcrumb={
          folder?.breadcrumb?.length > 0 && (
            <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-400">
              <Link
                to="/"
                className="hover:text-ink-700 dark:hover:text-ink-200"
              >
                {t('Início')}
              </Link>

              <ChevronRight size={11} />

              {folder.breadcrumb.map((crumb) => (
                <span
                  key={crumb.id}
                  className="flex items-center gap-1"
                >
                  <Link
                    to={
                      crumb.type === 'category'
                        ? `/categories/${crumb.id}`
                        : `/folders/${crumb.id}`
                    }
                    className="hover:text-ink-700 dark:hover:text-ink-200"
                  >
                    {crumb.name}
                  </Link>

                  <ChevronRight size={11} />
                </span>
              ))}

              <span className="text-ink-500 dark:text-ink-300">
                {folder.name}
              </span>
            </nav>
          )
        }
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) =>
                upload(
                  Array.from(
                    event.target.files ?? [],
                  ),
                )
              }
            />

            <Button
              variant="secondary"
              size="sm"
              icon={Pencil}
              onClick={() =>
                setFolderModal({
                  folder,
                  categoryId: folder.category,
                })
              }
            >
              {t('Editar')}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={FolderPlus}
              onClick={() =>
                setFolderModal({
                  parent: folder,
                  categoryId: folder.category,
                })
              }
            >
              {t('Subpasta')}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={FileUp}
              onClick={() =>
                fileInputRef.current?.click()
              }
            >
              {t('Importar arquivo')}
            </Button>

            {/* Sem caixa de largura fixa em volta: o menu já tem a largura do
                botão, e a caixa de w-28 deixava um vão antes do "Criar". */}
            <CreateMenu
              alignRight
              defaultFolderId={id}
              defaultCategoryId={folder?.category}
            />
          </>
        }
      >
        {documents.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <button
              onClick={() => setKindFilter('')}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                !kindFilter
                  ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                  : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
              )}
            >
              {t('Tudo')}{' '}
              <span className="tabular-nums opacity-70">
                {documents.length}
              </span>
            </button>

            {Object.entries(counts_by_kind).map(
              ([kind, count]) => {
                const meta = kindMeta(kind)
                const Icon = meta.icon
                const active = kindFilter === kind

                return (
                  <button
                    key={kind}
                    onClick={() =>
                      setKindFilter(
                        active ? '' : kind,
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                      active
                        ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                        : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                    )}
                  >
                    <Icon size={12} />
                    {meta.plural}{' '}
                    <span className="tabular-nums opacity-70">
                      {count}
                    </span>
                  </button>
                )
              },
            )}
          </div>
        )}
      </PageHeader>

      <PageBody
        className="min-h-full space-y-8"
        onContextMenu={(event) => openMenu(event, { type: 'page' })}
      >
        {isEmpty && (
          <EmptyState
            icon={FolderOpen}
            title={t('Pasta vazia')}
            description={t('Use “Criar” para uma nota, planilha, diagrama ou canvas, ou arraste arquivos para cá.')}
            action={
              <div className="flex w-full justify-center">
                <CreateMenu
                  alignRight
                  defaultFolderId={id}
                  defaultCategoryId={folder?.category}
                />
              </div>
            }
          />
        )}

        {subfolders.length > 0 && (
          <section>
            <h2 className="mb-3 secao">
              {t('Subpastas')}
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {subfolders.map((sub) => {
                const selectionKey = `folder:${sub.id}`
                const selecionada = isSelected(selectionKey)

                return (
                  <PastaCard
                    key={sub.id}
                    pasta={sub}
                    selecionada={selecionada}
                    renomear={renomear}
                    arraste={{
                      type: 'folder',
                      id: sub.id,
                      title: sub.name,
                      parentId: id,
                      categoryId: folder.category,
                      isRoot: false,
                      path: sub.path,
                    }}
                    onClickCapture={(event) =>
                      handleClick(selectionKey, event, () => navigate(`/folders/${sub.id}`))
                    }
                    onContextMenu={(event) => handleContextAction(selectionKey, event, { type: 'subfolder', sub })}
                    onFavoritou={refresh}
                  />
                )
              })}
            </div>
          </section>
        )}

        {visible.length > 0 && (
          <section>
            <h2 className="mb-3 secao">
              {kindFilter
                ? kindMeta(kindFilter).plural
                : t('Conteúdo')}
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((doc) => {
                const selectionKey = `document:${doc.id}`
                const selecionado = isSelected(selectionKey)
                const meta = kindMeta(doc.kind)

                return (
                  <div
                    key={doc.id}
                    onClickCapture={(event) =>
                      handleClick(selectionKey, event, () =>
                        navigate(`${meta.route}/${doc.id}`),
                      )
                    }
                    onContextMenu={(event) =>
                      handleContextAction(selectionKey, event, {
                        type: 'document',
                        document: doc,
                      })
                    }
                    className="contents"
                  >
                    <DocumentCard
                      document={doc}
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
        )}

        {tasks.length > 0 && (
          <section>
            <h2 className="mb-3 secao">
              {t('Tarefas')}
            </h2>

            <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700 dark:text-ink-200">
                    {task.title}
                  </span>

                  <Badge
                    className={
                      TASK_STATUS[task.status]
                        ?.className
                    }
                  >
                    {TASK_STATUS[task.status]?.label}
                  </Badge>

                  {task.starts_at && (
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {formatRelative(task.starts_at)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageBody>

      <BarraDeSelecao total={selectedIds.length} onExcluir={pedirExclusao} onLimpar={clear} />

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload?.type === 'document'
            ? documentMenu(menu.payload)
            : menu?.payload?.type === 'subfolder'
              ? subfolderMenu(menu.payload)
              : menu?.payload?.type === 'page'
                ? pageMenu()
                : []
        }
      />

      <FolderFormModal
        open={!!folderModal}
        folder={folderModal?.folder}
        parent={folderModal?.parent}
        categoryId={folderModal?.categoryId}
        onClose={() => setFolderModal(null)}
        onSaved={() => {
          setFolderModal(null)
          refetch()
          refresh()
        }}
      />

      {deleteDialogs}
      {dialogs}
      {ModalDeConflito}
    </div>
  )
}
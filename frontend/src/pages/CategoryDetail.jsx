import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, FolderOpen, FolderPlus, Pencil, Trash2, X } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import FolderFormModal from '@/components/modals/FolderFormModal'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { canDrop, hasItemPayload, readDragPayload, setDragPayload } from '@/lib/dnd'
import { cn, formatRelative } from '@/lib/utils'

/**
 * Segundo nível da navegação: as pastas de uma categoria.
 */
export default function CategoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh } = useWorkspace()
  const { menu, openMenu, closeMenu } = useContextMenu()

  const { data, loading, error, refetch } = useFetch(`/categories/${id}/contents/`, {
    deps: [id],
  })

  const [folderModal, setFolderModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [bulkError, setBulkError] = useState(null)
  //: Ids aguardando confirmação de exclusão em lote.
  const [confirmarLote, setConfirmarLote] = useState(null)

  // Estados para Multi-Seleção
  const [selectedIds, setSelectedIds] = useState([])
  const lastSelectedId = useRef(null)

  const { requestDelete, dialogs: deleteDialogs } = useCascadeDelete({
    onDeleted: () => {
      setSelectedIds([])
      refetch()
      refresh()
    },
    onError: (message) => {
      setBulkError(message)
    },
  })

  // Atalho Tecla ESC para limpar seleções
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedIds([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Mover algo pela sidebar pode ter tirado (ou trazido) uma pasta daqui.
  useEffect(() => {
    const onMoved = () => refetch()
    window.addEventListener('notefy:moved', onMoved)
    return () => window.removeEventListener('notefy:moved', onMoved)
  }, [refetch])

  useEffect(() => {
    if (bulkError) {
      const timer = setTimeout(() => {
        setBulkError(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [bulkError])
  
  // O SEGREDO ESTÁ AQUI: `&& !data` impede que a tela pisque/suma durante os refetches!
  if (loading && !data) {
    return (
      <PageBody>
        <ListSkeleton rows={4} />
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

  const { category, folders = [] } = data ?? {}
  const target = { type: 'category', id }

  // Lógica de Clique com Ctrl/Cmd e Shift perfeitamente fluida
  const handleFolderClick = (folder, event) => {
    const list = folders.map((f) => f.id)

    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((prev) =>
        prev.includes(folder.id) ? prev.filter((i) => i !== folder.id) : [...prev, folder.id]
      )
      lastSelectedId.current = folder.id
    } else if (event.shiftKey) {
      event.preventDefault() // Impede de selecionar texto fantasma na tela
      
      // Se não clicou em nada antes, pega o primeiro item da lista como base
      const startId = lastSelectedId.current || list[0]
      const lastIndex = list.indexOf(startId)
      const currentIndex = list.indexOf(folder.id)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = list.slice(start, end + 1)
        setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])))
      } else {
        setSelectedIds([folder.id])
      }
    } else {
      setSelectedIds([folder.id])
      lastSelectedId.current = folder.id
      navigate(`/folders/${folder.id}`)
    }
  }

  const handleContextMenu = (folder, event) => {
    event.preventDefault()
    let currentSelected = selectedIds
    if (!selectedIds.includes(folder.id)) {
      currentSelected = [folder.id]
      setSelectedIds([folder.id])
    }
    openMenu(event, { folder, isMultiple: currentSelected.length > 1 })
  }

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return

    const idsToDelete = [...selectedIds]

    if (idsToDelete.length === 1) {
      const folder = folders.find((f) => f.id === idsToDelete[0])
      if (folder) {
        requestDelete({
          kind: 'folder',
          id: folder.id,
          name: folder.name,
        })
      }
      return
    }

    // Com várias, o diálogo é aberto direto — e NÃO via `requestDelete`.
    //
    // `requestDelete` começa tentando um DELETE de verdade no alvo, e só cai
    // no diálogo se o servidor pedir confirmação. Passando a primeira pasta
    // como alvo, uma pasta vazia era apagada na hora, `onDeleted` fechava o
    // fluxo e o `onConfirmOverride` nunca rodava: só a primeira sumia. É
    // exatamente o "só exclui a primeira selecionada".
    setConfirmarLote(idsToDelete)
  }

  /** Apaga uma pasta. Devolve o resultado em vez de lançar. */
  const excluirPasta = async (folderId) => {
    try {
      await api.delete(`/folders/${folderId}/`)
      return { ok: true }
    } catch (err) {
      const status = err.response?.status
      if (status === 404) return { ok: true }
      // 423 é o bloqueio por favorito: `?force=true` não derruba.
      if (status === 423) return { ok: false, motivo: extractError(err) }

      // 409 é "ainda tem conteúdo dentro" — o diálogo já avisou que tudo
      // vai junto, então aqui a confirmação já foi dada.
      try {
        await api.delete(`/folders/${folderId}/?force=true`)
        return { ok: true }
      } catch (forceErr) {
        if (forceErr.response?.status === 404) return { ok: true }
        return { ok: false, motivo: extractError(forceErr) }
      }
    }
  }

  const confirmarExclusaoEmLote = async () => {
    const idsToDelete = confirmarLote ?? []
    setBulkError(null)

    // A fila vai até o fim: uma pasta recusada não impede as seguintes.
    const bloqueados = []
    for (const folderId of idsToDelete) {
      const resultado = await excluirPasta(folderId)
      if (!resultado.ok) bloqueados.push(resultado.motivo)
    }

    setConfirmarLote(null)
    setSelectedIds([])

    if (bloqueados.length) {
      setBulkError(
        `${bloqueados.length} de ${idsToDelete.length} pastas não foram excluídas. ${bloqueados[0]}`,
      )
    }

    await refetch()
    refresh()
    window.dispatchEvent(new Event('notefy:moved'))
  }

  const folderMenu = (payload) => {
    const { folder, isMultiple } = payload

    if (isMultiple) {
      return [
        {
          label: `Excluir (${selectedIds.length} selecionadas)`,
          icon: Trash2,
          danger: true,
          onClick: handleBulkDelete,
        },
      ]
    }

    return [
      { label: 'Abrir', icon: FolderOpen, onClick: () => navigate(`/folders/${folder.id}`) },
      {
        label: 'Nova subpasta',
        icon: FolderPlus,
        onClick: () => setFolderModal({ parent: folder, categoryId: id }),
      },
      { separator: true },
      {
        label: 'Renomear',
        icon: Pencil,
        onClick: () => setFolderModal({ folder, categoryId: id }),
      },
      {
        label: 'Excluir',
        icon: Trash2,
        danger: true,
        onClick: () => {
          requestDelete({ kind: 'folder', id: folder.id, name: folder.name })
        },
      },
    ]
  }

  return (
    <div
      onDragOver={(event) => {
        if (!hasItemPayload(event)) return
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false)
      }}
      onDrop={async (event) => {
        setDragOver(false)
        const payload = readDragPayload(event)
        if (!canDrop(payload, target)) return
        event.preventDefault()
        await api.post(`/folders/${payload.id}/move/`, { category: id })
        refetch()
        refresh()
      }}
      className={cn('min-h-full pb-20', dragOver && 'ring-2 ring-inset ring-accent-400')}
    >
      <PageHeader
        title={category?.name}
        subtitle={category?.description || `${folders.length} pasta(s) nesta categoria.`}
        breadcrumb={
          <nav className="mb-2 flex items-center gap-1 text-xs text-ink-400">
            <Link to="/" className="hover:text-ink-700 dark:hover:text-ink-200">
              Início
            </Link>
            <ChevronRight size={11} />
            <span className="text-ink-500 dark:text-ink-300">Categorias</span>
          </nav>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={Pencil}
              onClick={() => setCategoryModal(true)}
            >
              Editar
            </Button>
            <Button
              size="sm"
              icon={FolderPlus}
              onClick={() => setFolderModal({ parent: null, categoryId: id })}
            >
              Nova pasta
            </Button>
          </>
        }
      />

      <PageBody>
        {bulkError && (
          <div className="mb-6">
            <ErrorState message={bulkError} onRetry={() => setBulkError(null)} />
          </div>
        )}

        {folders.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((folder) => {
              const isSelected = selectedIds.includes(folder.id)
              return (
                <article
                  key={folder.id}
                  draggable
                  onDragStart={(event) =>
                    setDragPayload(event, {
                      type: 'folder',
                      id: folder.id,
                      title: folder.name,
                      parentId: null,
                      categoryId: id,
                      isRoot: true,
                    })
                  }
                  onClick={(e) => handleFolderClick(folder, e)}
                  onContextMenu={(e) => handleContextMenu(folder, e)}
                  className={cn(
                    'card group flex cursor-pointer items-start gap-3 p-4 active:cursor-grabbing transition',
                    isSelected && 'ring-2 ring-accent-500 bg-accent-50/50 dark:bg-accent-500/10'
                  )}
                  style={
                    folder.color
                      ? { borderLeftColor: folder.color, borderLeftWidth: 3 }
                      : undefined
                  }
                >
                  <FolderOpen
                    size={18}
                    className="mt-0.5 shrink-0 text-ink-400"
                    style={folder.color ? { color: folder.color } : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900 group-hover:text-accent-700 dark:text-ink-100 dark:group-hover:text-accent-300">
                      {folder.name}
                    </p>
                    {folder.description && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-500 dark:text-ink-400">
                        {folder.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-ink-400">
                      {folder.document_count} item(ns) · {folder.child_count} subpasta(s) ·{' '}
                      {formatRelative(folder.updated_at)}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={FolderOpen}
            title="Nenhuma pasta nesta categoria"
            description="Crie uma pasta para começar a guardar notas, arquivos, planilhas e diagramas aqui."
            action={
              <Button
                icon={FolderPlus}
                onClick={() => setFolderModal({ parent: null, categoryId: id })}
              >
                Criar pasta
              </Button>
            }
          />
        )}
      </PageBody>

      {/* Barra Flutuante de Ações em Massa */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-slide-up flex items-center gap-3 rounded-xl bg-ink-900 px-4 py-2.5 text-white shadow-xl dark:bg-ink-800 border border-ink-700">
          <span className="text-xs font-medium">
            {selectedIds.length} selecionada(s)
          </span>
          <div className="h-4 w-px bg-ink-700" />
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/20"
          >
            <Trash2 size={14} /> Excluir
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="rounded p-1 text-ink-400 transition hover:text-white"
            title="Limpar seleção"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? folderMenu(menu.payload) : []}
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

      <CategoryFormModal
        open={categoryModal}
        category={category}
        onClose={() => setCategoryModal(false)}
        onSaved={() => {
          setCategoryModal(false)
          refetch()
          refresh()
        }}
      />

      {deleteDialogs}

      {/* Confirmação do lote. Mesmo `ConfirmDialog` do resto do app; o que
          muda é que aqui ele é aberto direto, sem passar pelo
          `requestDelete` — que apagaria a primeira pasta antes de perguntar. */}
      <ConfirmDialog
        open={!!confirmarLote}
        title="Excluir pastas selecionadas"
        message={
          <>
            <strong>{confirmarLote?.length} pastas</strong> serão excluídas, com
            tudo que estiver dentro delas. Isso não pode ser desfeito.
          </>
        }
        confirmLabel="Excluir tudo"
        onClose={() => setConfirmarLote(null)}
        onConfirm={confirmarExclusaoEmLote}
      />
    </div>
  )
}
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { CheckSquare, Folder as FolderIcon, SearchX, Trash2, X, ExternalLink } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { parseKey, useMultiSelect } from '@/hooks/useMultiSelect'
import { useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Button, EmptyState, ErrorState, ListSkeleton, Modal } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import FilterBar from '@/components/filters/FilterBar'
import { DOCUMENT_KINDS } from '@/lib/documents'
import { cn, formatRelative } from '@/lib/utils'

const TYPE_META = {
  ...Object.fromEntries(
    Object.entries(DOCUMENT_KINDS).map(([kind, meta]) => [
      kind,
      { label: meta.plural, icon: meta.icon, accent: meta.accent },
    ]),
  ),
  folder: { label: 'Pastas', icon: FolderIcon, accent: '#78716C' },
  task: { label: 'Tarefas', icon: CheckSquare, accent: '#0EA5E9' },
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [types, setTypes] = useState(searchParams.getAll('type'))
  const [category, setCategory] = useState(searchParams.get('category') ?? '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') ?? '')
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') ?? '')

  // Contextos
  const { refresh } = useWorkspace()
  const { menu, openMenu, closeMenu } = useContextMenu()

  const [actionError, setActionError] = useState(null)

  // Estado para o Modal de Exclusão em Massa
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)

  const debouncedQuery = useDebounced(query, 350)

  // Reflete o estado dos filtros na URL
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedQuery) next.set('q', debouncedQuery)
    types.forEach((t) => next.append('type', t))
    if (category) next.set('category', category)
    if (dateFrom) next.set('date_from', dateFrom)
    if (dateTo) next.set('date_to', dateTo)
    setSearchParams(next, { replace: true })
  }, [debouncedQuery, types, category, dateFrom, dateTo, setSearchParams])

  const { data, loading, error, refetch } = useFetch('/search/', {
    params: {
      q: debouncedQuery || undefined,
      type: types.length ? types : undefined,
      category: category || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    },
  })

  const toggleType = (type) =>
    setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))

  const results = data?.results ?? []
  const hasCriteria = debouncedQuery || types.length || category || dateFrom || dateTo

  // A busca mistura tipos na mesma lista — daí a chave composta. A ordem é
  // a que o servidor devolveu, que é a que a lista desenha.
  const selectableKeys = useMemo(
    () => results.map((item) => `${item.type}:${item.id}`),
    [results],
  )

  const { selected: selectedIds, isSelected, clear, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  // Hook de exclusão em cascata (Usado apenas para exclusão ÚNICA)
  const { requestDelete, dialogs: deleteDialogs } = useCascadeDelete({
    onDeleted: () => {
      clear()
      refetch()
      refresh()
      window.dispatchEvent(new Event('notefy:moved'))
    },
    onError: setActionError,
  })

  // A busca também precisa ouvir: excluir numa pasta com esta tela montada
  // deixava um resultado fantasma na lista até recarregar a página.
  useEffect(() => {
    const onMoved = () => refetch()
    window.addEventListener('notefy:moved', onMoved)
    return () => window.removeEventListener('notefy:moved', onMoved)
  }, [refetch])

  const abrirMenu = (item, event) => {
    const total = handleContextMenu(`${item.type}:${item.id}`)
    openMenu(event, { item, isMultiple: total > 1 })
  }

  /**
   * Apaga um item. Devolve o resultado em vez de lançar.
   *
   * Lançar aqui abortava o `for` do lote: os itens ANTES do bloqueado eram
   * apagados e os DEPOIS nem eram tentados. Uma pasta com favorito dentro
   * deve ser pulada, não virar parede no meio da fila.
   */
  const deleteOne = async (selectionKey) => {
    const { type: itemType, id: itemId } = parseKey(selectionKey)

    let endpoint = `/documents/${itemId}/`
    if (itemType === 'folder') {
      endpoint = `/folders/${itemId}/`
    } else if (itemType === 'task') {
      endpoint = `/tasks/${itemId}/`
    }

    try {
      await api.delete(endpoint)
      return { ok: true }
    } catch (err) {
      const status = err.response?.status
      if (status === 404) return { ok: true }
      // 423 é o bloqueio por favorito, e `?force=true` não derruba —
      // repetir só gastaria outra requisição para receber o mesmo não.
      if (status === 423) return { ok: false, motivo: extractError(err) }

      try {
        await api.delete(`${endpoint}?force=true`)
        return { ok: true }
      } catch (forceErr) {
        if (forceErr.response?.status === 404) return { ok: true }
        return { ok: false, motivo: extractError(forceErr) }
      }
    }
  }

  // Executa exclusão em massa através do Modal Customizado
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return

    const idsToDelete = [...selectedIds]
    setActionError(null)
    setIsDeletingBulk(true)

    // A fila vai até o fim: cada item é independente, e um recusado não é
    // motivo para os seguintes nem serem tentados.
    const bloqueados = []

    try {
      for (const selectionKey of idsToDelete) {
        const resultado = await deleteOne(selectionKey)
        if (!resultado.ok) bloqueados.push(resultado.motivo)
      }
    } finally {
      clear()
      setBulkDeleteModalOpen(false)
      setIsDeletingBulk(false)

      if (bloqueados.length) {
        setActionError(
          `${bloqueados.length} de ${idsToDelete.length} não foram excluídos. ${bloqueados[0]}`,
        )
      }

      await refetch()
      refresh()
      window.dispatchEvent(new Event('notefy:moved'))
    }
  }

  // Avalia se abre o Hook nativo (para 1 item) ou o Modal de Massa (para vários)
  const handleBulkDeleteWithDialog = () => {
    if (selectedIds.length === 0) return

    if (selectedIds.length === 1) {
      const { type: itemType, id: itemId } = parseKey(selectedIds[0])

      const targetItem = results.find(
        (item) => String(item.type) === String(itemType) && String(item.id) === String(itemId)
      )

      if (targetItem) {
        setActionError(null)

        let deleteKind = 'document'
        if (targetItem.type === 'folder') deleteKind = 'folder'
        else if (targetItem.type === 'task') deleteKind = 'task'

        requestDelete({
          kind: deleteKind,
          id: targetItem.id,
          name: targetItem.title,
        })
        return
      }
    }

    setBulkDeleteModalOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Busca global"
        subtitle="Procure em notas, arquivos, planilhas, diagramas, canvas, pastas e tarefas ao mesmo tempo."
      >
        <div className="mt-4 space-y-3">
          <FilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Buscar em tudo..."
            category={category}
            onCategoryChange={setCategory}
            extraActive={Boolean(dateFrom || dateTo || types.length)}
            onClearExtra={() => {
              setDateFrom('')
              setDateTo('')
              setTypes([])
            }}
            extra={
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="Data inicial"
                  className="input h-9 w-auto py-0 text-sm"
                />
                <span className="text-xs text-ink-400">até</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="Data final"
                  min={dateFrom || undefined}
                  className="input h-9 w-auto py-0 text-sm"
                />
              </>
            }
          />

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TYPE_META).map(([type, { label, icon: Icon, accent }]) => {
              const active = types.includes(type)
              const count = data?.counts?.[type]
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  style={active ? { borderColor: accent, color: accent } : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                    active
                      ? 'bg-white dark:bg-ink-900'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                  )}
                >
                  <Icon size={13} />
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="tabular-nums opacity-70">{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </PageHeader>

      <PageBody className="pb-24">
        {actionError && <div className="mb-4"><ErrorState message={actionError} /></div>}

        {error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : loading ? (
          <ListSkeleton rows={6} />
        ) : results.length ? (
          <>
            <p className="mb-3 text-xs text-ink-400">
              {data.total} resultado(s)
              {debouncedQuery && <> para “{debouncedQuery}”</>}
            </p>

            <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {results.map((item, i) => {
                const uniqueKey = `${item.type}:${item.id}`
                const selecionado = isSelected(uniqueKey)
                const meta = TYPE_META[item.type] ?? TYPE_META.note
                const Icon = meta.icon

                return (
                  <li key={uniqueKey}>
                    {/* O `<Link>` do React Router só navega se o handler não
                        tiver chamado `preventDefault` — é o que o hook faz em
                        Shift e Ctrl. Sem isso o Shift+clique abria o item em
                        vez de marcar o intervalo.

                        A linha sangra de ponta a ponta: o realce precisa
                        cobrir a largura inteira, não uma faixa encolhida no
                        meio. Para o anel não ser fatiado pelo canto do `<ul>`
                        (`rounded-lg` + `overflow-hidden`), ele é `ring-inset`
                        — nasce DENTRO da caixa — e a primeira e a última
                        linha recebem o raio interno do contêiner (10px do
                        `rounded-lg` menos 1px da borda), de modo que a curva
                        do anel coincida com a da moldura em vez de cruzá-la. */}
                    <Link
                      to={item.url}
                      onClick={(e) => handleClick(uniqueKey, e)}
                      onContextMenu={(e) => abrirMenu(item, e)}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-900',
                        i === 0 && 'rounded-t-[9px]',
                        i === results.length - 1 && 'rounded-b-[9px]',
                        selecionado &&
                          'bg-accent-50/60 ring-2 ring-inset ring-accent-500 dark:bg-accent-500/10'
                      )}
                    >
                      <Icon
                        size={16}
                        className="mt-0.5 shrink-0"
                        style={{ color: item.color || meta.accent }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                            {item.title}
                          </p>
                          <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-400">{item.subtitle}</p>
                        {item.snippet && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-ink-500 dark:text-ink-400">
                            {item.snippet}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-ink-400">
                        {formatRelative(item.updated_at)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <EmptyState
            icon={SearchX}
            title={hasCriteria ? 'Nenhum resultado' : 'Comece a buscar'}
            description={
              hasCriteria
                ? 'Tente outro termo ou remova alguns filtros.'
                : 'Digite um termo ou combine filtros de tipo, categoria e data.'
            }
          />
        )}
      </PageBody>

      {/* Barra Flutuante de Ações em Massa */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-slide-up flex items-center gap-3 rounded-xl bg-ink-900 px-4 py-2.5 text-white shadow-xl dark:bg-ink-800 border border-ink-700">
          <span className="text-xs font-medium">
            {selectedIds.length} selecionado(s)
          </span>
          <div className="h-4 w-px bg-ink-700" />
          <button
            onClick={handleBulkDeleteWithDialog}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/20"
          >
            <Trash2 size={14} /> Excluir
          </button>
          <button
            onClick={clear}
            className="rounded p-1 text-ink-400 transition hover:text-white"
            title="Limpar seleção"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Menu de Contexto global para a página de busca */}
      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload?.isMultiple
            ? [
                {
                  label: `Excluir (${selectedIds.length} selecionados)`,
                  icon: Trash2,
                  danger: true,
                  onClick: handleBulkDeleteWithDialog,
                },
              ]
            : [
                // Ir para pasta (acima de Abrir, se não for pasta)
                ...(menu?.payload?.item?.type !== 'folder'
                  ? [
                      {
                        label: 'Ir para pasta',
                        icon: FolderIcon,
                        onClick: async () => {
                          const item = menu.payload.item;
                          try {
                            const endpoint = item.type === 'task'
                              ? `/tasks/${item.id}/`
                              : `/documents/${item.id}/`;
                            const response = await api.get(endpoint);
                            const folderId = response.data.folder;
                            if (folderId) {
                              navigate(`/folders/${folderId}`);
                            } else {
                              alert('Este item não pertence a nenhuma pasta.');
                            }
                          } catch (error) {
                            console.error('Erro ao buscar a pasta:', error);
                          }
                        },
                      },
                      { separator: true },
                    ]
                  : []),
                {
                  label: 'Abrir',
                  icon: ExternalLink,
                  onClick: () => navigate(menu.payload.item.url),
                },
                { separator: true },
                {
                  label: 'Excluir',
                  icon: Trash2,
                  danger: true,
                  onClick: handleBulkDeleteWithDialog,
                },
              ]
        }
      />

      {/* Modais de Exclusão */}
      {deleteDialogs}

      <Modal
        open={bulkDeleteModalOpen}
        onClose={() => setBulkDeleteModalOpen(false)}
        title="Excluir múltiplos itens"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={isDeletingBulk}
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white border-transparent"
            >
              Sim, excluir {selectedIds.length} itens
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Você está prestes a excluir <strong>{selectedIds.length}</strong> itens de forma permanente.
          Se houver subpastas com conteúdo, eles também serão forçados a serem excluídos. Deseja continuar?
        </p>
      </Modal>
    </>
  )
}

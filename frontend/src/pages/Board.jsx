import { useEffect, useState } from 'react'
import { CalendarClock, CalendarPlus, Plus } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, ErrorState, Spinner } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { useTaskActions } from '@/hooks/useTaskActions'
import FilterBar from '@/components/filters/FilterBar'
import TaskFormModal from '@/components/modals/TaskFormModal'
import TaskScheduler from '@/components/TaskScheduler'
import { TASK_PRIORITY, TASK_STATUS, cn, formatRelative } from '@/lib/utils'

/** MIME próprio: soltar uma tarefa não pode ser confundido com soltar texto. */
const TASK_MIME = 'application/x-notefy-task'

/** Durante o arraste o conteúdo é ilegível; só os tipos ficam visíveis. */
const isTaskDrag = (event) => Array.from(event.dataTransfer.types ?? []).includes(TASK_MIME)

function TaskCard({ task, onClick, onSchedule, onDragStart, onContextMenu, dragging }) {
  return (
    <article
      draggable
      onContextMenu={(event) => onContextMenu?.(event, { task })}
      onDragStart={(event) => {
        // O payload precisa ir no dataTransfer, e não só no estado do
        // React: sem ele o navegador não inicia o arraste de verdade.
        event.dataTransfer.setData(TASK_MIME, task.id)
        event.dataTransfer.setData('text/plain', task.title)
        event.dataTransfer.effectAllowed = 'move'
        // Adiado de propósito. Mudar estado aqui faz o React re-renderizar
        // o próprio elemento que está sendo arrastado, e o Chrome cancela
        // o arraste quando o nó de origem é substituído no mesmo tick.
        setTimeout(() => onDragStart?.(), 0)
      }}
      onClick={onClick}
      className={cn(
        'card cursor-grab p-3 transition active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
      style={task.color ? { borderLeftColor: task.color, borderLeftWidth: 3 } : undefined}
    >
      <p className="text-sm font-medium leading-snug text-ink-800 dark:text-ink-100">
        {task.title}
      </p>

      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">
          {task.description}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className={cn('text-[11px] font-medium', TASK_PRIORITY[task.priority]?.className)}>
          {task.priority_label}
        </span>
        {task.document_title && (
          <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
            {task.document_title}
          </Badge>
        )}

        {/* O botão de data no próprio cartão liga o quadro à agenda: dá
            para agendar sem abrir o formulário inteiro. */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSchedule()
          }}
          title={task.starts_at ? 'Alterar data' : 'Agendar no calendário'}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition',
            task.starts_at
              ? task.is_overdue
                ? 'font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800'
              : 'text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800',
          )}
        >
          {task.starts_at ? <CalendarClock size={11} /> : <CalendarPlus size={11} />}
          {task.starts_at ? formatRelative(task.starts_at) : 'agendar'}
        </button>
      </div>
    </article>
  )
}

export default function Board() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [modal, setModal] = useState(null)
  const [scheduling, setScheduling] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  const [error, setError] = useState(null)

  const debouncedQuery = useDebounced(query, 350)
  const { menu, openMenu, closeMenu } = useContextMenu()

  const { data, loading, refetch, ...rest } = useFetch('/tasks/board/', {
    params: { search: debouncedQuery || undefined, category: category || undefined },
  })

  const { buildMenu, dialogs } = useTaskActions({
    onChanged: refetch,
    onEdit: (task) => setModal({ task }),
    onSchedule: (task) => setScheduling(task),
  })

  useEffect(() => {
    const clear = () => setDraggingId(null)
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  const columns = data?.columns ?? []

  const moveTo = async (taskId, status) => {
    setError(null)
    try {
      await api.post(`/tasks/${taskId}/move/`, { status })
      // Recarregar em vez de mover otimista: o servidor é a verdade sobre
      // a ordem e sobre `completed_at`, que muda junto com o status.
      refetch()
    } catch (err) {
      setError(extractError(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Quadro"
        subtitle="Arraste os cartões entre as colunas para mudar o status."
      >
        <FilterBar
          className="mt-4"
          query={query}
          onQueryChange={setQuery}
          placeholder="Buscar tarefas..."
          category={category}
          onCategoryChange={setCategory}
        />
      </PageHeader>

      <PageBody>
        {(error || rest.error) && (
          <ErrorState message={error || rest.error} onRetry={refetch} />
        )}

        {loading && !data ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((column) => {
              const meta = TASK_STATUS[column.status] ?? TASK_STATUS.todo
              const isOver = overColumn === column.status

              return (
                <div
                  key={column.status}
                  // dragEnter E dragOver precisam chamar preventDefault:
                  // sem os dois, o Chrome mantém o cursor de "proibido" e
                  // nunca dispara o drop.
                  onDragEnter={(event) => {
                    if (!isTaskDrag(event)) return
                    event.preventDefault()
                    setOverColumn(column.status)
                  }}
                  onDragOver={(event) => {
                    if (!isTaskDrag(event)) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    if (overColumn !== column.status) setOverColumn(column.status)
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setOverColumn(null)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const taskId = event.dataTransfer.getData(TASK_MIME) || draggingId
                    setOverColumn(null)
                    setDraggingId(null)
                    if (!taskId) return
                    const already = column.tasks.some((t) => t.id === taskId)
                    if (!already) moveTo(taskId, column.status)
                  }}
                  className={cn(
                    'flex w-72 shrink-0 flex-col rounded-lg bg-ink-50/70 p-2.5 transition dark:bg-ink-900/40',
                    isOver && 'bg-accent-50 ring-2 ring-accent-400 dark:bg-accent-500/10',
                  )}
                >
                  <div className="mb-2.5 flex items-center gap-2 px-1">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: meta.accent }}
                    />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                      {column.label}
                    </h2>
                    <span className="text-[11px] tabular-nums text-ink-400">
                      {column.tasks.length}
                    </span>

                    {/* Criar já nasce no status da coluna — é o que torna o
                        status "onde você criou" em vez de um campo a preencher. */}
                    <button
                      onClick={() => setModal({ status: column.status })}
                      title={`Nova tarefa em ${column.label}`}
                      aria-label={`Nova tarefa em ${column.label}`}
                      className="ml-auto rounded p-1 text-ink-400 transition hover:bg-ink-200/70 hover:text-accent-600 dark:hover:bg-ink-800"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="min-h-[60px] space-y-2">
                    {column.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        dragging={draggingId === task.id}
                        onDragStart={() => setDraggingId(task.id)}
                        onClick={() => setModal({ task })}
                        onSchedule={() => setScheduling(task)}
                        onContextMenu={openMenu}
                      />
                    ))}

                    {/* Coluna vazia continua sendo alvo de drop, mas sem
                        texto: o `+` do cabeçalho já diz como criar. */}
                    {column.tasks.length === 0 && (
                      <div
                        className={cn(
                          'rounded-md border border-dashed border-ink-200 py-8 transition dark:border-ink-800',
                          isOver && 'border-accent-400 bg-accent-50/50 dark:bg-accent-500/10',
                        )}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageBody>

      <TaskFormModal
        open={!!modal}
        task={modal?.task}
        defaultStatus={modal?.status}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null)
          refetch()
        }}
      />

      <TaskScheduler
        open={!!scheduling}
        task={scheduling}
        onClose={() => setScheduling(null)}
        onSaved={refetch}
      />

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? buildMenu(menu.payload.task) : []}
      />
      {dialogs}
    </>
  )
}

import { useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Plus } from 'lucide-react'
import api from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Button, ErrorState, Spinner } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { useTaskActions } from '@/hooks/useTaskActions'
import TaskFormModal from '@/components/modals/TaskFormModal'
import TaskScheduler from '@/components/TaskScheduler'
import { TASK_PRIORITY, TASK_STATUS, cn } from '@/lib/utils'

const WEEK_DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MAX_VISIBLE_PER_DAY = 3
const TASK_MIME = 'application/x-notefy-task'

/**
 * O calendário recebe eventos (`start`/`end`/`allDay`), mas o menu de
 * contexto e o agendador falam de tarefas (`starts_at`/`ends_at`).
 * Converter aqui evita espalhar `?? event.start` por dentro deles.
 */
const asTask = (event) =>
  event.starts_at !== undefined
    ? event
    : {
        ...event,
        starts_at: event.start ?? null,
        ends_at: event.end ?? null,
        all_day: event.allDay ?? false,
      }

export default function Calendar() {
  const [cursor, setCursor] = useState(() => new Date())
  const [modal, setModal] = useState(null)
  const [scheduling, setScheduling] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [dropDay, setDropDay] = useState(null)

  // A grade mostra semanas completas, então buscamos do primeiro dia da
  // primeira semana ao último da última — não do dia 1 ao 30.
  const { rangeStart, rangeEnd, days } = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
    return {
      rangeStart: start,
      rangeEnd: end,
      days: eachDayOfInterval({ start, end }),
    }
  }, [cursor])

  const { data, loading, error, refetch } = useFetch('/tasks/calendar/', {
    params: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
  })

  // As sem data não cabem na grade, mas precisam estar à mão: é delas que
  // sai o gesto de arrastar para um dia.
  const backlog = useFetch('/tasks/unscheduled/')

  const reload = () => {
    refetch()
    backlog.refetch()
  }

  const { menu, openMenu, closeMenu } = useContextMenu()
  const { buildMenu, dialogs } = useTaskActions({
    onChanged: reload,
    onEdit: (task) => setModal({ task }),
    onSchedule: (task) => setScheduling(task),
  })

  /** Solta uma tarefa num dia, preservando a hora que ela já tinha. */
  const dropOnDay = async (day, taskId) => {
    const task =
      (data ?? []).find((e) => e.id === taskId) ??
      (backlog.data ?? []).find((t) => t.id === taskId)

    const previous = task?.start ?? task?.starts_at
    const target = new Date(day)
    if (previous) {
      const old = new Date(previous)
      target.setHours(old.getHours(), old.getMinutes(), 0, 0)
    } else {
      target.setHours(9, 0, 0, 0)
    }

    await api.post(`/tasks/${taskId}/schedule/`, { starts_at: target.toISOString() })
    reload()
  }

  // Indexa por dia uma vez, em vez de filtrar a lista inteira em cada
  // uma das ~42 células da grade.
  const eventsByDay = useMemo(() => {
    const map = new Map()
    ;(data ?? []).forEach((event) => {
      const key = format(new Date(event.start), 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(event)
    })
    return map
  }, [data])

  const eventsFor = (day) => eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? []

  return (
    <>
      <PageHeader
        title="Calendário"
        subtitle={format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
        actions={
          <>
            <div className="flex items-center rounded-md border border-ink-200 dark:border-ink-700">
              <button
                onClick={() => setCursor((c) => subMonths(c, 1))}
                aria-label="Mês anterior"
                className="p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCursor(new Date())}
                className="border-x border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
              >
                Hoje
              </button>
              <button
                onClick={() => setCursor((c) => addMonths(c, 1))}
                aria-label="Próximo mês"
                className="p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <Button icon={Plus} onClick={() => setModal({ date: new Date() })}>
              Nova tarefa
            </Button>
          </>
        }
      />

      <PageBody>
        {error && <ErrorState message={error} onRetry={refetch} />}

        {/* Faixa "a agendar": as tarefas do quadro que ainda não têm data.
            Arrastar uma delas para um dia é o gesto que liga as duas telas. */}
        {backlog.data?.length > 0 && (
          <div className="mb-4 rounded-lg border border-dashed border-ink-200 p-3 dark:border-ink-700">
            <div className="mb-2 flex items-center gap-1.5">
              <Inbox size={13} className="text-ink-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                A agendar ({backlog.data.length})
              </h2>
              <span className="text-[11px] text-ink-400">
                — arraste para um dia do calendário
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {backlog.data.map((task) => (
                <button
                  key={task.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TASK_MIME, task.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => setScheduling(task)}
                  onContextMenu={(e) => openMenu(e, { task })}
                  title="Arraste para um dia ou clique para escolher a data"
                  className="inline-flex cursor-grab items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-600 transition hover:border-accent-400 hover:text-accent-700 active:cursor-grabbing dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300"
                >
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', TASK_PRIORITY[task.priority]?.className)}
                    style={{ backgroundColor: 'currentColor' }}
                  />
                  <span className="max-w-[190px] truncate">{task.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-ink-200 dark:border-ink-800">
          <div className="grid grid-cols-7 border-b border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/40">
            {WEEK_DAYS.map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="relative grid grid-cols-7">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-ink-950/60">
                <Spinner size={20} />
              </div>
            )}

            {days.map((day) => {
              const events = eventsFor(day)
              const outside = !isSameMonth(day, cursor)

              const isDropTarget = dropDay && isSameDay(day, dropDay)

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  onDoubleClick={() => setModal({ date: day })}
                  onDragOver={(e) => {
                    if (!Array.from(e.dataTransfer.types).includes(TASK_MIME)) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropDay(day)
                  }}
                  onDragLeave={() => setDropDay(null)}
                  onDrop={(e) => {
                    const taskId = e.dataTransfer.getData(TASK_MIME)
                    setDropDay(null)
                    if (!taskId) return
                    e.preventDefault()
                    dropOnDay(day, taskId)
                  }}
                  className={cn(
                    'min-h-[104px] border-b border-r border-ink-100 p-1.5 text-left align-top transition',
                    'last:border-r-0 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-900/60',
                    outside && 'bg-ink-50/40 dark:bg-ink-900/20',
                    selectedDay && isSameDay(day, selectedDay) && 'ring-1 ring-inset ring-accent-400',
                    isDropTarget && 'bg-accent-100 ring-1 ring-inset ring-accent-500 dark:bg-accent-500/20',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                      isToday(day)
                        ? 'bg-accent-600 font-semibold text-white'
                        : outside
                          ? 'text-ink-300 dark:text-ink-600'
                          : 'text-ink-600 dark:text-ink-300',
                    )}
                  >
                    {format(day, 'd')}
                  </span>

                  <div className="mt-1 space-y-1">
                    {events.slice(0, MAX_VISIBLE_PER_DAY).map((event) => (
                      <div
                        key={event.id}
                        title={`${event.title} — arraste para outro dia`}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation()
                          e.dataTransfer.setData(TASK_MIME, event.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onContextMenu={(e) => {
                          // O dia inteiro é um <button>; sem parar aqui, o
                          // menu abriria para a célula em vez da tarefa.
                          e.stopPropagation()
                          openMenu(e, { task: asTask(event) })
                        }}
                        className={cn(
                          'cursor-grab truncate rounded px-1.5 py-0.5 text-[11px] leading-4 active:cursor-grabbing',
                          event.status === 'done' && 'line-through opacity-60',
                          !event.color && 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                        )}
                        style={
                          event.color
                            ? { backgroundColor: `${event.color}22`, color: event.color }
                            : undefined
                        }
                      >
                        {event.title}
                      </div>
                    ))}
                    {events.length > MAX_VISIBLE_PER_DAY && (
                      <div className="px-1.5 text-[10px] text-ink-400">
                        +{events.length - MAX_VISIBLE_PER_DAY} mais
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Detalhe do dia selecionado */}
        {selectedDay && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
                {format(selectedDay, "d 'de' MMMM", { locale: ptBR })}
              </h2>
              <Button
                size="sm"
                variant="secondary"
                icon={Plus}
                onClick={() => setModal({ date: selectedDay })}
              >
                Adicionar
              </Button>
            </div>

            {eventsFor(selectedDay).length ? (
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
                {eventsFor(selectedDay).map((event) => (
                  <li key={event.id}>
                    <button
                      onClick={() => setScheduling(asTask(event))}
                      onContextMenu={(e) => openMenu(e, { task: asTask(event) })}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-ink-50 dark:hover:bg-ink-900"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: event.color || '#a8a29b' }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-700 dark:text-ink-200">
                        {event.title}
                      </span>
                      {!event.allDay && (
                        <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
                          {format(new Date(event.start), 'HH:mm')}
                        </span>
                      )}
                      <Badge className={TASK_STATUS[event.status]?.className}>
                        {TASK_STATUS[event.status]?.label}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400 dark:border-ink-800">
                <CalendarDays size={18} className="mx-auto mb-2 opacity-60" />
                Nenhuma tarefa neste dia.
              </p>
            )}
          </div>
        )}
      </PageBody>

      <TaskFormModal
        open={!!modal}
        task={modal?.task}
        defaultDate={modal?.date}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null)
          reload()
        }}
      />

      <TaskScheduler
        open={!!scheduling}
        task={scheduling}
        defaultDate={selectedDay}
        onClose={() => setScheduling(null)}
        onSaved={reload}
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

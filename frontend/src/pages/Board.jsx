import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CalendarPlus, Kanban, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, ErrorState, Spinner } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { useTaskActions } from '@/hooks/useTaskActions'
import { parseKey, useMultiSelect } from '@/hooks/useMultiSelect'
import FilterBar from '@/components/filters/FilterBar'
import TaskFormModal from '@/components/modals/TaskFormModal'
import BoardFormModal from '@/components/modals/BoardFormModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import TaskScheduler from '@/components/TaskScheduler'
import { TASK_PRIORITY, TASK_STATUS, cn, formatRelative } from '@/lib/utils'

/** MIME próprio: soltar uma tarefa não pode ser confundido com soltar texto. */
const TASK_MIME = 'application/x-notefy-task'

/** Durante o arraste o conteúdo é ilegível; só os tipos ficam visíveis. */
const isTaskDrag = (event) => Array.from(event.dataTransfer.types ?? []).includes(TASK_MIME)

function TaskCard({ task, onClick, onSchedule, onDragStart, onContextMenu, dragging, selecionada, idsParaArrastar }) {
  return (
    <article
      draggable
      onContextMenu={(event) => onContextMenu?.(event, { task })}
      onDragStart={(event) => {
        // O payload precisa ir no dataTransfer, e não só no estado do
        // React: sem ele o navegador não inicia o arraste de verdade.
        // Vai a LISTA de ids: arrastar um cartão que faz parte de uma
        // seleção arrasta a seleção inteira, como em qualquer gerenciador
        // de arquivos. Sozinho, a lista tem um elemento só.
        event.dataTransfer.setData(TASK_MIME, (idsParaArrastar ?? [task.id]).join(','))
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
        selecionada && 'ring-2 ring-accent-500 bg-accent-50/60 dark:bg-accent-500/10',
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
  const [draggingIds, setDraggingIds] = useState([])
  const [overColumn, setOverColumn] = useState(null)
  const [error, setError] = useState(null)

  const [boardId, setBoardId] = useState('')
  const [boardModal, setBoardModal] = useState(null)
  const [confirmBoard, setConfirmBoard] = useState(null)

  const debouncedQuery = useDebounced(query, 350)
  const { menu, openMenu, closeMenu } = useContextMenu()

  // A lista de quadros vem antes das tarefas: é ela que diz qual é o
  // padrão, e o padrão é o quadro que abre quando ninguém escolheu nada.
  const boards = useFetch('/boards/')
  const boardList = boards.data?.results ?? []
  const defaultBoard = boardList.find((b) => b.is_default) ?? boardList[0] ?? null
  const activeBoardId = boardId || defaultBoard?.id || ''
  const activeBoard = boardList.find((b) => b.id === activeBoardId) ?? null

  const { data, loading, refetch, ...rest } = useFetch('/tasks/board/', {
    params: {
      search: debouncedQuery || undefined,
      category: category || undefined,
      board: activeBoardId || undefined,
    },
    // Sem quadro resolvido ainda a requisição traria as tarefas de TODOS
    // os quadros por um instante, e o quadro piscaria com cartão alheio.
    enabled: !!activeBoardId,
    deps: [activeBoardId],
  })

  const { buildMenu, dialogs } = useTaskActions({
    onChanged: refetch,
    onEdit: (task) => setModal({ task }),
    onSchedule: (task) => setScheduling(task),
  })

  useEffect(() => {
    const limpar = () => setDraggingIds([])
    window.addEventListener('dragend', limpar)
    return () => window.removeEventListener('dragend', limpar)
  }, [])

  const columns = data?.columns ?? []

  // Ordem visual das tarefas: coluna a coluna, cartão a cartão. É essa
  // ordem que o Shift usa para decidir o que está "entre" dois cliques —
  // um intervalo pode atravessar colunas, e isso é proposital: mover "de
  // Fazendo até o fim de A fazer" de uma vez é o caso que motiva a feature.
  const selectableKeys = useMemo(
    () => columns.flatMap((coluna) => coluna.tasks.map((t) => `task:${t.id}`)),
    [columns],
  )

  const {
    selected: selecionadas,
    isSelected,
    clear: limparSelecao,
    handleClick: cliqueSelecao,
    handleContextMenu: menuSelecao,
  } = useMultiSelect(selectableKeys)

  /** Ids que um arraste iniciado neste cartão deve carregar. */
  const loteDoArraste = (taskId) =>
    isSelected(`task:${taskId}`)
      ? selecionadas.map((chave) => parseKey(chave).id)
      : [taskId]

  /** Avisa roadmap e calendário de que alguma tarefa mudou. */
  const notificarTarefa = (detail) =>
    window.dispatchEvent(new CustomEvent('notefy:task-changed', { detail }))

  /**
   * O menu de contexto serve três alvos: cartão, fundo de coluna e chip de
   * quadro. Rotear aqui em vez de montar três menus separados mantém o
   * `useTaskActions` como a única fonte das ações de tarefa.
   */
  const menuItems = () => {
    if (!menu) return []
    const { payload } = menu

    // Dentro de uma coluna a ação é sempre sobre tarefa: quem clicou ali
    // está olhando para "a fazer" / "fazendo", não para a lista de quadros.
    if (payload.type === 'column') {
      return [
        {
          label: 'Nova tarefa',
          icon: Plus,
          onClick: () => setModal({ status: payload.status }),
        },
      ]
    }

    // Fora das colunas — o fundo da página — só resta o quadro.
    if (payload.type === 'page') {
      return [{ label: 'Novo quadro', icon: Kanban, onClick: () => setBoardModal({}) }]
    }

    if (payload.type === 'board') {
      const board = payload.board
      return [
        { label: 'Abrir', icon: Kanban, onClick: () => setBoardId(board.id) },
        {
          label: 'Renomear',
          icon: Pencil,
          onClick: () => setBoardModal({ board }),
        },
        ...(board.is_default
          ? []
          : [
              {
                label: 'Tornar padrão',
                icon: Star,
                onClick: async () => {
                  await api.post(`/boards/${board.id}/make_default/`)
                  boards.refetch()
                },
              },
            ]),
        { separator: true },
        {
          label: 'Novo quadro',
          icon: Plus,
          onClick: () => setBoardModal({}),
        },
        // O padrão não aparece com "Excluir": a API recusaria, e oferecer
        // uma ação que sempre falha é pior do que não oferecer.
        ...(board.is_default
          ? []
          : [
              {
                label: 'Excluir',
                icon: Trash2,
                danger: true,
                onClick: () => setConfirmBoard(board),
              },
            ]),
      ]
    }

    // Com vários cartões marcados, o menu age sobre o lote. Mostrar aqui as
    // ações de um item só (editar, agendar) seria oferecer algo que ignora
    // silenciosamente o que a pessoa selecionou.
    if (payload.isMultiple) {
      const ids = selecionadas.map((chave) => parseKey(chave).id)
      return [
        ...columns.map((coluna) => ({
          label: `Mover para ${coluna.label}`,
          icon: Plus,
          onClick: () => moveTo(ids, coluna.status),
        })),
        { separator: true },
        { label: 'Limpar seleção', icon: X, onClick: limparSelecao },
      ]
    }

    return buildMenu(payload.task)
  }

  const moveTo = async (ids, status) => {
    setError(null)
    try {
      for (const taskId of ids) {
        await api.post(`/tasks/${taskId}/move/`, { status })
      }
      limparSelecao()
      // Recarregar em vez de mover otimista: o servidor é a verdade sobre
      // a ordem e sobre `completed_at`, que muda junto com o status.
      refetch()
      // Concluir uma tarefa aqui a tira do roadmap e muda a cor dela no
      // calendário. Essas telas não estão montadas agora, mas o evento
      // faz qualquer uma delas recarregar assim que reaparecer — e evita
      // que o usuário veja no roadmap um estado que o quadro já mudou.
      notificarTarefa({ taskIds: ids, status })
    } catch (err) {
      setError(extractError(err))
    }
  }

  return (
    <>
      <PageHeader
        title={activeBoard?.name || 'Quadro'}
        subtitle="Arraste os cartões entre as colunas para mudar o status."
      >
        {/* Um chip por quadro, com o `+` fechando a fileira. A fileira
            aparece mesmo com um quadro só: sem ela o `+` não teria onde
            morar, e criar o segundo quadro dependeria de adivinhar o menu
            de contexto. */}
        {boardList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {boardList.map((b) => {
              const active = b.id === activeBoardId
              return (
                <button
                  key={b.id}
                  onClick={() => setBoardId(b.id)}
                  onContextMenu={(event) => openMenu(event, { type: 'board', board: b })}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                    active
                      ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                  )}
                >
                  {b.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: b.color }}
                    />
                  )}
                  {b.name}
                  <span className="tabular-nums opacity-70">{b.task_count}</span>
                </button>
              )
            })}

            <button
              onClick={() => setBoardModal({})}
              title="Novo quadro"
              aria-label="Novo quadro"
              className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border border-dashed border-ink-300 text-ink-400 transition hover:border-accent-500 hover:text-accent-600 dark:border-ink-700 dark:hover:border-accent-500"
            >
              <Plus size={13} />
            </button>
          </div>
        )}

        <FilterBar
          className="mt-4"
          query={query}
          onQueryChange={setQuery}
          placeholder="Buscar tarefas..."
          category={category}
          onCategoryChange={setCategory}
        />
      </PageHeader>

      {/* Botão direito no fundo da página inteira, e não só nas colunas:
          é a camada mais externa, então só recebe o evento quando nenhuma
          coluna e nenhum cartão o interceptou antes. */}
      <PageBody
        className="min-h-full"
        onContextMenu={(event) => openMenu(event, { type: 'page' })}
      >
        {(error || rest.error) && (
          <ErrorState message={error || rest.error} onRetry={refetch} />
        )}

        {loading && !data ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : (
          // O `ring` da coluna destacada é desenhado FORA da caixa dela, e
          // `overflow-x-auto` recorta os dois eixos (basta um eixo não ser
          // `visible` para o outro deixar de ser). Sem folga, o realce
          // sumia no topo de todas as colunas e na borda esquerda da
          // primeira. O padding abre espaço para o anel e a margem
          // negativa devolve o alinhamento original.
          <div className="-mx-1 -mt-1 flex gap-4 overflow-x-auto px-1 pb-4 pt-1">
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
                    const bruto = event.dataTransfer.getData(TASK_MIME)
                    const ids = (bruto ? bruto.split(',') : draggingIds).filter(Boolean)
                    setOverColumn(null)
                    setDraggingIds([])
                    // Só o que ainda não está nesta coluna: soltar uma
                    // seleção mista não deve gerar chamadas inúteis.
                    const mover = ids.filter((id) => !column.tasks.some((t) => t.id === id))
                    if (mover.length) moveTo(mover, column.status)
                  }}
                  // Botão direito em qualquer ponto da coluna que não seja
                  // um cartão. Não há guarda de `target` aqui: o cartão tem
                  // o próprio handler, e `openMenu` já dá `stopPropagation`
                  // — quem está mais dentro atende primeiro e o evento morre
                  // ali. A guarda antiga (`target !== currentTarget`) fazia
                  // o cabeçalho da coluna vazar para o menu da página.
                  onContextMenu={(event) =>
                    openMenu(event, { type: 'column', status: column.status })
                  }
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
                        selecionada={isSelected(`task:${task.id}`)}
                        idsParaArrastar={loteDoArraste(task.id)}
                        dragging={draggingIds.includes(task.id)}
                        onDragStart={() => setDraggingIds(loteDoArraste(task.id))}
                        onClick={(event) =>
                          cliqueSelecao(`task:${task.id}`, event, () => setModal({ task }))
                        }
                        onSchedule={() => setScheduling(task)}
                        onContextMenu={(event, payload) => {
                          const total = menuSelecao(`task:${task.id}`)
                          openMenu(event, { ...payload, isMultiple: total > 1 })
                        }}
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
        defaultBoardId={activeBoardId}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null)
          refetch()
          boards.refetch()
          // Criar ou editar aqui muda a barra no roadmap e o chip no
          // calendário. Sem o aviso, uma tarefa criada no quadro só
          // aparecia no roadmap depois de um F5.
          notificarTarefa()
        }}
      />

      <TaskScheduler
        open={!!scheduling}
        task={scheduling}
        onClose={() => setScheduling(null)}
        onSaved={() => {
          refetch()
          notificarTarefa()
        }}
      />

      <BoardFormModal
        open={!!boardModal}
        board={boardModal?.board}
        onClose={() => setBoardModal(null)}
        onSaved={(saved) => {
          setBoardModal(null)
          boards.refetch()
          // Criar um quadro e continuar olhando o antigo seria estranho:
          // quem acabou de criar quer vê-lo.
          if (saved?.id) setBoardId(saved.id)
        }}
      />

      <ConfirmDialog
        open={!!confirmBoard}
        title="Excluir quadro"
        message={
          <>
            O quadro <strong>{confirmBoard?.name}</strong> será removido. As tarefas
            dele não se perdem: voltam para o quadro padrão.
          </>
        }
        onClose={() => setConfirmBoard(null)}
        onConfirm={async () => {
          await api.delete(`/boards/${confirmBoard.id}/`)
          if (confirmBoard.id === activeBoardId) setBoardId('')
          boards.refetch()
          refetch()
        }}
      />

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menuItems()}
      />
      {dialogs}
    </>
  )
}

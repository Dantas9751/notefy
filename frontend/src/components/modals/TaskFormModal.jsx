import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useFetch, useMutation } from '@/hooks/useFetch'
import { useWorkspace, flattenFolders } from '@/context/WorkspaceContext'
import { Button, ErrorState, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { TASK_PRIORITY, TASK_STATUS } from '@/lib/utils'

/** ISO -> valor aceito por <input type="datetime-local"> (sem timezone). */
function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

const EMPTY = {
  board: '',
  title: '',
  description: '',
  status: 'todo',
  priority: 1,
  starts_at: '',
  ends_at: '',
  all_day: false,
  folder: '',
  document: '',
}

export default function TaskFormModal({
  open,
  onClose,
  onSaved,
  task,
  defaultDate,
  defaultEndDate,
  defaultStatus,
  defaultBoardId,
}) {
  const { categories } = useWorkspace()
  const [form, setForm] = useState(EMPTY)
  const isEditing = Boolean(task)

  useEffect(() => {
    if (!open) return
    setForm(
      task
        ? {
            title: task.title ?? '',
            description: task.description ?? '',
            status: task.status ?? 'todo',
            priority: task.priority ?? 1,
            starts_at: toLocalInput(task.starts_at),
            ends_at: toLocalInput(task.ends_at),
            all_day: task.all_day ?? false,
            folder: task.folder ?? '',
            document: task.document ?? '',
          }
        : {
            ...EMPTY,
            // Criada pelo `+` de uma coluna: nasce naquele status. Vinda
            // do calendário, não há coluna, então fica "a fazer" (o
            // default de EMPTY) e a data escolhida é que a posiciona.
            status: defaultStatus ?? EMPTY.status,
            board: defaultBoardId ?? '',
            starts_at: defaultDate ? toLocalInput(defaultDate) : '',
            // Vem preenchido quando a pessoa arrastou por vários dias no
            // calendário: a tarefa já nasce com duração, e é isso que faz
            // o roadmap desenhar uma barra em vez de um risco.
            ends_at: defaultEndDate ? toLocalInput(defaultEndDate) : '',
          },
    )
  }, [open, task, defaultDate, defaultEndDate, defaultStatus, defaultBoardId])

  const boards = useFetch('/boards/', { enabled: open })
  const boardList = boards.data?.results ?? []

  const { mutate, loading, error, setError } = useMutation(async (payload) => {
    const body = {
      ...payload,
      priority: Number(payload.priority),
      // Campos vazios viram null: o DRF rejeitaria "" num DateTimeField.
      starts_at: payload.starts_at ? new Date(payload.starts_at).toISOString() : null,
      ends_at: payload.ends_at ? new Date(payload.ends_at).toISOString() : null,
      folder: payload.folder || null,
      // Vazio vira null e o backend resolve para o quadro padrao.
      board: payload.board || null,
      document: payload.document || null,
    }
    return isEditing ? api.patch(`/tasks/${task.id}/`, body) : api.post('/tasks/', body)
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const { data } = await mutate(form)
      onSaved?.(data)
    } catch {
      /* erro já exibido */
    }
  }

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar tarefa' : 'Nova tarefa'}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            {isEditing ? 'Salvar' : 'Criar tarefa'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorState message={error} onRetry={() => setError(null)} />}

        <Field label="Título">
          <Input value={form.title} onChange={set('title')} autoFocus required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={form.status} onChange={set('status')}>
              {Object.entries(TASK_STATUS).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quadro">
            <Select value={form.board} onChange={set('board')}>
              {/* Sem opcao vazia: toda tarefa vive num quadro, e deixar
                  "nenhum" sugeriria um estado que nao existe. */}
              {boardList.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                  {board.is_default ? ' (padrão)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prioridade">
            <Select value={form.priority} onChange={set('priority')}>
              {Object.entries(TASK_PRIORITY).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <Input type="datetime-local" value={form.starts_at} onChange={set('starts_at')} />
          </Field>
          <Field label="Fim">
            <Input
              type="datetime-local"
              value={form.ends_at}
              onChange={set('ends_at')}
              min={form.starts_at || undefined}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
          <input
            type="checkbox"
            checked={form.all_day}
            onChange={set('all_day')}
            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
          />
          Dia inteiro
        </label>

        <Field label="Pasta">
          <Select value={form.folder} onChange={set('folder')}>
            <option value="">Sem pasta</option>
            {flattenFolders(categories).map((node) => (
              <option key={node.id} value={node.id}>
                {' '.repeat(node._depth * 3)}
                {node.name} ({node._category.name})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Descrição">
          <Textarea rows={3} value={form.description} onChange={set('description')} />
        </Field>
      </form>
    </Modal>
  )
}

import { useState } from 'react'
import { CalendarClock, CalendarX2 } from 'lucide-react'
import api from '@/lib/api'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { useFetch } from '@/hooks/useFetch'

/** ISO -> valor aceito por <input type="datetime-local"> (sem timezone). */
export function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/**
 * Agendar ou desagendar uma tarefa.
 *
 * É a ponte entre o quadro e o calendário: uma tarefa sem data vive só no
 * Kanban, e ganhar data é o que a faz aparecer na agenda. Ter um diálogo
 * curto e dedicado evita abrir o formulário inteiro só para marcar um dia.
 */
export default function TaskScheduler({ open, task, onClose, onSaved, defaultDate }) {
  const [form, setForm] = useState({ starts_at: '', ends_at: '', all_day: false, board: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Recarrega o formulário sempre que uma tarefa diferente é aberta.
  const [loadedFor, setLoadedFor] = useState(null)
  if (open && task && loadedFor !== task.id) {
    setLoadedFor(task.id)
    setForm({
      starts_at: toLocalInput(task.starts_at) || toLocalInput(defaultDate),
      ends_at: toLocalInput(task.ends_at),
      all_day: task.all_day ?? false,
      board: task.board ?? '',
    })
  }
  if (!open && loadedFor !== null) setLoadedFor(null)

  const boards = useFetch('/boards/', { enabled: open })
  const boardList = boards.data?.results ?? []
  // O quadro da tarefa manda; se ela ainda nao tem um, cai no padrao. E o
  // que faz agendar pelo calendario nunca produzir tarefa sem Kanban.
  const boardAtual =
    form.board || boardList.find((b) => b.is_default)?.id || boardList[0]?.id || ''

  const submit = async (clear = false) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post(`/tasks/${task.id}/schedule/`, {
        starts_at: clear ? null : new Date(form.starts_at).toISOString(),
        ends_at: clear || !form.ends_at ? null : new Date(form.ends_at).toISOString(),
        all_day: form.all_day,
      })
      // O agendamento nao mexe no quadro; se mudou, e um PATCH a parte.
      if (boardAtual && boardAtual !== task.board) {
        await api.patch(`/tasks/${task.id}/`, { board: boardAtual })
      }
      onSaved?.(data)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.starts_at ?? 'Não foi possível salvar a data.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agendar tarefa"
      description={task?.title}
      size="sm"
      footer={
        <>
          {task?.starts_at && (
            <Button
              variant="secondary"
              icon={CalendarX2}
              onClick={() => submit(true)}
              className="mr-auto"
            >
              Tirar da agenda
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={CalendarClock}
            loading={loading}
            disabled={!form.starts_at}
            onClick={() => submit(false)}
          >
            Agendar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}

        <Field label="Início">
          <Input
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
            autoFocus
          />
        </Field>

        <Field label="Quadro" hint="Em qual Kanban esta tarefa aparece.">
          <Select
            value={boardAtual}
            onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}
          >
            {boardList.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
                {board.is_default ? ' (padrão)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fim" hint="Opcional. Deixe vazio para um compromisso pontual.">
          <Input
            type="datetime-local"
            value={form.ends_at}
            min={form.starts_at || undefined}
            onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
          <input
            type="checkbox"
            checked={form.all_day}
            onChange={(e) => setForm((f) => ({ ...f, all_day: e.target.checked }))}
            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
          />
          Dia inteiro
        </label>
      </div>
    </Modal>
  )
}

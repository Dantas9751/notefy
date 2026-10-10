import { useState } from 'react'
import { CalendarClock, CalendarX2 } from 'lucide-react'
import api from '@/lib/api'
import { Button, ErrorState, Field, Input, Modal, Select } from '@/components/ui'
import { DATA_MAX, DATA_MIN, erroDoPeriodo, toLocalInput } from '@/lib/datas'
import { useFetch } from '@/hooks/useFetch'
import { t } from '@/lib/i18n'



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
    if (!clear) {
      // Valida ANTES de montar o ISO: é aqui que "ano 0000" e "31 de
      // fevereiro" apareciam como erro genérico de salvamento.
      const problema = erroDoPeriodo(form.starts_at, form.ends_at)
      if (problema) {
        setError(problema)
        return
      }
    }
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
      setError(err?.response?.data?.starts_at ?? t('Não foi possível salvar a data.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Agendar tarefa')}
      description={task?.title}
      // "md" e não "sm": com "Tirar da agenda", os três botões não cabiam
      // numa linha e o primeiro quebrava em duas.
      size="md"
      footer={
        <>
          {task?.starts_at && (
            // Ação de saída, não de confirmar: discreta, à esquerda, numa linha
            // só (no modal estreito ela quebrava em duas ao lado dos botões).
            <Button
              variant="ghost"
              icon={CalendarX2}
              onClick={() => submit(true)}
              className="mr-auto whitespace-nowrap"
            >
              {t('Tirar da agenda')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          <Button
            icon={CalendarClock}
            loading={loading}
            disabled={!form.starts_at}
            onClick={() => submit(false)}
          >
            {t('Agendar')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorState message={error} />}

        <Field label={t('Início')}>
          <Input
            type="datetime-local"
            value={form.starts_at}
            min={DATA_MIN}
            max={DATA_MAX}
            step={60}
            onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
            autoFocus
          />
        </Field>

        <Field label={t('Quadro')} hint={t('Em qual Kanban esta tarefa aparece.')}>
          <Select
            value={boardAtual}
            onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}
          >
            {boardList.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
                {board.is_default ? t(' (padrão)') : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('Fim')} hint={t('Opcional. Deixe vazio para um compromisso pontual.')}>
          <Input
            type="datetime-local"
            value={form.ends_at}
            min={form.starts_at || DATA_MIN}
            max={DATA_MAX}
            step={60}
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
          {t('Dia inteiro')}
        </label>
      </div>
    </Modal>
  )
}

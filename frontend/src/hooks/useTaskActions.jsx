import { useCallback, useState } from 'react'
import { CalendarClock, CalendarX2, Check, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import ConfirmDialog from '@/components/modals/ConfirmDialog'

/**
 * Ações de tarefa com os diálogos que elas pedem.
 *
 * Espelha `useDocumentActions`: o quadro e o calendário mostram a mesma
 * tarefa em lugares diferentes, e reimplementar o menu em cada tela
 * significaria dois comportamentos divergindo com o tempo.
 */
export function useTaskActions({ onChanged, onEdit, onSchedule } = {}) {
  const [deleting, setDeleting] = useState(null)

  /**
   * Recarrega a tela que abriu o menu E avisa as outras.
   *
   * Roadmap e calendário mostram a mesma tarefa por outro ângulo, e o
   * `onChanged` só alcança quem passou o callback. Concluir uma tarefa no
   * quadro tirava ela do roadmap apenas depois de um recarregamento.
   */
  const avisar = useCallback(() => {
    onChanged?.()
    window.dispatchEvent(new CustomEvent('notefy:task-changed'))
  }, [onChanged])

  const buildMenu = useCallback(
    (task) => {
      const done = task.status === 'done'
      return [
        { label: 'Editar', icon: Pencil, onClick: () => onEdit?.(task) },
        {
          label: task.starts_at ? 'Alterar data' : 'Agendar',
          icon: CalendarClock,
          onClick: () => onSchedule?.(task),
        },
        task.starts_at && {
          label: 'Tirar da agenda',
          icon: CalendarX2,
          onClick: async () => {
            await api.post(`/tasks/${task.id}/schedule/`, { starts_at: null })
            avisar()
          },
        },
        { separator: true },
        {
          label: done ? 'Reabrir' : 'Marcar como concluída',
          icon: done ? RotateCcw : Check,
          onClick: async () => {
            await api.post(`/tasks/${task.id}/toggle/`)
            avisar()
          },
        },
        {
          label: 'Excluir',
          icon: Trash2,
          danger: true,
          onClick: () => setDeleting(task),
        },
      ].filter(Boolean)
    },
    [avisar, onEdit, onSchedule],
  )

  const dialogs = (
    <ConfirmDialog
      open={!!deleting}
      title="Excluir tarefa"
      message={
        <>
          <strong>{deleting?.title}</strong> será removida permanentemente.
        </>
      }
      onClose={() => setDeleting(null)}
      onConfirm={async () => {
        await api.delete(`/tasks/${deleting.id}/`)
        avisar()
      }}
    />
  )

  return { buildMenu, dialogs }
}

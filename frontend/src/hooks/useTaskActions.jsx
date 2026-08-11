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
            onChanged?.()
          },
        },
        { separator: true },
        {
          label: done ? 'Reabrir' : 'Marcar como concluída',
          icon: done ? RotateCcw : Check,
          onClick: async () => {
            await api.post(`/tasks/${task.id}/toggle/`)
            onChanged?.()
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
    [onChanged, onEdit, onSchedule],
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
        onChanged?.()
      }}
    />
  )

  return { buildMenu, dialogs }
}

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useMutation } from '@/hooks/useFetch'
import { Button, ErrorState, Field, Input, Modal } from '@/components/ui'
import ColorWheel from '@/components/ui/ColorWheel'
import { cn } from '@/lib/utils'

const PRESET_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

const EMPTY = { name: '', color: PRESET_COLORS[0] }

/**
 * Criar ou renomear um quadro.
 *
 * Mesmo formato do CategoryFormModal — presets mais o círculo cromático —
 * porque quadro e categoria são a mesma decisão para o usuário: um nome e
 * uma cor que o ajuda a reconhecer aquilo de relance.
 */
export default function BoardFormModal({ open, onClose, onSaved, board }) {
  const [form, setForm] = useState(EMPTY)

  useEffect(() => {
    if (!open) return
    setForm(
      board
        ? { name: board.name ?? '', color: board.color || PRESET_COLORS[0] }
        : EMPTY,
    )
    setError(null)
  }, [open, board])

  const { mutate, loading, error, setError } = useMutation(async (payload) =>
    board ? api.patch(`/boards/${board.id}/`, payload) : api.post('/boards/', payload),
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      const { data } = await mutate(form)
      onSaved?.(data)
    } catch {
      /* a mensagem aparece no ErrorState */
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={board ? 'Renomear quadro' : 'Novo quadro'}
      description={
        board ? undefined : 'Um conjunto separado de tarefas, com as mesmas colunas.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!form.name.trim()}>
            {board ? 'Salvar' : 'Criar quadro'}
          </Button>
        </>
      }
    >
      {error && <ErrorState message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Faculdade, Casa, Trabalho..."
            autoFocus
            required
          />
        </Field>

        <Field label="Cor">
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color }))}
                title={color}
                aria-label={color}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition',
                  form.color === color
                    ? 'border-ink-900 dark:border-white'
                    : 'border-ink-200 dark:border-ink-700',
                )}
                style={{ backgroundColor: color }}
              />
            ))}
            <ColorWheel
              value={form.color}
              onChange={(color) => setForm((f) => ({ ...f, color }))}
              selected={!PRESET_COLORS.includes(form.color)}
            />
          </div>
        </Field>
      </form>
    </Modal>
  )
}

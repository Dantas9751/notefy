import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useMutation } from '@/hooks/useFetch'
import { Button, ErrorState, Field, Input, Modal, Textarea } from '@/components/ui'
import ColorWheel from '@/components/ui/ColorWheel'
import { cn } from '@/lib/utils'

const PRESET_COLORS = [
  '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#8B5CF6', '#64748B',
]

const EMPTY = { name: '', color: PRESET_COLORS[0], description: '' }

export default function CategoryFormModal({ open, onClose, onSaved, category }) {
  const [form, setForm] = useState(EMPTY)
  const isEditing = Boolean(category)

  useEffect(() => {
    if (!open) return
    setForm(
      category
        ? {
            name: category.name ?? '',
            color: category.color ?? PRESET_COLORS[0],
            description: category.description ?? '',
          }
        : EMPTY,
    )
  }, [open, category])

  // Listener para submeter o formulário com a tecla Enter de qualquer lugar do modal
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        // Se estiver no Textarea, permite quebra de linha normal
        if (e.target.tagName === 'TEXTAREA') return

        e.preventDefault()
        const formEl = document.getElementById('category-form')
        if (formEl) {
          if (formEl.requestSubmit) {
            formEl.requestSubmit()
          } else {
            formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const { mutate, loading, error, setError } = useMutation(async (payload) =>
    isEditing
      ? api.patch(`/categories/${category.id}/`, payload)
      : api.post('/categories/', payload),
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const { data } = await mutate(form)
      onSaved?.(data)
    } catch {
      /* erro exibido no ErrorState */
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar categoria' : 'Nova categoria'}
      description="Categorias são o topo da organização: toda pasta mora dentro de uma."
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          {/* Conectado ao form id="category-form" */}
          <Button type="submit" form="category-form" loading={loading}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorState message={error} onRetry={() => setError(null)} />}

        <Field label="Nome">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ex.: Biologia"
            autoFocus
            required
          />
        </Field>

        <Field label="Cor">
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color }))}
                style={{ backgroundColor: color }}
                aria-label={`Cor ${color}`}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition',
                  form.color === color ? 'border-ink-900 dark:border-white' : 'border-transparent',
                )}
              />
            ))}

            <ColorWheel
              value={form.color}
              selected={!PRESET_COLORS.includes(form.color)}
              onChange={(color) => setForm((f) => ({ ...f, color }))}
            />
          </div>
        </Field>

        <Field label="Descrição">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
      </form>
    </Modal>
  )
}
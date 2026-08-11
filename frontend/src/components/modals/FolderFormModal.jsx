import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useMutation } from '@/hooks/useFetch'
import { useWorkspace, flattenFolders } from '@/context/WorkspaceContext'
import { Button, ErrorState, Field, Input, Modal, Select, Textarea } from '@/components/ui'

const PRESET_COLORS = [
  '', '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#8B5CF6', '#64748B',
]

const EMPTY = { name: '', description: '', color: '', category: '', parent: '' }

/**
 * Criar ou editar pasta.
 *
 * Uma pasta raiz precisa de categoria; uma subpasta herda a do pai e nem
 * mostra o campo — deixar escolher daria a impressão de que uma subpasta
 * de "Biologia" poderia virar "Cálculo" sem sair do lugar.
 */
export default function FolderFormModal({
  open,
  onClose,
  onSaved,
  folder,
  parent,
  categoryId,
}) {
  const { categories, categoryList } = useWorkspace()
  const [form, setForm] = useState(EMPTY)

  const isEditing = Boolean(folder)

  useEffect(() => {
    if (!open) return
    setForm(
      folder
        ? {
            name: folder.name ?? '',
            description: folder.description ?? '',
            color: folder.color ?? '',
            category: folder.category ?? categoryId ?? '',
            parent: folder.parent ?? '',
          }
        : {
            ...EMPTY,
            parent: parent?.id ?? '',
            category: parent ? '' : (categoryId ?? categoryList[0]?.id ?? ''),
          },
    )
  }, [open, folder, parent, categoryId, categoryList])

  const isSubfolder = Boolean(form.parent)

  const { mutate, loading, error, setError } = useMutation(async (payload) => {
    const body = {
      name: payload.name,
      description: payload.description,
      color: payload.color,
      parent: payload.parent || null,
    }
    // Subpasta herda a categoria do pai; mandar o campo só confundiria a
    // validação do backend, que já ignora o valor nesse caso.
    if (!payload.parent) body.category = payload.category

    return isEditing
      ? api.patch(`/folders/${folder.id}/`, body)
      : api.post('/folders/', body)
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const { data } = await mutate(form)
      onSaved?.(data)
    } catch {
      /* mensagem já exposta em `error` */
    }
  }

  // A própria pasta e seus descendentes não podem ser o novo pai — a API
  // rejeitaria com erro de ciclo, então nem os oferecemos.
  const parentOptions = flattenFolders(categories).filter((node) => {
    if (!isEditing) return true
    if (node.id === folder.id) return false
    return !(node.path && folder.path && node.path.startsWith(folder.path))
  })

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar pasta' : 'Nova pasta'}
      description={parent && !isEditing ? `Dentro de "${parent.name}"` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            {isEditing ? 'Salvar' : 'Criar pasta'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorState message={error} onRetry={() => setError(null)} />}

        <Field label="Nome">
          <Input
            value={form.name}
            onChange={set('name')}
            placeholder="Ex.: Cálculo II"
            autoFocus
            required
          />
        </Field>

        <Field
          label="Dentro de"
          hint="Escolha uma pasta para criar uma subpasta, ou deixe vazio para ficar na raiz da categoria."
        >
          <Select value={form.parent} onChange={set('parent')}>
            <option value="">— Raiz da categoria —</option>
            {parentOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {'   '.repeat(node._depth)}
                {node.name} ({node._category.name})
              </option>
            ))}
          </Select>
        </Field>

        {!isSubfolder && (
          <Field label="Categoria" hint="Toda pasta raiz pertence a uma categoria.">
            <Select value={form.category} onChange={set('category')} required>
              <option value="">— Escolha —</option>
              {categoryList.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Cor">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color || 'none'}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color }))}
                style={color ? { backgroundColor: color } : undefined}
                aria-label={color || 'Sem cor'}
                className={`h-6 w-6 rounded-full border-2 text-[10px] text-ink-400 transition ${
                  form.color === color
                    ? 'border-ink-900 dark:border-white'
                    : 'border-ink-200 dark:border-ink-700'
                }`}
              >
                {!color && '×'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Descrição">
          <Textarea rows={2} value={form.description} onChange={set('description')} />
        </Field>
      </form>
    </Modal>
  )
}

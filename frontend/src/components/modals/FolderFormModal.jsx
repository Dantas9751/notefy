import { useEffect, useState, useRef } from 'react'
import api from '@/lib/api'
import { useMutation } from '@/hooks/useFetch'
import { useWorkspace, flattenFolders } from '@/context/WorkspaceContext'
import { Plus, Tag } from 'lucide-react'
import { Button, ErrorState, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import ColorWheel from '@/components/ui/ColorWheel'
import CategoryFormModal from '@/components/modals/CategoryFormModal'

const PRESET_COLORS = [
  '', '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#8B5CF6', '#64748B',
]

/**
 * Criar ou editar pasta.
 */
export default function FolderFormModal({
  open,
  onClose,
  onSaved,
  folder,
  parent,
  categoryId,
}) {
  const { categories, categoryList, refresh } = useWorkspace()
  
  // Ref para controlar o form manualmente
  const formRef = useRef(null)

  const [color, setColor] = useState('')
  const [parentVal, setParentVal] = useState('')
  const [categoryVal, setCategoryVal] = useState('')
  const [categoriaModal, setCategoriaModal] = useState(false)
  const [initialData, setInitialData] = useState(null)

  const isEditing = Boolean(folder)

  const { mutate, loading, error, setError } = useMutation(async (payload) => {
    const body = {
      name: payload.name,
      description: payload.description,
      color: payload.color,
      parent: payload.parent || null,
    }
    if (!payload.parent) body.category = payload.category

    return isEditing
      ? api.patch(`/folders/${folder.id}/`, body)
      : api.post('/folders/', body)
  })

  const primeiraCategoria = categoryList[0]?.id

  useEffect(() => {
    if (open) {
      setError(null)
      setColor(folder?.color ?? '')
      setParentVal(folder?.parent ?? parent?.id ?? '')
      setCategoryVal(folder?.category ?? categoryId ?? primeiraCategoria ?? '')
      setInitialData({
        name: folder?.name ?? '',
        description: folder?.description ?? '',
      })
    } else {
      setError(null)
      setInitialData(null)
    }

    return () => setError(null)
  }, [open, folder, parent?.id, categoryId, primeiraCategoria, setError])

  // A função que processa os dados de verdade
  const handleAction = async () => {
    if (!formRef.current) return
    
    // Força validação do HTML5 (ex: campos required) antes de prosseguir
    if (!formRef.current.checkValidity()) {
      formRef.current.reportValidity()
      return
    }
    
    const fd = new FormData(formRef.current)
    const payload = {
      name: fd.get('name'),
      description: fd.get('description'),
      parent: parentVal,
      category: categoryVal,
      color: color,
    }

    try {
      const { data } = await mutate(payload)
      onSaved?.(data)
    } catch {
      /* Erro já exibido no ErrorState */
    }
  }

  // O MURO DE CONCRETO: Intercepta o comportamento de submit do HTML
  const handleFormSubmit = (e) => {
    e.preventDefault() // Bloqueia o F5 nativo instantaneamente
    e.stopPropagation()
    handleAction()
  }

  const parentOptions = flattenFolders(categories).filter((node) => {
    if (!isEditing) return true
    if (node.id === folder?.id) return false
    return !(node.path && folder?.path && node.path.startsWith(folder.path))
  })

  const handleClose = () => {
    setError(null)
    onClose?.()
  }

  if (!initialData) return null

  const isSubfolder = Boolean(parentVal)

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEditing ? 'Editar pasta' : 'Nova pasta'}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} type="button">
            Cancelar
          </Button>
          <Button type="button" onClick={handleAction} loading={loading}>
            {isEditing ? 'Salvar' : 'Criar pasta'}
          </Button>
        </>
      }
    >
      {/* O onSubmit é a chave aqui. O navegador traduz o Enter no Input para esse evento automaticamente. */}
      <form ref={formRef} onSubmit={handleFormSubmit} className="space-y-4">
        {error && <ErrorState message={error} onRetry={() => setError(null)} />}

        <Field label="Nome">
          <Input
            name="name"
            defaultValue={initialData.name}
            placeholder="Ex.: Cálculo II"
            autoFocus
            required
          />
        </Field>

        <Field label="Dentro de" hint="Escolha uma pasta para criar subpasta, ou raiz.">
          <Select name="parent" value={parentVal} onChange={(e) => setParentVal(e.target.value)}>
            <option value="">Raiz da categoria</option>
            {parentOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(node._depth)}
                {node.name} ({node._category.name})
              </option>
            ))}
          </Select>
        </Field>

        {!isSubfolder && (
          <Field label="Categoria" hint="Toda pasta raiz pertence a uma categoria.">
            <div className="flex gap-2">
              <Select name="category" value={categoryVal} onChange={(e) => setCategoryVal(e.target.value)} required className="flex-1">
                <option value="">Escolha</option>
                {categoryList.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              
              <Button type="button" variant="secondary" icon={Tag} onClick={() => setCategoriaModal(true)} title="Nova categoria" />
            </div>
          </Field>
        )}

        <Field label="Cor">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c || 'none'}
                type="button"
                onClick={() => setColor(c)}
                style={c ? { backgroundColor: c } : undefined}
                className={`h-6 w-6 rounded-full border-2 text-[10px] text-ink-400 transition ${
                  color === c ? 'border-ink-900 dark:border-white' : 'border-ink-200 dark:border-ink-700'
                }`}
              >
                {!c && '×'}
              </button>
            ))}
            <ColorWheel value={color} selected={!PRESET_COLORS.includes(color)} onChange={setColor} className="h-6 w-6" />
          </div>
        </Field>

        <Field label="Descrição">
          <Textarea name="description" rows={2} defaultValue={initialData.description} />
        </Field>
      </form>

      <CategoryFormModal
        open={categoriaModal}
        onClose={() => setCategoriaModal(false)}
        onSaved={(categoria) => {
          setCategoriaModal(false)
          refresh()
          if (categoria?.id) setCategoryVal(categoria.id)
        }}
      />
    </Modal>
  )
}
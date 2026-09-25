import { useEffect, useState } from 'react'
import { ChevronRight, FolderInput } from 'lucide-react'
import { useWorkspace, findFolder } from '@/context/WorkspaceContext'
import { Button, ColorDot, Field, Modal, Select } from '@/components/ui'
import DestinationModal from './DestinationModal'
import { DOCUMENT_STATUS } from '@/lib/documents'
import { cn } from '@/lib/utils'

const COLORS = [
  '', '#4F46E5', '#0EA5E9', '#10B981',
  '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6',
]

/**
 * Propriedades de um item: onde mora, etiquetas, status e cor.
 *
 * "Onde mora" e "etiquetas" são coisas diferentes de propósito. A pasta
 * dá a categoria de MORADIA — um item mora num lugar só. As etiquetas
 * são transversais: a mesma nota é "Cálculo III" (onde está) e também
 * "prova" e "revisar" (o que ela é). Antes só existia a primeira, e
 * marcar uma nota como "revisar" exigia movê-la de pasta.
 */
export default function DocumentMetaModal({ open, onClose, document: doc, onSave, saving }) {
  const { categories } = useWorkspace()
  const [form, setForm] = useState({ folder: '', status: 'draft', color: '', categories: [] })
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (!open || !doc) return
    setForm({
      folder: doc.folder ?? '',
      status: doc.status ?? 'draft',
      color: doc.color ?? '',
      // A API devolve `categories_detail` (objetos) e aceita `categories`
      // (ids). O formulário guarda ids, que é o que o PATCH manda.
      categories: (doc.categories_detail ?? []).map((c) => c.id),
    })
  }, [open, doc])

  const folder = findFolder(categories, form.folder)

  return (
    <>
      <Modal
        open={open && !picking}
        onClose={onClose}
        title="Propriedades"
        description={doc?.title}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={saving} disabled={!form.folder} onClick={() => onSave(form)}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Onde mora" hint="A categoria do item vem da pasta escolhida.">
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex w-full items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-left text-sm transition hover:bg-ink-50 overflow-hidden dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800"
            >
              {folder ? (
                <>
                  <div className="shrink-0">
                    <ColorDot color={folder._category?.color} size={7} />
                  </div>
                  
                  <div className="flex min-w-0 flex-1 items-center text-ink-800 dark:text-ink-100">
                    <span className="truncate">{folder._category?.name}</span>
                    <ChevronRight size={13} className="mx-1 shrink-0 text-ink-400" />
                    <span className="truncate font-medium">{folder.name}</span>
                  </div>
                </>
              ) : (
                <span className="flex-1 text-ink-400">Escolher pasta...</span>
              )}
              <FolderInput size={14} className="shrink-0 text-ink-400" />
            </button>
          </Field>

          <Field
            label="Etiquetas"
            hint="Atravessam as pastas: a mesma nota pode ser “prova” e “revisar”."
          >
            <div className="flex flex-wrap gap-1.5">
              {categories.length === 0 && (
                <p className="text-xs text-ink-400">
                  Nenhuma categoria criada ainda.
                </p>
              )}
              {categories.map((categoria) => {
                const marcada = form.categories.includes(categoria.id)
                return (
                  <button
                    key={categoria.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        categories: marcada
                          ? f.categories.filter((id) => id !== categoria.id)
                          : [...f.categories, categoria.id],
                      }))
                    }
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
                      marcada
                        ? 'border-accent-400 bg-accent-50 text-accent-800 dark:bg-accent-500/20 dark:text-accent-200'
                        : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                    )}
                  >
                    <ColorDot color={categoria.color} size={6} />
                    {categoria.name}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {Object.entries(DOCUMENT_STATUS).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Cor">
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color || 'none'}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color }))}
                  style={color ? { backgroundColor: color } : undefined}
                  aria-label={color || 'Sem cor'}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 text-[10px] text-ink-400 transition',
                    form.color === color
                      ? 'border-ink-900 dark:border-white'
                      : 'border-ink-200 dark:border-ink-700',
                  )}
                >
                  {!color && '×'}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      <DestinationModal
        open={picking}
        title="Mover item"
        confirmLabel="Escolher"
        currentFolderId={form.folder}
        onClose={() => setPicking(false)}
        onPick={(folderId) => {
          setForm((f) => ({ ...f, folder: folderId }))
          setPicking(false)
        }}
      />
    </>
  )
}
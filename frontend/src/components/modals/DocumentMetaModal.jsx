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
 * Propriedades de um item: onde mora, status e cor.
 *
 * Não há campo de categoria — ela vem da pasta. Mostrar a categoria como
 * algo editável aqui sugeriria que item e pasta poderiam discordar.
 */
export default function DocumentMetaModal({ open, onClose, document: doc, onSave, saving }) {
  const { categories } = useWorkspace()
  const [form, setForm] = useState({ folder: '', status: 'draft', color: '' })
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (!open || !doc) return
    setForm({
      folder: doc.folder ?? '',
      status: doc.status ?? 'draft',
      color: doc.color ?? '',
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
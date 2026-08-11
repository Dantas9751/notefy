import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder as FolderIcon, Search, FolderPlus } from 'lucide-react'
import { useWorkspace } from '@/context/WorkspaceContext'
import { Button, ColorDot, EmptyState, Modal } from '@/components/ui'
import FolderFormModal from '@/components/modals/FolderFormModal'
import { kindMeta } from '@/lib/documents'
import { cn } from '@/lib/utils'

/**
 * Escolha da pasta de destino.
 *
 * Aparece sempre que a ação não tem um destino óbvio. Como nada existe
 * fora de uma pasta, este diálogo é parte de criar e de mover — não um
 * ajuste posterior.
 */
export default function DestinationModal({
  open,
  kind,
  title = 'Escolher pasta',
  confirmLabel = 'Continuar',
  currentFolderId,
  onClose,
  onPick,
}) {
  const { categories, refresh } = useWorkspace()
  
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [showFolderModal, setShowFolderModal] = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(null)
      setQuery('')
      setShowFolderModal(false)
    }
  }, [open])

  /** Achata a árvore preservando o caminho legível de cada pasta. */
  const options = useMemo(() => {
    const out = []
    const walk = (nodes, trail, category) => {
      nodes.forEach((node) => {
        out.push({
          id: node.id,
          name: node.name,
          color: node.color,
          category,
          trail: [...trail, node.name],
          depth: trail.length,
        })
        if (node.children?.length) walk(node.children, [...trail, node.name], category)
      })
    }
    categories.forEach((category) => walk(category.folders ?? [], [], category))
    return out
  }, [categories])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return options
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(term) ||
        option.category.name.toLowerCase().includes(term),
    )
  }, [options, query])

  const meta = kind && kind !== 'file' ? kindMeta(kind) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        meta
          ? `Onde criar ${meta.label.toLowerCase()}?`
          : kind === 'file'
            ? 'Para qual pasta enviar os arquivos?'
            : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!selected} onClick={() => onPick(selected)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar pastas..."
            autoFocus
            className="input pl-9"
          />
        </div>
        <Button 
          variant="secondary" 
          onClick={() => setShowFolderModal(true)} 
          title="Nova pasta" 
          className="px-2"
        >
          <FolderPlus size={18} />
        </Button>
      </div>

      {options.length === 0 ? (
        <EmptyState
          icon={FolderIcon}
          title="Nenhuma pasta ainda"
          description="Crie uma categoria e uma pasta antes de adicionar conteúdo."
        />
      ) : (
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {filtered.map((option) => {
            const isCurrent = option.id === currentFolderId
            return (
              <li key={option.id}>
                <button
                  disabled={isCurrent}
                  onClick={() => setSelected(option.id)}
                  onDoubleClick={() => onPick(option.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    selected === option.id
                      ? 'bg-accent-50 text-accent-700 ring-1 ring-accent-400 dark:bg-accent-500/15 dark:text-accent-300'
                      : 'hover:bg-ink-50 dark:hover:bg-ink-800',
                  )}
                  style={{ paddingLeft: `${8 + option.depth * 14}px` }}
                >
                  <ColorDot color={option.category.color} size={7} />
                  <FolderIcon
                    size={14}
                    className="shrink-0 text-ink-400"
                    style={option.color ? { color: option.color } : undefined}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink-800 dark:text-ink-100">
                    {option.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-ink-400">
                    {option.category.name}
                    {option.trail.length > 1 && (
                      <>
                        <ChevronRight size={9} />
                        {option.trail.slice(0, -1).join(' / ')}
                      </>
                    )}
                  </span>
                  {isCurrent && (
                    <span className="shrink-0 text-[10px] text-ink-400">atual</span>
                  )}
                </button>
              </li>
            )
          })}

          {filtered.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-ink-400">
              Nenhuma pasta corresponde a “{query}”.
            </li>
          )}
        </ul>
      )}
      
      <FolderFormModal
        open={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        onSaved={async (newFolder) => {
          setShowFolderModal(false)
          
          await refresh() 
          
          if (newFolder && newFolder.id) {
            setSelected(newFolder.id)
            setQuery('') 
          }
        }}
      />
    </Modal>
  )
}
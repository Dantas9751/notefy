import { useCallback, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react'
import { ColorDot } from '@/components/ui'
import { canDrop, hasItemPayload, readDragPayload, setDragPayload } from '@/lib/dnd'
import { cn } from '@/lib/utils'

const EXPANDED_KEY = 'notefy.expanded'

/**
 * Estado de expansão persistido.
 */
function loadExpanded() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

export function useExpanded() {
  const [expanded, setExpanded] = useState(loadExpanded)

  const toggle = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const ensureOpen = useCallback((key) => {
    setExpanded((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev).add(key)
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  return { expanded, toggle, ensureOpen }
}

/** Linha da árvore que aceita soltar itens e pastas. */
function useDropTarget(target, onDrop, onHover) {
  const [over, setOver] = useState(false)

  const handlers = {
    onDragOver: (event) => {
      if (!hasItemPayload(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (!over) {
        setOver(true)
        onHover?.()
      }
    },
    onDragLeave: (event) => {
      if (event.currentTarget.contains(event.relatedTarget)) return
      setOver(false)
    },
    onDrop: (event) => {
      setOver(false)
      const payload = readDragPayload(event)
      if (!payload) return
      event.preventDefault()
      event.stopPropagation()
      if (canDrop(payload, target)) onDrop(payload, target)
    },
  }

  return { over, handlers }
}

function FolderRow({ node, depth, categoryId, state, actions, selectedIds, onSelectIds }) {
  const hasChildren = node.children?.length > 0
  const isOpen = state.expanded.has(`f:${node.id}`)
  const accent = node.color || node.category_detail?.color

  const target = { type: 'folder', id: node.id, path: node.path }
  const { over, handlers } = useDropTarget(target, actions.onDrop, () =>
    state.ensureOpen(`f:${node.id}`),
  )

  const selectionKey = `folder:${node.id}`
  const isSelected = selectedIds?.includes(selectionKey)

  // Só Ctrl/Cmd marca vários. O Shift saiu: na sidebar a lista é uma árvore
  // (pastas aninhadas, nós fechados no meio), então "tudo entre A e B" não
  // tem um significado que a pessoa consiga prever olhando a tela.
  const handleSelection = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      // `preventDefault` segura o foco no link, e o `:focus-visible` global
      // (index.css) desenha um anel com offset em volta da pasta — o realce
      // solto que não vem da seleção. Sem foco, sem anel.
      e.currentTarget.blur()
      if (isSelected) {
        onSelectIds(selectedIds.filter((id) => id !== selectionKey))
      } else {
        onSelectIds([...selectedIds, selectionKey])
      }
    } else {
      onSelectIds([selectionKey])
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    let currentSelected = selectedIds || []
    if (!currentSelected.includes(selectionKey)) {
      currentSelected = [selectionKey]
      onSelectIds([selectionKey])
    }
    actions.onContextMenu(e, { type: 'folder', node, categoryId, isMultiple: currentSelected.length > 1 })
  }

  return (
    <li className="select-none">
      <div
        {...handlers}
        draggable
        onDragStart={(event) =>
          setDragPayload(event, {
            type: 'folder',
            id: node.id,
            title: node.name,
            parentId: node.parent,
            categoryId,
            isRoot: !node.parent,
            path: node.path,
          })
        }
        onContextMenu={handleContextMenu}
        className={cn(
          'group flex items-center gap-0.5 rounded-md pr-1 transition outline-none',
          isSelected ? 'bg-accent-50 dark:bg-accent-500/15' : 'hover:bg-ink-100 dark:hover:bg-ink-800/70',
          over && 'ring-1 ring-inset ring-accent-400',
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            state.toggle(`f:${node.id}`)
          }}
          className={cn(
            'shrink-0 rounded p-1 text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200 outline-none',
            !hasChildren && 'invisible',
          )}
          aria-label={isOpen ? 'Recolher' : 'Expandir'}
          aria-expanded={hasChildren ? isOpen : undefined}
        >
          <ChevronRight
            size={13}
            className={cn('transition-transform duration-150', isOpen && 'rotate-90')}
          />
        </button>

        <NavLink
          to={`/folders/${node.id}`}
          onMouseDown={(e) => {
            // AQUI ESTÁ A MÁGICA: Impede o highlight azul ANTES dele nascer
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              e.preventDefault()
            }
          }}
          onClick={handleSelection}
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-1 text-sm transition outline-none focus:outline-none focus:ring-0',
              isActive || isSelected
                ? 'font-medium text-accent-700 dark:text-accent-300'
                : 'text-ink-600 dark:text-ink-300',
            )
          }
        >
          <FolderIcon
            size={14}
            className="shrink-0"
            style={accent ? { color: accent } : undefined}
          />
          <span className="truncate">{node.name}</span>
          {node.is_favorite && <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />}
          {node.document_count > 0 && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-400">
              {node.document_count}
            </span>
          )}
        </NavLink>

        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            actions.onCreateFolder({ parent: node, categoryId })
          }}
          title="Nova subpasta"
          aria-label={`Nova subpasta em ${node.name}`}
          className="shrink-0 rounded p-1 text-ink-400 opacity-0 transition hover:text-accent-600 focus-visible:opacity-100 group-hover:opacity-100 outline-none"
        >
          <Plus size={13} />
        </button>
      </div>

      {hasChildren && isOpen && (
        <ul>
          {node.children.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              categoryId={categoryId}
              state={state}
              actions={actions}
              selectedIds={selectedIds}
              onSelectIds={onSelectIds}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function CategoryRow({ category, state, actions, selectedIds, onSelectIds }) {
  const isOpen = state.expanded.has(`c:${category.id}`)
  const folders = category.folders ?? []

  const target = { type: 'category', id: category.id }
  const { over, handlers } = useDropTarget(target, actions.onDrop, () =>
    state.ensureOpen(`c:${category.id}`),
  )

  const handleContextMenu = (e) => {
    e.preventDefault()
    onSelectIds([]) 
    actions.onContextMenu(e, { type: 'category', category })
  }

  return (
    <li className="select-none">
      <div
        {...handlers}
        onContextMenu={handleContextMenu}
        className={cn(
          'group flex items-center gap-0.5 rounded-md pl-1 pr-1 transition outline-none',
          'hover:bg-ink-100 dark:hover:bg-ink-800/70',
          over && 'bg-accent-100 ring-1 ring-inset ring-accent-400 dark:bg-accent-500/20',
        )}
      >
        <button
          onClick={() => state.toggle(`c:${category.id}`)}
          className={cn(
            'shrink-0 rounded p-1 text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200 outline-none',
            !folders.length && 'invisible',
          )}
          aria-label={isOpen ? 'Recolher' : 'Expandir'}
          aria-expanded={folders.length ? isOpen : undefined}
        >
          <ChevronRight
            size={13}
            className={cn('transition-transform duration-150', isOpen && 'rotate-90')}
          />
        </button>

        <NavLink
          to={`/categories/${category.id}`}
          onMouseDown={(e) => {
            // AQUI TAMBÉM: Mata o highlight fantasma na Categoria
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              e.preventDefault()
            }
          }}
          onClick={(e) => {
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              e.preventDefault()
              return
            }
            onSelectIds([])
          }} 
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 text-sm transition outline-none focus:outline-none focus:ring-0',
              isActive
                ? 'font-medium text-accent-700 dark:text-accent-300'
                : 'text-ink-700 dark:text-ink-200',
            )
          }
        >
          <ColorDot color={category.color} size={9} />
          <span className="truncate font-medium">{category.name}</span>
          {category.document_count > 0 && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-400">
              {category.document_count}
            </span>
          )}
        </NavLink>

        <button
          onClick={(e) => {
            e.preventDefault()
            actions.onCreateFolder({ parent: null, categoryId: category.id })
          }}
          title="Nova pasta"
          aria-label={`Nova pasta em ${category.name}`}
          className="shrink-0 rounded p-1 text-ink-400 opacity-0 transition hover:text-accent-600 focus-visible:opacity-100 group-hover:opacity-100 outline-none"
        >
          <FolderPlus size={13} />
        </button>
      </div>

      {isOpen && folders.length > 0 && (
        <ul className="space-y-0.5">
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              node={folder}
              depth={1}
              categoryId={category.id}
              state={state}
              actions={actions}
              selectedIds={selectedIds}
              onSelectIds={onSelectIds}
            />
          ))}
        </ul>
      )}

      {folders.length === 0 && (
        <p className="py-1 pl-8 text-[11px] text-ink-400">Nenhuma pasta aqui.</p>
      )}
    </li>
  )
}

export default function CategoryTree({ categories, selectedIds = [], onSelectIds, actions }) {
  const state = useExpanded()

  if (!categories.length) {
    return (
      <p className="px-2 py-3 text-xs leading-relaxed text-ink-400">
        Crie uma categoria para começar. Tudo mora dentro de uma categoria.
      </p>
    )
  }

  return (
    <ul className="space-y-0.5">
      {categories.map((category) => (
        <CategoryRow 
          key={category.id} 
          category={category} 
          state={state} 
          actions={actions}
          selectedIds={selectedIds}
          onSelectIds={onSelectIds}
        />
      ))}
    </ul>
  )
}

export { FolderPlus, Pencil, Trash2 }
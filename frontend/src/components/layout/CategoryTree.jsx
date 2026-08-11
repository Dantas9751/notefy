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
 *
 * Guardado em localStorage para que a sidebar reabra exatamente como o
 * usuário deixou — reabrir tudo a cada F5 é fricção pura em hierarquias
 * profundas. Categorias e pastas dividem o mesmo conjunto, com prefixo.
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
      // O payload só é legível no drop; durante o hover confiamos no MIME
      // e deixamos a checagem fina para o momento de soltar.
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

function FolderRow({ node, depth, categoryId, state, actions }) {
  const hasChildren = node.children?.length > 0
  const isOpen = state.expanded.has(`f:${node.id}`)
  const accent = node.color || node.category_detail?.color

  const target = { type: 'folder', id: node.id, path: node.path }
  const { over, handlers } = useDropTarget(target, actions.onDrop, () =>
    state.ensureOpen(`f:${node.id}`),
  )

  return (
    <li>
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
        onContextMenu={(event) => actions.onContextMenu(event, { type: 'folder', node, categoryId })}
        className={cn(
          'group flex items-center gap-0.5 rounded-md pr-1 transition',
          'hover:bg-ink-100 dark:hover:bg-ink-800/70',
          over && 'bg-accent-100 ring-1 ring-accent-400 dark:bg-accent-500/20',
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          onClick={() => state.toggle(`f:${node.id}`)}
          className={cn(
            'shrink-0 rounded p-1 text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200',
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
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-1 text-sm transition',
              isActive
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
            actions.onCreateFolder({ parent: node, categoryId })
          }}
          title="Nova subpasta"
          aria-label={`Nova subpasta em ${node.name}`}
          className="shrink-0 rounded p-1 text-ink-400 opacity-0 transition hover:text-accent-600 focus-visible:opacity-100 group-hover:opacity-100"
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
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function CategoryRow({ category, state, actions }) {
  const isOpen = state.expanded.has(`c:${category.id}`)
  const folders = category.folders ?? []

  const target = { type: 'category', id: category.id }
  const { over, handlers } = useDropTarget(target, actions.onDrop, () =>
    state.ensureOpen(`c:${category.id}`),
  )

  return (
    <li>
      <div
        {...handlers}
        onContextMenu={(event) => actions.onContextMenu(event, { type: 'category', category })}
        className={cn(
          'group flex items-center gap-0.5 rounded-md pl-1 pr-1 transition',
          'hover:bg-ink-100 dark:hover:bg-ink-800/70',
          over && 'bg-accent-100 ring-1 ring-accent-400 dark:bg-accent-500/20',
        )}
      >
        <button
          onClick={() => state.toggle(`c:${category.id}`)}
          className={cn(
            'shrink-0 rounded p-1 text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200',
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
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 text-sm transition',
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
          className="shrink-0 rounded p-1 text-ink-400 opacity-0 transition hover:text-accent-600 focus-visible:opacity-100 group-hover:opacity-100"
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
            />
          ))}
        </ul>
      )}

      {isOpen && folders.length === 0 && (
        <p className="py-1 pl-8 text-[11px] text-ink-400">Nenhuma pasta aqui.</p>
      )}
    </li>
  )
}

export default function CategoryTree({ categories, actions }) {
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
        <CategoryRow key={category.id} category={category} state={state} actions={actions} />
      ))}
    </ul>
  )
}

export { FolderPlus, Pencil, Trash2 }

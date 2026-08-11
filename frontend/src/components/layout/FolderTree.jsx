import { useCallback, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronRight, Folder as FolderIcon, Plus, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

const EXPANDED_KEY = 'notefy.expandedFolders'

/**
 * Estado de expansão persistido.
 *
 * Guardado em localStorage para que a sidebar reabra exatamente como o
 * usuário deixou — reabrir a árvore inteira a cada F5 é fricção pura em
 * hierarquias profundas.
 */
function loadExpanded() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

export function useExpandedFolders() {
  const [expanded, setExpanded] = useState(loadExpanded)

  const toggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  return { expanded, toggle }
}

function FolderNode({ node, depth, expanded, onToggle, onCreateChild }) {
  const hasChildren = node.children?.length > 0
  const isOpen = expanded.has(node.id)
  const accent = node.color || node.category_detail?.color

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-0.5 rounded-md pr-1 transition',
          'hover:bg-ink-100 dark:hover:bg-ink-800/70',
        )}
        // Indentação por profundidade. Como o padding cresce e a linha tem
        // largura fixa, o texto trunca em vez de estourar a sidebar.
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <button
          onClick={() => onToggle(node.id)}
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
          {node.is_favorite && (
            <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
          )}
          {node.document_count > 0 && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-400">
              {node.document_count}
            </span>
          )}
        </NavLink>

        <button
          onClick={(e) => {
            e.preventDefault()
            onCreateChild?.(node)
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
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onCreateChild={onCreateChild}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function FolderTree({ nodes, onCreateChild }) {
  const { expanded, toggle } = useExpandedFolders()

  if (!nodes.length) {
    return (
      <p className="px-2 py-3 text-xs leading-relaxed text-ink-400">
        Nenhuma pasta ainda. Crie a primeira para organizar suas notas.
      </p>
    )
  }

  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <FolderNode
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          onCreateChild={onCreateChild}
        />
      ))}
    </ul>
  )
}

import { useNavigate } from 'react-router-dom'
import { Copy, ExternalLink, FolderInput, Paperclip, Pin, Star, Trash2 } from 'lucide-react'
import { Badge, ColorDot } from '@/components/ui'
import { DOCUMENT_STATUS, documentPath, kindMeta } from '@/lib/documents'
import { setDragPayload } from '@/lib/dnd'
import { cn, formatBytes, formatRelative } from '@/lib/utils'

/**
 * Card de um item — serve os cinco tipos.
 *
 * É arrastável: soltar numa pasta da sidebar move o item. O `kind` decide
 * ícone, cor de acento e destino do clique; o resto do layout é igual, que
 * é o que faz nota, planilha e PDF conviverem na mesma grade.
 */
export default function DocumentCard({ document: doc, onContextMenu, showFolder = false }) {
  const navigate = useNavigate()
  const meta = kindMeta(doc.kind)
  const Icon = meta.icon
  const status = DOCUMENT_STATUS[doc.status] ?? DOCUMENT_STATUS.draft
  const accent = doc.color || meta.accent
  const isFile = doc.kind === 'file'

  return (
    <article
      draggable
      onDragStart={(event) =>
        setDragPayload(event, {
          type: 'document',
          id: doc.id,
          title: doc.title,
          folderId: doc.folder,
        })
      }
      onClick={() => navigate(documentPath(doc))}
      onContextMenu={(event) => onContextMenu?.(event, { type: 'document', document: doc })}
      className="card group block cursor-pointer p-4 active:cursor-grabbing"
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="flex items-start gap-2">
        <Icon size={15} className="mt-0.5 shrink-0" style={{ color: accent }} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 group-hover:text-accent-700 dark:text-ink-100 dark:group-hover:text-accent-300">
          {doc.title}
        </h3>
        {doc.is_pinned && <Pin size={13} className="shrink-0 text-ink-400" />}
        {doc.is_favorite && <Star size={13} className="shrink-0 fill-amber-400 text-amber-400" />}
      </div>

      {doc.excerpt && !isFile && (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
          {doc.excerpt}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
          {meta.label}
        </Badge>

        {isFile ? (
          <span className="text-[11px] text-ink-400">{formatBytes(doc.size)}</span>
        ) : (
          <Badge className={status.className}>{status.label}</Badge>
        )}

        {/* Fora da pasta, mostrar onde o item mora é o que dá contexto —
            em Recentes ou na busca, o título sozinho não localiza nada. */}
        {showFolder && doc.category && (
          <span className="flex items-center gap-1 text-[11px] text-ink-400">
            <ColorDot color={doc.category.color} size={6} />
            {doc.category.name}
            {doc.folder_name && ` / ${doc.folder_name}`}
          </span>
        )}

        {doc.attachment_count > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] text-ink-400">
            <Paperclip size={10} />
            {doc.attachment_count}
          </span>
        )}

        <span className={cn('ml-auto text-[11px] text-ink-400')}>
          {formatRelative(doc.updated_at)}
        </span>
      </div>
    </article>
  )
}

/** Itens do menu de contexto de um documento. */
export function documentMenuItems(doc, { navigate, onMove, onDuplicate, onDelete }) {
  return [
    { label: 'Abrir', icon: ExternalLink, onClick: () => navigate(documentPath(doc)) },
    { label: 'Mover para...', icon: FolderInput, onClick: onMove },
    { label: 'Duplicar', icon: Copy, onClick: onDuplicate },
    { separator: true },
    { label: 'Excluir', icon: Trash2, danger: true, onClick: onDelete },
  ]
}

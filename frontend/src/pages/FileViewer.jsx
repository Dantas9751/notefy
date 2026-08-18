import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Download, Settings2, Star, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useTabState } from '@/context/TabsContext'
import { Badge, Button, ErrorState, Modal, Spinner } from '@/components/ui'
import DocumentMetaModal from '@/components/modals/DocumentMetaModal'
import TextFilePreview, { ehArquivoDeTexto } from '@/components/TextFilePreview'
import { cn, formatBytes, formatDate } from '@/lib/utils'

/**
 * Visualização de um arquivo.
 *
 * Imagem, PDF, áudio e vídeo abrem embutidos; o resto oferece download.
 * A barra de ações é a mesma do editor de documentos — pasta e favorito
 * funcionam igual, que é o ponto de arquivos serem documentos.
 */
export default function FileViewer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh: refreshTree } = useWorkspace()

  const { data: doc, loading, error, refetch, setData } = useFetch(`/documents/${id}/`, {
    deps: [id],
  })
  const [showMeta, setShowMeta] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  useTabState({ title: doc?.title })

  const patch = async (changes) => {
    setSaving(true)
    try {
      const { data } = await api.patch(`/documents/${id}/`, changes)
      setData(data)
      refreshTree()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={22} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message={error} onRetry={refetch} />
      </div>
    )
  }

  const preview = () => {
    switch (doc.file_kind) {
      case 'image':
        return (
          <img
            src={doc.file_url}
            alt={doc.title}
            className="mx-auto max-h-full max-w-full rounded-lg object-contain shadow-card"
          />
        )
      case 'pdf':
        return (
          <iframe
            src={doc.file_url}
            title={doc.title}
            className="h-full w-full rounded-lg border border-ink-200 dark:border-ink-800"
          />
        )
      case 'audio':
        return <audio controls src={doc.file_url} className="w-full max-w-xl" />
      case 'video':
        return <video controls src={doc.file_url} className="max-h-full max-w-full rounded-lg" />
      default:
        // `.txt`, `.md`, `.csv` e código caem aqui: o servidor classifica
        // o primeiro grupo como "documento" (junto com .docx, que não é
        // texto) e o resto como "outro". Quem sabe distinguir é o MIME.
        if (ehArquivoDeTexto(doc)) return <TextFilePreview doc={doc} />

        return (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-ink-500 dark:text-ink-400">
              Este formato não tem pré-visualização.
            </p>
            <a
              href={doc.file_url}
              download
              className="inline-flex items-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700"
            >
              <Download size={15} />
              Baixar {doc.original_name}
            </a>
          </div>
        )
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 px-4 py-2 dark:border-ink-800">
        <button
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
        >
          <ArrowLeft size={16} />
        </button>

        {doc.breadcrumb?.length > 0 && (
          <nav className="hidden min-w-0 items-center gap-1 text-xs text-ink-400 sm:flex">
            {doc.breadcrumb.map((crumb) => (
              <span key={crumb.id} className="flex shrink-0 items-center gap-1">
                <Link
                  to={
                    crumb.type === 'category'
                      ? `/categories/${crumb.id}`
                      : `/folders/${crumb.id}`
                  }
                  className="max-w-[110px] truncate hover:text-ink-700 dark:hover:text-ink-200"
                >
                  {crumb.name}
                </Link>
                <ChevronRight size={11} />
              </span>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
            {formatBytes(doc.size)}
          </Badge>
          <button
            onClick={() => patch({ is_favorite: !doc.is_favorite })}
            aria-label="Favoritar"
            className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <Star size={15} className={doc.is_favorite ? 'fill-amber-400 text-amber-400' : ''} />
          </button>
          <button
            onClick={() => setShowMeta(true)}
            aria-label="Propriedades"
            className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <Settings2 size={15} />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Excluir"
            className="rounded p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
          >
            <Trash2 size={15} />
          </button>
          <a
            href={doc.file_url}
            download
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-700"
          >
            <Download size={14} />
            Baixar
          </a>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-4">
        <h1 className="truncate text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          {doc.title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {doc.category && <Badge color={doc.category.color}>{doc.category.name}</Badge>}
          <span className="text-[11px] text-ink-400">
            {doc.mime_type} · enviado em {formatDate(doc.created_at)}
          </span>
        </div>
      </div>

      {/* Imagem e vídeo se centralizam no espaço; texto o preenche, senão
          o `h-full` do bloco não teria altura para esticar. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 p-4',
          ehArquivoDeTexto(doc) ? 'items-stretch' : 'items-center justify-center',
        )}
      >
        {preview()}
      </div>

      <DocumentMetaModal
        open={showMeta}
        document={doc}
        saving={saving}
        onClose={() => setShowMeta(false)}
        onSave={async (changes) => {
          setShowMeta(false)
          await patch(changes)
        }}
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir arquivo"
        description="Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await api.delete(`/documents/${id}/`)
                refreshTree()
                navigate('/files', { replace: true })
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          <strong>{doc.title}</strong> será removido permanentemente.
        </p>
      </Modal>
    </div>
  )
}

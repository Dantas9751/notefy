import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Download, Settings2, Star, Trash2 } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import useEmEstudo from '@/hooks/useEmEstudo'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useTabState } from '@/context/TabsContext'
import { Badge, Button, ErrorState, Modal, Spinner } from '@/components/ui'
import DocumentMetaModal from '@/components/modals/DocumentMetaModal'
import FilePreview, { baixarArquivoNoClique, ehArquivoDeOffice } from '@/components/FilePreview'
import { ehArquivoDeTexto } from '@/components/TextFilePreview'
import { cn, formatBytes, formatDate } from '@/lib/utils'

/**
 * Visualização de um arquivo.
 *
 * Imagem, PDF, áudio, vídeo, texto e Office (docx/xlsx/pptx) abrem
 * embutidos — todos pelo FilePreview, que busca o conteúdo pela sessão
 * do app; o resto oferece download. A barra de ações é a mesma do
 * editor de documentos — pasta e favorito funcionam igual, que é o
 * ponto de arquivos serem documentos.
 */

function PreviewDoArquivo({ doc }) {
  const temPreview =
    ['image', 'pdf', 'audio', 'video'].includes(doc.file_kind) ||
    ehArquivoDeTexto(doc) ||
    ehArquivoDeOffice(doc)

  if (!temPreview) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Este formato não tem pré-visualização.
        </p>
        <a
          href={doc.file_url}
          download
          onClick={(event) => {
            // O href direto aponta para a origem do servidor de mídia,
            // que a janela pode não alcançar — baixa pelo blob então.
            event.preventDefault()
            baixarArquivoNoClique(doc)
          }}
          className="inline-flex items-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700"
        >
          <Download size={15} />
          Baixar {doc.original_name}
        </a>
      </div>
    )
  }

  return <FilePreview doc={doc} />
}
export default function FileViewer({ id: idProp }) {
  const params = useParams()
  // Ver `DocumentEditor`: no painel da direita a rota aponta para o
  // documento da esquerda, então o id vem por prop.
  const id = idProp ?? params.id
  const emPainel = !!idProp

  const navigate = useNavigate()
  const { refresh: refreshTree } = useWorkspace()

  const { data: doc, loading, error, refetch, setData } = useFetch(`/documents/${id}/`, {
    deps: [id],
  })
  const [showMeta, setShowMeta] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  // Rascunho do nome enquanto se digita. O `doc` só é reescrito quando o
  // PATCH volta, senão cada tecla dispararia uma requisição.
  const [titulo, setTitulo] = useState('')
  const [erroNome, setErroNome] = useState(null)

  useTabState({ title: doc?.title, enabled: !emPainel })

  // Ler um PDF importado é estudar tanto quanto escrever uma nota.
  useEmEstudo(doc, !emPainel)

  // Documento novo (ou recarregado) reseta o rascunho. `doc.title` e não
  // `doc`: adotar a resposta de qualquer PATCH — favoritar, mover —
  // atropelaria o nome sendo digitado.
  useEffect(() => {
    if (doc?.title != null) setTitulo(doc.title)
  }, [doc?.title])

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

  /** Grava o nome ao sair do campo. Vazio volta ao anterior: um arquivo
      sem nome nenhum some das listas, e o servidor o chamaria de
      "Sem título". */
  const renomear = () => {
    const limpo = titulo.trim()
    setErroNome(null)
    if (!limpo) return setTitulo(doc.title)
    if (limpo === doc.title) return
    // O nome é único por pasta: repetir um que já existe volta 400. Sem
    // mostrar o motivo, o campo só piscava de volta ao nome antigo e
    // parecia que renomear não funciona.
    patch({ title: limpo }).catch((err) => {
      setErroNome(extractError(err))
      setTitulo(doc.title)
    })
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

  const preview = () => <PreviewDoArquivo doc={doc} />

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
            onClick={(event) => {
              event.preventDefault()
              baixarArquivoNoClique(doc)
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-700"
          >
            <Download size={14} />
            Baixar
          </a>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-4">
        {/* Renomear é digitar no título, como em toda nota e planilha.
            Um arquivo enviado é um documento como os outros; ser o único
            tipo com o nome preso ao que o disco trouxe obrigava a excluir
            e reenviar só para arrumar um "documento (1).pdf". O nome do
            arquivo em si (`original_name`) não muda — é ele que o botão
            Baixar usa, e mexer nele quebraria o download. */}
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={renomear}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            // Esc desiste: sem ele a única saída de um nome digitado por
            // engano é apagar tudo e lembrar o original.
            if (e.key === 'Escape') {
              setTitulo(doc.title)
              e.currentTarget.blur()
            }
          }}
          aria-label="Nome do arquivo"
          spellCheck={false}
          className="w-full truncate rounded-md bg-transparent text-xl font-semibold tracking-tight text-ink-900 outline-none transition hover:bg-ink-100/60 focus:bg-ink-100/60 dark:text-ink-50 dark:hover:bg-ink-800/60 dark:focus:bg-ink-800/60"
        />
        {erroNome && <p className="mt-0.5 text-[11px] text-red-500">{erroNome}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {doc.category && <Badge color={doc.category.color}>{doc.category.name}</Badge>}
          <span className="text-[11px] text-ink-400">
            {doc.mime_type} · enviado em {formatDate(doc.created_at)}
          </span>
        </div>
      </div>

      {/* Imagem e vídeo se centralizam no espaço; texto e Office o
          preenchem, senão o `h-full` do bloco não teria altura para
          esticar. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 p-4',
          ehArquivoDeTexto(doc) || ehArquivoDeOffice(doc)
            ? 'items-stretch'
            : 'items-center justify-center',
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

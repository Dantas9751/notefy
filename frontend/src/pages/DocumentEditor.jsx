import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Paperclip,
  Settings2,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import {
  Badge,
  Button,
  ErrorState,
  Modal,
  Spinner,
} from '@/components/ui'
import NoteEditor from '@/components/editors/NoteEditor'
import SpreadsheetEditor from '@/components/editors/SpreadsheetEditor'
import GraphEditor from '@/components/editors/GraphEditor'
import DocumentMetaModal from '@/components/modals/DocumentMetaModal'
import DestinationModal from '@/components/modals/DestinationModal'
import PdfMenu from '@/components/PdfMenu'
import { DOCUMENT_STATUS, kindMeta } from '@/lib/documents'
import { cn, formatBytes, formatRelative } from '@/lib/utils'

const AUTOSAVE_MS = 1500

/**
 * Editor único para todos os tipos de documento.
 *
 * A casca — título, breadcrumb, salvar, propriedades, anexos, excluir — é
 * a mesma para nota, planilha, diagrama e canvas; só o miolo troca. Foi
 * assim que "um lugar para cada" não virou quatro telas com mecânicas
 * diferentes: o usuário reaprende nada ao mudar de tipo.
 */
export default function DocumentEditor({ mode, kind: routeKind }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refresh: refreshTree } = useWorkspace()

  const isCreate = mode === 'create'
  const { data, loading, error, refetch, setData } = useFetch(`/documents/${id}/`, {
    enabled: !isCreate,
    deps: [id],
  })

  const [doc, setDoc] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [showMeta, setShowMeta] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pdfNotice, setPdfNotice] = useState(null)
  const fileInputRef = useRef(null)
  const autosaveRef = useRef(null)

  const kind = doc?.kind ?? routeKind ?? 'note'
  const meta = kindMeta(kind)

  useEffect(() => {
    if (data) {
      setDoc(data)
      setDirty(false)
    }
  }, [data])

  // Documento novo nasce em memória e só vai ao servidor no primeiro
  // salvamento — assim abrir um editor não polui a pasta com rascunhos
  // vazios que o usuário desistiu de escrever.
  useEffect(() => {
    if (!isCreate) return
    setDoc({
      kind: routeKind,
      title: '',
      content: '',
      content_format: 'html',
      data: null,
      status: 'draft',
      folder: searchParams.get('folder') || null,
      is_favorite: false,
      attachments: [],
    })
  }, [isCreate, routeKind, searchParams])

  // Sem pasta não há onde criar. Em vez de deixar salvar e receber um 400,
  // o seletor abre de saída e a escolha vira parte do fluxo de criação.
  const [pickingFolder, setPickingFolder] = useState(false)
  useEffect(() => {
    if (isCreate && !searchParams.get('folder')) setPickingFolder(true)
  }, [isCreate, searchParams])

  const persist = useCallback(
    async (payload) => {
      setSaving(true)
      setSaveError(null)
      try {
        const body = {
          kind: payload.kind,
          title: payload.title?.trim() || 'Sem título',
          status: payload.status,
          color: payload.color ?? '',
          folder: payload.folder,
          is_favorite: payload.is_favorite ?? false,
          // A nota também vive no `data` desde que virou seções; `content`
          // segue no payload apenas para não zerar o que notas antigas
          // ainda guardam ali.
          data: payload.data ?? {},
          ...(payload.kind === 'note'
            ? { content: payload.content ?? '', content_format: 'html' }
            : {}),
        }

        const response = isCreate
          ? await api.post('/documents/', body)
          : await api.patch(`/documents/${id}/`, body)

        setDirty(false)
        setSavedAt(new Date())
        refreshTree()

        if (isCreate) {
          navigate(`${meta.route}/${response.data.id}`, { replace: true })
        } else {
          setData(response.data)
        }
        return response.data
      } catch (err) {
        setSaveError(extractError(err))
        throw err
      } finally {
        setSaving(false)
      }
    },
    [id, isCreate, meta.route, navigate, refreshTree, setData],
  )

  /* Autosave nos editores visuais.
     Numa planilha ou canvas cada arraste gera uma mudança; exigir Ctrl+S a
     cada gesto seria hostil. Nota fica manual porque digitar dispara
     mudanças a cada tecla. */
  const scheduleAutosave = useCallback(
    (next) => {
      // Nota agora também salva sozinha: com blocos de código, o gesto de
      // digitar é o mesmo dos outros editores e exigir Ctrl+S a cada
      // bloco seria a única exceção da interface.
      if (isCreate) return
      // Só salva o que já veio do servidor: durante a troca de documento o
      // estado ainda aponta para o anterior, e gravar aqui sobrescreveria
      // o novo com o conteúdo do velho.
      if (next.id !== id) return
      clearTimeout(autosaveRef.current)
      autosaveRef.current = setTimeout(() => {
        persist(next).catch(() => {})
      }, AUTOSAVE_MS)
    },
    [isCreate, id, persist],
  )

  // Cancela ao TROCAR de documento, não só ao desmontar: ir de
  // /canvas/A para /canvas/B reaproveita este mesmo componente, e um
  // autosave pendente de A dispararia contra o id de B — gravando em B o
  // conteúdo de A, ou um payload ainda pela metade.
  useEffect(() => () => clearTimeout(autosaveRef.current), [id])

  const patch = (changes) => {
    setDoc((current) => {
      const next = { ...current, ...changes }
      setDirty(true)
      scheduleAutosave(next)
      return next
    })
  }

  const save = () => persist(doc).catch(() => {})

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty) save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const handleDelete = async () => {
    await api.delete(`/documents/${id}/`)
    refreshTree()
    navigate(meta.route, { replace: true })
  }

  const handleAttach = async (event) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return

    const body = new FormData()
    files.forEach((file) => body.append('files', file))
    body.append('attached_to', id)
    try {
      await api.post('/documents/upload/', body)
      refetch()
    } catch (err) {
      setSaveError(extractError(err))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading || !doc) {
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

  const status = DOCUMENT_STATUS[doc.status] ?? DOCUMENT_STATUS.draft
  const Icon = meta.icon

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra de ações */}
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 px-4 py-2 dark:border-ink-800">
        <button
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
        >
          <ArrowLeft size={16} />
        </button>

        <Icon size={15} className="shrink-0" style={{ color: doc.color || meta.accent }} />

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
          {saving && <Spinner size={13} />}
          {savedAt && !dirty && !saving && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check size={12} /> salvo
            </span>
          )}

          <Badge className={status.className}>{status.label}</Badge>

          {!isCreate && (
            <>
              <button
                onClick={() => patch({ is_favorite: !doc.is_favorite })}
                aria-label="Favoritar"
                className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <Star size={15} className={cn(doc.is_favorite && 'fill-amber-400 text-amber-400')} />
              </button>
              {kind === 'note' && (
                <PdfMenu
                  documentId={id}
                  disabled={dirty}
                  onSaved={() => {
                    refreshTree()
                    setPdfNotice('PDF salvo na mesma pasta desta nota.')
                    setTimeout(() => setPdfNotice(null), 4000)
                  }}
                  onError={setSaveError}
                />
              )}
              <input ref={fileInputRef} type="file" multiple onChange={handleAttach} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="Anexar arquivo"
                title="Anexar arquivo"
                className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <Upload size={15} />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                aria-label="Excluir"
                className="rounded p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}

          <button
            onClick={() => setShowMeta(true)}
            aria-label="Propriedades"
            title="Pasta, categorias e status"
            className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <Settings2 size={15} />
          </button>

          <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
            {isCreate ? 'Criar' : 'Salvar'}
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="px-4 pt-3">
          <ErrorState message={saveError} />
        </div>
      )}

      {pdfNotice && (
        <div className="px-4 pt-3">
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            {pdfNotice}
          </p>
        </div>
      )}

      {/* Título */}
      <div className="shrink-0 px-4 pt-4">
        <input
          value={doc.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={`${meta.label} sem título`}
          autoFocus={isCreate}
          className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-0 dark:text-ink-50 dark:placeholder:text-ink-700"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {doc.category && (
            <Badge color={doc.category.color}>{doc.category.name}</Badge>
          )}
          {!isCreate && (
            <span className="text-[11px] text-ink-400">
              editado {formatRelative(doc.updated_at)}
            </span>
          )}
        </div>
      </div>

      {/* Editor conforme o tipo */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col px-4 pb-4">
        {kind === 'note' && (
          <NoteEditor data={doc.data} onChange={(next) => patch({ data: next })} />
        )}

        {kind === 'spreadsheet' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-200 dark:border-ink-800">
            <SpreadsheetEditor data={doc.data} onChange={(next) => patch({ data: next })} />
          </div>
        )}

        {(kind === 'diagram' || kind === 'canvas') && (
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-ink-200 dark:border-ink-800">
            <GraphEditor kind={kind} data={doc.data} onChange={(next) => patch({ data: next })} />
          </div>
        )}

        {/* Anexos */}
        {doc.attachments?.length > 0 && (
          <div className="mt-5 shrink-0 border-t border-ink-100 pt-4 dark:border-ink-800">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
              <Paperclip size={12} />
              Anexos ({doc.attachments.length})
            </h3>
            <ul className="flex flex-wrap gap-2">
              {doc.attachments.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border border-ink-200 px-2.5 py-1.5 text-xs text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-900"
                  >
                    <Download size={12} />
                    <span className="max-w-[180px] truncate">{file.title}</span>
                    <span className="text-ink-400">{formatBytes(file.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <DocumentMetaModal
        open={showMeta}
        document={doc}
        saving={saving}
        onClose={() => setShowMeta(false)}
        onSave={async (changes) => {
          const next = { ...doc, ...changes }
          setDoc(next)
          setShowMeta(false)
          await persist(next).catch(() => {})
        }}
      />

      {/* Escolha da pasta na criação: sem destino, não há o que salvar. */}
      <DestinationModal
        open={pickingFolder}
        kind={kind}
        onClose={() => {
          setPickingFolder(false)
          if (!doc.folder) navigate(-1)
        }}
        onPick={(folderId) => {
          setPickingFolder(false)
          patch({ folder: folderId })
        }}
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Excluir ${meta.label.toLowerCase()}`}
        description="Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          <strong>{doc.title || 'Sem título'}</strong> será removido permanentemente
          {doc.attachments?.length > 0 && `, junto com ${doc.attachments.length} anexo(s)`}.
        </p>
      </Modal>
    </div>
  )
}

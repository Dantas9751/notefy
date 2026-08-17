import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, FolderPlus, Plus } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useWorkspace } from '@/context/WorkspaceContext'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { CREATABLE_KINDS, kindMeta } from '@/lib/documents'
import DestinationModal from '@/components/modals/DestinationModal'
import FolderFormModal from '@/components/modals/FolderFormModal'

/**
 * O único lugar de onde nasce conteúdo.
 *
 * Como tudo precisa morar numa pasta, escolher o destino é parte de criar
 * — não uma propriedade que se ajusta depois. Quando já existe um destino
 * evidente (a pasta aberta), ele vem preenchido; senão, o seletor abre.
 */
export default function CreateMenu({
  collapsed,
  defaultFolderId,
  defaultCategoryId,
  alignRight = false,
}) {
  const navigate = useNavigate()
  const { refresh } = useWorkspace()
  const fileInputRef = useRef(null)

  const [open, setOpen] = useState(false)
  const [destination, setDestination] = useState(null)
  const [folderModal, setFolderModal] = useState(null)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)

  const start = (kind) => {
    setOpen(false)

    if (defaultFolderId) {
      navigate(`${kindMeta(kind).route}/new?folder=${defaultFolderId}`)
      return
    }

    setDestination({ kind })
  }

  const startUpload = () => {
    setOpen(false)

    if (defaultFolderId) {
      fileInputRef.current?.click()
      return
    }

    setDestination({ kind: 'file' })
  }

  const uploadTo = async (folderId, files) => {
    setUploading(true)
    setError(null)

    try {
      const body = new FormData()

      files.forEach((file) => {
        body.append('files', file)
      })

      body.append('folder', folderId)

      await api.post('/documents/upload/', body)

      refresh()
      navigate(`/folders/${folderId}`)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setUploading(false)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <>
      {/* 
        w-fit + shrink-0 são importantes aqui.
        O CreateMenu passa a ter exatamente a largura do botão,
        em vez de tentar ocupar a largura disponível do pai.
      */}
      <div
        className={cn(
          'relative w-fit max-w-full shrink-0',
          alignRight && 'ml-auto'
        )}
      >
        <Button
          size="sm"
          icon={Plus}
          loading={uploading}
          className={cn(
            'max-w-full whitespace-nowrap',
            collapsed && 'px-0'
          )}
          onClick={() => setOpen((v) => !v)}
          title="Criar"
        >
          {!collapsed && 'Criar'}
        </Button>

        {open && (
          <>
            {/* Overlay para fechar o menu */}
            <div
              className="fixed inset-0 z-20"
              onClick={() => setOpen(false)}
              aria-hidden
            />

            {/* 
              O menu fica limitado à viewport.
              Quando alignRight=true, sua borda direita acompanha
              a borda direita do botão.
            */}
            <div
              className={cn(
                'absolute top-full z-30 mt-1 w-60 max-w-[calc(100vw-1rem)] rounded-md border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900',
                alignRight ? 'right-0' : 'left-0'
              )}
            >
              {CREATABLE_KINDS.map((kind) => {
                const meta = kindMeta(kind)
                const Icon = meta.icon

                return (
                  <button
                    key={kind}
                    onClick={() => start(kind)}
                    className="flex w-full min-w-0 items-start gap-2.5 rounded px-2 py-2 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800"
                  >
                    <Icon
                      size={15}
                      className="mt-0.5 shrink-0"
                      style={{ color: meta.accent }}
                    />

                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">
                        {meta.label}
                      </span>

                      <span className="block text-[11px] leading-snug text-ink-400">
                        {meta.description}
                      </span>
                    </span>
                  </button>
                )
              })}

              <div className="my-1 border-t border-ink-100 dark:border-ink-800" />

              <button
                onClick={startUpload}
                className="flex w-full min-w-0 items-start gap-2.5 rounded px-2 py-2 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800"
              >
                <FileUp
                  size={15}
                  className="mt-0.5 shrink-0 text-ink-400"
                />

                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">
                    Enviar arquivo
                  </span>

                  <span className="block text-[11px] leading-snug text-ink-400">
                    PDF, imagem, áudio e outros.
                  </span>
                </span>
              </button>

              <div className="my-1 border-t border-ink-100 dark:border-ink-800" />

              <button
                onClick={() => {
                  setOpen(false)
                  setFolderModal({
                    categoryId: defaultCategoryId ?? null,
                  })
                }}
                className="flex w-full min-w-0 items-start gap-2.5 rounded px-2 py-2 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800"
              >
                <FolderPlus
                  size={15}
                  className="mt-0.5 shrink-0 text-ink-400"
                />

                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">
                    Pasta
                  </span>

                  <span className="block text-[11px] leading-snug text-ink-400">
                    Dentro de uma categoria ou de outra pasta.
                  </span>
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])

          if (files.length && defaultFolderId) {
            uploadTo(defaultFolderId, files)
          }
        }}
      />

      {error && (
        <p className="mt-1.5 rounded bg-red-50 px-2 py-1 text-[11px] text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <DestinationModal
        open={!!destination}
        kind={destination?.kind}
        onClose={() => setDestination(null)}
        onPick={(folderId) => {
          setDestination(null)

          if (destination.kind === 'file') {
            const input = document.createElement('input')

            input.type = 'file'
            input.multiple = true

            input.onchange = () => {
              uploadTo(folderId, Array.from(input.files ?? []))
            }

            input.click()
          } else {
            navigate(
              `${kindMeta(destination.kind).route}/new?folder=${folderId}`
            )
          }
        }}
      />

      <FolderFormModal
        open={!!folderModal}
        categoryId={folderModal?.categoryId}
        onClose={() => setFolderModal(null)}
        onSaved={(folder) => {
          setFolderModal(null)
          refresh()

          if (folder?.id) {
            navigate(`/folders/${folder.id}`)
          }
        }}
      />
    </>
  )
}

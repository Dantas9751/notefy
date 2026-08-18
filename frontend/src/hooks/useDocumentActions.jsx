import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useWorkspace } from '@/context/WorkspaceContext'
import { documentMenuItems } from '@/components/DocumentCard'
import DestinationModal from '@/components/modals/DestinationModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'

/**
 * Ações de item (mover, duplicar, excluir) com os diálogos que elas pedem.
 *
 * Concentradas aqui porque aparecem em quatro telas — pasta, categoria,
 * recentes e busca — e cada uma reimplementá-las significaria quatro
 * comportamentos que divergem com o tempo.
 */
export function useDocumentActions({ onChanged } = {}) {
  const navigate = useNavigate()
  const { refresh } = useWorkspace()

  const [moving, setMoving] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const done = useCallback(() => {
    refresh()
    onChanged?.()
    // Mover, duplicar e excluir mudam o que TODAS as listagens mostram, não
    // só a que abriu o menu. Sem este aviso, mover um item numa pasta
    // deixava ele visível em Recentes e na busca até recarregar a página.
    window.dispatchEvent(new Event('notefy:moved'))
  }, [refresh, onChanged])

  /**
   * Liga/desliga a estrela. Mesmo PATCH e mesmo evento que o
   * `<FavoriteButton />` usa, para as duas portas nunca divergirem.
   */
  const toggleFavorite = useCallback(
    async (doc) => {
      const endpoint = `/documents/${doc.id}/`
      const novo = !doc.is_favorite
      await api.patch(endpoint, { is_favorite: novo })
      window.dispatchEvent(
        new CustomEvent('notefy:favorites-changed', {
          detail: { endpoint, is_favorite: novo },
        }),
      )
      done()
      return novo
    },
    [done],
  )

  const buildMenu = useCallback(
    (doc) =>
      documentMenuItems(doc, {
        navigate,
        onMove: () => setMoving(doc),
        onDuplicate: async () => {
          await api.post(`/documents/${doc.id}/duplicate/`)
          done()
        },
        onDelete: () => setDeleting(doc),
      }),
    [navigate, done],
  )

  const dialogs = (
    <>
      <DestinationModal
        open={!!moving}
        title="Mover item"
        confirmLabel="Mover"
        currentFolderId={moving?.folder}
        onClose={() => setMoving(null)}
        onPick={async (folderId) => {
          const doc = moving
          setMoving(null)
          await api.post(`/documents/${doc.id}/move/`, { folder: folderId })
          done()
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir item"
        message={
          <>
            <strong>{deleting?.title}</strong> será removido permanentemente
            {deleting?.attachment_count > 0 &&
              `, junto com ${deleting.attachment_count} anexo(s)`}
            .
          </>
        }
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api.delete(`/documents/${deleting.id}/`)
          done()
        }}
      />
    </>
  )

  return { buildMenu, dialogs, toggleFavorite }
}

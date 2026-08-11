import { useState } from 'react'
import { extractError } from '@/lib/api'
import { Button, ErrorState, Modal } from '@/components/ui'

/**
 * Confirmação de ação destrutiva.
 *
 * O erro fica DENTRO do diálogo: excluir uma pasta com conteúdo é
 * recusado pela API, e mostrar o motivo aqui evita que o usuário feche a
 * janela sem entender por que nada aconteceu.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Excluir',
  onClose,
  onConfirm,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleConfirm = async () => {
    setLoading(true)
    setError(null)
    try {
      await onConfirm?.()
      onClose()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={loading} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && <ErrorState message={error} />}
      <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{message}</p>
    </Modal>
  )
}

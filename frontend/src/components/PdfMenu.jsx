import { useState } from 'react'
import { Download, FileDown, FolderInput } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Exportar a nota em PDF.
 *
 * Duas saídas para o mesmo PDF: baixar para o computador, ou guardar como
 * arquivo dentro do Notefy — nesse caso ele vira um item comum, na mesma
 * pasta da nota, com categoria e busca como qualquer outro.
 */
export default function PdfMenu({ documentId, disabled, onSaved, onError }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)

  const download = async () => {
    setOpen(false)
    setBusy('download')
    try {
      // `blob` porque a resposta é binária; sem isso o axios entregaria
      // o PDF como string e o arquivo sairia corrompido.
      const response = await api.get(`/documents/${documentId}/pdf/`, {
        responseType: 'blob',
      })
      const disposition = response.headers['content-disposition'] ?? ''
      const match = /filename="?([^"]+)"?/.exec(disposition)

      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = match?.[1] ?? 'nota.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      onError?.(extractError(err))
    } finally {
      setBusy(null)
    }
  }

  const saveHere = async () => {
    setOpen(false)
    setBusy('save')
    try {
      await api.post(`/documents/${documentId}/pdf/`)
      onSaved?.()
    } catch (err) {
      onError?.(extractError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!busy}
        title={disabled ? 'Salve a nota antes de exportar' : 'Exportar em PDF'}
        aria-label="Exportar em PDF"
        className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
      >
        {busy ? <Spinner size={15} /> : <FileDown size={15} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-md border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900">
            {disabled && (
              <p className="px-2 py-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                Há alterações não salvas — o PDF sairá com a última versão
                gravada.
              </p>
            )}

            <button
              onClick={download}
              className={cn(
                'flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition',
                'hover:bg-ink-50 dark:hover:bg-ink-800',
              )}
            >
              <Download size={15} className="mt-0.5 shrink-0 text-ink-400" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">
                  Baixar PDF
                </span>
                <span className="block text-[11px] leading-snug text-ink-400">
                  Salva no seu computador.
                </span>
              </span>
            </button>

            <button
              onClick={saveHere}
              className="flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800"
            >
              <FolderInput size={15} className="mt-0.5 shrink-0 text-ink-400" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">
                  Salvar aqui no Notefy
                </span>
                <span className="block text-[11px] leading-snug text-ink-400">
                  Vira um arquivo na mesma pasta da nota.
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

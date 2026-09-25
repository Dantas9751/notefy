import { useEffect } from 'react'
import { marcarDocumentoAberto } from '@/lib/estudo'

/**
 * Declara qual documento está aberto, para o cronômetro de estudo saber
 * a quem creditar os segundos.
 *
 * Duas telas abrem documento (`DocumentEditor` e `FileViewer`), e as
 * duas precisam do mesmo par registrar/limpar — inclusive o limpar, que
 * é o que impede o último documento fechado continuar acumulando tempo
 * enquanto a pessoa navega pelo Kanban.
 *
 * `ativo` existe pelo painel lateral: no split há dois documentos na
 * tela ao mesmo tempo, e creditar um segundo a cada um faria a soma do
 * dia render o dobro das horas vividas. O da esquerda é o dono.
 */
export default function useEmEstudo(documento, ativo = true) {
  const id = ativo ? documento?.id : null
  const titulo = documento?.title
  const kind = documento?.kind

  useEffect(() => {
    if (!id) return undefined
    marcarDocumentoAberto({ id, title: titulo, kind })
    return () => marcarDocumentoAberto(null)
  }, [id, titulo, kind])
}

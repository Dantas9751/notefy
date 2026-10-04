import { Link, useNavigate } from 'react-router-dom'
import { FileText, Paperclip } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { ListSkeleton } from '@/components/ui'
import Bloco, { Abas } from './Bloco'
import { urlDeMedia } from '@/lib/fileMedia'
import { cn, formatBytes, formatRelative } from '@/lib/utils'
import { t } from '@/lib/i18n'

const ABAS = [
  { id: 'imagens', get nome() { return t('Imagens') } },
  { id: 'documentos', get nome() { return t('Documentos') } },
  { id: 'todos', get nome() { return t('Todos') } },
]

/**
 * Arquivos recentes — o "capturado recentemente" do Evernote: as fotos e
 * os PDFs que entraram por último, sem precisar lembrar em que pasta.
 */
export default function BlocoArquivos({ className, aba, onTrocarAba }) {
  const navigate = useNavigate()
  const arquivos = useFetch('/documents/', { params: { kind: 'file', ordering: '-created_at', page_size: 24 } })
  const todos = arquivos.data?.results ?? []
  const imagem = (a) => a.file_kind === 'image'
  const lista = (aba === 'imagens' ? todos.filter(imagem) : aba === 'documentos' ? todos.filter((a) => !imagem(a)) : todos).slice(0, aba === 'imagens' ? 9 : 6)

  return (
    <Bloco
      titulo={t('Arquivos recentes')}
      icon={Paperclip}
      className={className}
      acoes={<Abas valor={aba} opcoes={ABAS} onTrocar={onTrocarAba} rotulo={t('Tipo de arquivo')} />}
    >
      {arquivos.loading && !arquivos.data ? (
        <ListSkeleton rows={2} />
      ) : lista.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-400">
          {aba === 'imagens' ? t('Nenhuma imagem enviada ainda.') : t('Nenhum arquivo enviado ainda.')}{' '}
          <Link to="/files" className="underline underline-offset-2">{t('Ir para Arquivos')}</Link>
        </p>
      ) : aba === 'imagens' ? (
        <div className="grid grid-cols-3 gap-2">
          {lista.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate(`/files/${a.id}`)}
              title={a.title}
              className="group relative aspect-square overflow-hidden rounded-md border border-ink-150 bg-ink-50 dark:border-ink-800 dark:bg-ink-800"
            >
              <img
                src={urlDeMedia(a.file_url)}
                alt={a.title}
                loading="lazy"
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      ) : (
        <ul className="-mx-2">
          {lista.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => navigate(`/files/${a.id}`)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800/50 [@media(pointer:coarse)]:py-2.5"
              >
                {imagem(a) ? (
                  <img src={urlDeMedia(a.file_url)} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded object-cover" />
                ) : (
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded bg-ink-100 text-ink-500 dark:bg-ink-800')}>
                    <FileText size={14} />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-700 dark:text-ink-200">{a.title}</span>
                <span className="shrink-0 text-[11px] text-ink-400">{formatBytes(a.size)}</span>
                <span className="hidden shrink-0 text-[11px] text-ink-400 sm:inline">{formatRelative(a.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  )
}

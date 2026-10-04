import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckSquare, Plus } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { ListSkeleton } from '@/components/ui'
import Bloco from './Bloco'
import { TASK_PRIORITY, cn, formatRelative } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Minhas tarefas: as abertas, para marcar como feita ali mesmo, e um campo
 * no pé para criar a próxima com Enter — sem abrir o Quadro nem formulário.
 */
export default function BlocoTarefas({ className }) {
  const tarefas = useFetch('/tasks/', { params: { open: true, ordering: 'starts_at', page_size: 8 } })
  const [nova, setNova] = useState('')
  const [criando, setCriando] = useState(false)
  const [concluindo, setConcluindo] = useState(null)
  const [erro, setErro] = useState(null)

  const avisar = () => {
    tarefas.refetch()
    // O Quadro, o calendário e o resumo do Início mostram as mesmas tarefas.
    window.dispatchEvent(new CustomEvent('notefy:task-changed'))
  }

  const concluir = async (tarefa) => {
    setConcluindo(tarefa.id)
    setErro(null)
    try {
      await api.post(`/tasks/${tarefa.id}/toggle/`)
      avisar()
    } catch (err) {
      setErro(extractError(err))
    } finally {
      setConcluindo(null)
    }
  }

  const criar = async (e) => {
    e.preventDefault()
    const titulo = nova.trim()
    if (!titulo || criando) return
    setCriando(true)
    setErro(null)
    try {
      await api.post('/tasks/', { title: titulo })
      setNova('')
      avisar()
    } catch (err) {
      setErro(extractError(err))
    } finally {
      setCriando(false)
    }
  }

  const lista = tarefas.data?.results ?? []

  return (
    <Bloco
      titulo={t('Minhas tarefas')}
      icon={CheckSquare}
      className={className}
      corpoClassName="flex flex-col p-0"
      acoes={
        <Link to="/board" className="text-[11px] text-ink-500 underline-offset-2 hover:underline dark:text-ink-400">
          {t('Ver quadro')}
        </Link>
      }
    >
      {tarefas.loading && !tarefas.data ? (
        <div className="p-4"><ListSkeleton rows={3} /></div>
      ) : (
        <ul className="flex-1 divide-y divide-ink-100 dark:divide-ink-800">
          {lista.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-ink-400">{t('Nenhuma tarefa aberta. Escreva uma aqui embaixo.')}</li>
          )}
          {lista.map((tarefa) => (
            <li key={tarefa.id} className="flex items-center gap-2.5 px-4 py-2 [@media(pointer:coarse)]:py-3">
              <input
                type="checkbox"
                checked={false}
                disabled={concluindo === tarefa.id}
                onChange={() => concluir(tarefa)}
                aria-label={t('Concluir "{titulo}"', { titulo: tarefa.title })}
                className="h-4 w-4 shrink-0 cursor-pointer rounded-full border-ink-300 text-accent-600 focus:ring-accent-500 dark:border-ink-600 dark:bg-ink-800 [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5"
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-700 dark:text-ink-200">{tarefa.title}</span>
              {tarefa.priority >= 3 && (
                <span className={cn('shrink-0 text-[10px] font-medium', TASK_PRIORITY[tarefa.priority]?.className)}>
                  {TASK_PRIORITY[tarefa.priority]?.label}
                </span>
              )}
              <span className={cn('shrink-0 text-[11px]', tarefa.is_overdue ? 'text-red-500' : 'text-ink-400')}>
                {tarefa.starts_at ? formatRelative(tarefa.starts_at) : t('sem data')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={criar} className="flex items-center gap-2 border-t border-ink-100 px-4 py-2 dark:border-ink-800">
        <Plus size={14} className="shrink-0 text-ink-400" />
        <input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          maxLength={250}
          placeholder={t('Nova tarefa (Enter cria)')}
          aria-label={t('Nova tarefa')}
          disabled={criando}
          className="min-w-0 flex-1 bg-transparent py-1 text-[13.5px] outline-none placeholder:text-ink-400 [@media(pointer:coarse)]:py-2"
        />
      </form>
      {erro && <p className="px-4 pb-2 text-xs text-red-500">{erro}</p>}
    </Bloco>
  )
}

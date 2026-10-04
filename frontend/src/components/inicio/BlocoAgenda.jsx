import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { ListSkeleton } from '@/components/ui'
import Bloco from './Bloco'
import { cn } from '@/lib/utils'
import { idioma, t } from '@/lib/i18n'

const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/**
 * Agenda do dia, como o calendário do Evernote: a data no topo, setas para
 * andar um dia, e o que está marcado nele em ordem de hora.
 */
export default function BlocoAgenda({ className }) {
  const [dia, setDia] = useState(() => inicioDoDia(new Date()))
  const fim = useMemo(() => new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 23, 59, 59), [dia])
  const ehHoje = dia.getTime() === inicioDoDia(new Date()).getTime()

  const tarefas = useFetch('/tasks/', {
    params: { starts_after: dia.toISOString(), starts_before: fim.toISOString(), ordering: 'starts_at', page_size: 50 },
    deps: [dia.getTime()],
  })
  const lista = tarefas.data?.results ?? []

  const andar = (passo) => setDia((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + passo))

  return (
    <Bloco
      titulo={t('Agenda')}
      icon={CalendarDays}
      className={className}
      acoes={
        <Link to="/calendar" className="text-[11px] text-ink-500 underline-offset-2 hover:underline dark:text-ink-400">
          {t('Abrir calendário')}
        </Link>
      }
    >
      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => andar(-1)}
          aria-label={t('Dia anterior')}
          className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 [@media(pointer:coarse)]:p-2"
        >
          <ChevronLeft size={15} />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-ink-800 first-letter:uppercase dark:text-ink-100">
          {dia.toLocaleDateString(idioma, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <button
          type="button"
          onClick={() => andar(1)}
          aria-label={t('Próximo dia')}
          className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 [@media(pointer:coarse)]:p-2"
        >
          <ChevronRight size={15} />
        </button>
        {!ehHoje && (
          <button
            type="button"
            onClick={() => setDia(inicioDoDia(new Date()))}
            className="ml-1 rounded-md border border-ink-200 px-2 py-0.5 text-[11px] text-ink-600 transition hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            {t('Hoje')}
          </button>
        )}
      </div>

      {tarefas.loading && !tarefas.data ? (
        <ListSkeleton rows={2} />
      ) : lista.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-400">{t('Nada marcado neste dia.')}</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((tarefa) => (
            <li key={tarefa.id} className="flex items-start gap-3">
              <span className="w-12 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-ink-400">
                {tarefa.all_day
                  ? t('dia todo')
                  : new Date(tarefa.starts_at).toLocaleTimeString(idioma, { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate border-l-2 pl-2 text-[13.5px]',
                  tarefa.status === 'done'
                    ? 'border-ink-200 text-ink-400 line-through dark:border-ink-700'
                    : 'border-accent-500 text-ink-700 dark:text-ink-200',
                )}
              >
                {tarefa.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  )
}

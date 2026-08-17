import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Check } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { useTaskActions } from '@/hooks/useTaskActions'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, EmptyState, ErrorState, ListSkeleton, Select } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import TaskFormModal from '@/components/modals/TaskFormModal'
import TaskScheduler from '@/components/TaskScheduler'
import { TASK_STATUS, cn } from '@/lib/utils'

const DIA = 24 * 60 * 60 * 1000

/** Quantos dias a timeline mostra de uma vez. */
const JANELAS = [
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
]

const meiaNoite = (d) => {
  const data = new Date(d)
  data.setHours(0, 0, 0, 0)
  return data
}

/**
 * Roadmap — as tarefas agendadas numa linha do tempo.
 *
 * O calendário responde "o que acontece neste dia"; o roadmap responde "o
 * que atravessa as próximas semanas". São perguntas diferentes: uma tarefa
 * de 12 dias é uma barra aqui e doze quadradinhos lá.
 *
 * Só entram tarefas COM data. Sem data não há onde desenhar — e é o quadro
 * que cuida delas.
 */
export default function Roadmap() {
  const [dias, setDias] = useState(60)
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)
  const [modal, setModal] = useState(null)
  const [scheduling, setScheduling] = useState(null)
  const { menu, openMenu, closeMenu } = useContextMenu()

  // A janela começa sempre hoje. Navegar para trás não fazia sentido aqui:
  // o roadmap é o que vem pela frente, e o passado já está no histórico das
  // concluídas — que tem o próprio botão.
  const inicio = useMemo(() => meiaNoite(new Date()), [])

  const fim = useMemo(() => new Date(inicio.getTime() + dias * DIA), [inicio, dias])

  const { data, loading, error, refetch } = useFetch('/tasks/calendar/', {
    params: {
      start: inicio.toISOString(),
      end: fim.toISOString(),
      // `open=true` faz o servidor já não mandar as concluídas. Filtrar no
      // servidor e não na tela mantém o roadmap leve quando o histórico
      // de concluídas cresce.
      open: mostrarConcluidas ? undefined : true,
    },
    deps: [inicio.getTime(), fim.getTime(), mostrarConcluidas],
  })

  // Mudar o status no quadro muda o que o roadmap deve mostrar. Sem isto,
  // voltar para cá exibiria a tarefa concluída até um recarregamento.
  useEffect(() => {
    const aoMudar = () => refetch()
    window.addEventListener('notefy:task-changed', aoMudar)
    window.addEventListener('notefy:moved', aoMudar)
    return () => {
      window.removeEventListener('notefy:task-changed', aoMudar)
      window.removeEventListener('notefy:moved', aoMudar)
    }
  }, [refetch])

  const { buildMenu, dialogs } = useTaskActions({
    onChanged: refetch,
    onEdit: (task) => setModal({ task }),
    onSchedule: (task) => setScheduling(task),
  })

  const eventos = data ?? []

  /** Converte cada tarefa em posição/largura percentual dentro da janela. */
  const barras = useMemo(() => {
    const total = fim.getTime() - inicio.getTime()
    return eventos
      .map((evento) => {
        const comeco = new Date(evento.start)
        // Sem fim, a tarefa é pontual: um dia de barra, para continuar
        // clicável em vez de virar uma linha de largura zero.
        const pontual = !evento.end
        const termino = pontual ? new Date(comeco.getTime() + DIA) : new Date(evento.end)

        const de = Math.max(comeco.getTime(), inicio.getTime())
        const ate = Math.min(termino.getTime(), fim.getTime())
        if (ate <= de) return null

        // Duração em DIAS DE CALENDÁRIO abrangidos, não em tempo
        // decorrido. De 12/08 09:00 a 15/08 18:00 são 3,4 dias corridos,
        // mas o usuário marcou quatro dias no calendário e é "4 dias" que
        // ele espera ler. Zerar a hora antes de subtrair é o que faz a
        // conta bater com a seleção.
        // Também é a duração real, não a do pedaço visível: uma tarefa de
        // 20 dias continua dizendo 20 mesmo com a janela mostrando 5.
        // Tarefa sem fim é de um dia, ponto. O `termino` acima é só o que
        // dá largura clicável à barra — deixá-lo entrar nesta conta fazia
        // um compromisso pontual ser anunciado como "2 dias".
        const duracaoDias = pontual
          ? 1
          : Math.round((meiaNoite(termino) - meiaNoite(comeco)) / DIA) + 1
        const formato = { day: '2-digit', month: '2-digit' }

        return {
          ...evento,
          left: ((de - inicio.getTime()) / total) * 100,
          width: Math.max(((ate - de) / total) * 100, 1.2),
          // Marca quem foi cortado pela borda da janela, para a barra
          // poder dizer que continua fora da vista.
          cortadoInicio: comeco.getTime() < inicio.getTime(),
          cortadoFim: termino.getTime() > fim.getTime(),
          concluida: evento.status === 'done',
          duracaoDias,
          rotuloPeriodo:
            duracaoDias > 1
              ? `${comeco.toLocaleDateString(undefined, formato)} a ${termino.toLocaleDateString(undefined, formato)} (${duracaoDias} dias)`
              : comeco.toLocaleDateString(undefined, formato),
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.left - b.left)
  }, [eventos, inicio, fim])

  /** Marcadores de mês no cabeçalho da régua. */
  const marcos = useMemo(() => {
    const total = fim.getTime() - inicio.getTime()
    const saida = []
    const cursor = new Date(inicio)
    cursor.setDate(1)
    while (cursor < fim) {
      if (cursor >= inicio) {
        saida.push({
          chave: `${cursor.getFullYear()}-${cursor.getMonth()}`,
          left: ((cursor.getTime() - inicio.getTime()) / total) * 100,
          label: cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        })
      }
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return saida
  }, [inicio, fim])

  const hojeLeft = useMemo(() => {
    const agora = Date.now()
    if (agora < inicio.getTime() || agora > fim.getTime()) return null
    return ((agora - inicio.getTime()) / (fim.getTime() - inicio.getTime())) * 100
  }, [inicio, fim])

  /**
   * Linhas verticais a cada semana.
   *
   * Sem nenhuma referência entre o começo e o fim, as barras flutuam e o
   * olho não consegue comparar duas delas — era a "bagunça de barras
   * soltas". Uma grade semanal dá a régua contra a qual medir.
   */
  const linhasSemana = useMemo(() => {
    const total = fim.getTime() - inicio.getTime()
    const saida = []
    const cursor = new Date(inicio)
    // Começa na próxima segunda-feira.
    cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7))
    while (cursor < fim) {
      saida.push(((cursor.getTime() - inicio.getTime()) / total) * 100)
      cursor.setDate(cursor.getDate() + 7)
    }
    return saida
  }, [inicio, fim])

  return (
    <>
      <PageHeader
        title="Roadmap"
        subtitle="As tarefas agendadas ao longo do tempo."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={Check}
              onClick={() => setMostrarConcluidas((v) => !v)}
              title="Mostrar ou esconder as tarefas já concluídas"
              className={cn(mostrarConcluidas && 'ring-1 ring-accent-400')}
            >
              {mostrarConcluidas ? 'Ocultar concluídas' : 'Mostrar concluídas'}
            </Button>
            <div className="w-28">
              <Select
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                className="h-9 py-0 text-sm"
                aria-label="Tamanho da janela"
              >
                {JANELAS.map((j) => (
                  <option key={j.value} value={j.value}>
                    {j.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        }
      />

      <PageBody>
        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : barras.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="Nada agendado neste período"
            description="Tarefas com data aparecem aqui como barras. Agende uma pelo quadro ou pelo calendário."
          />
        ) : (
          // Layout de Gantt: uma coluna fixa com os nomes e, ao lado, a
          // faixa de tempo. Sem a coluna de nomes o usuário precisa passar
          // o mouse em cada barra para saber o que é — era metade da
          // confusão.
          <div className="overflow-hidden rounded-lg border border-ink-200 dark:border-ink-800">
            <div className="flex">
              <div className="w-44 shrink-0 border-r border-ink-200 dark:border-ink-800">
                <div className="h-8 border-b border-ink-200 bg-ink-50/60 px-3 text-[10px] font-semibold uppercase leading-8 tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                  Tarefa
                </div>
                {barras.map((barra) => (
                  <div
                    key={barra.id}
                    className="flex h-10 items-center gap-1.5 border-b border-ink-100 px-3 last:border-0 dark:border-ink-800"
                  >
                    {barra.concluida && (
                      <Check size={11} className="shrink-0 text-emerald-500" />
                    )}
                    <span
                      title={barra.title}
                      className={cn(
                        'truncate text-xs',
                        barra.concluida
                          ? 'text-ink-400 line-through'
                          : 'text-ink-700 dark:text-ink-200',
                      )}
                    >
                      {barra.title}
                    </span>
                  </div>
                ))}
              </div>

              <div className="min-w-0 flex-1">
                {/* Régua */}
                <div className="relative h-8 border-b border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/40">
                  {/* Cada marco era um `absolute` sem largura: o rótulo
                      crescia livre, encavalava no marco seguinte e o último
                      vazava para fora da régua. Com largura até o próximo
                      marco, `overflow-hidden` e `whitespace-nowrap`, cada
                      etiqueta ocupa só a própria faixa e some quando não
                      cabe, em vez de se sobrepor. */}
                  {marcos.map((m, i) => (
                    <span
                      key={m.chave}
                      style={{
                        left: `${m.left}%`,
                        width: `${(marcos[i + 1]?.left ?? 100) - m.left}%`,
                      }}
                      className="absolute top-0 flex h-8 items-center overflow-hidden whitespace-nowrap border-l border-ink-200 pl-1.5 pr-1 text-[10px] uppercase tracking-wider text-ink-400 dark:border-ink-800"
                    >
                      {m.label}
                    </span>
                  ))}
                  {hojeLeft !== null && (
                    <span
                      style={{ left: `${hojeLeft}%` }}
                      className="absolute top-0 h-8 w-px bg-accent-500"
                    />
                  )}
                </div>

                <div className="relative">
                  {/* Grade semanal e linha de hoje atravessam todas as
                      faixas: é contra elas que se compara duas barras. */}
                  {linhasSemana.map((left) => (
                    <span
                      key={left}
                      style={{ left: `${left}%` }}
                      className="pointer-events-none absolute inset-y-0 w-px bg-ink-100 dark:bg-ink-800"
                    />
                  ))}
                  {hojeLeft !== null && (
                    <span
                      style={{ left: `${hojeLeft}%` }}
                      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent-500/50"
                    />
                  )}

                  {barras.map((barra) => {
                    const meta = TASK_STATUS[barra.status] ?? TASK_STATUS.todo
                    return (
                      <div
                        key={barra.id}
                        className="relative h-10 border-b border-ink-100 last:border-0 dark:border-ink-800"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setModal({ task: { id: barra.id } })}
                          onContextMenu={(event) =>
                            openMenu(event, { task: { id: barra.id, title: barra.title } })
                          }
                          style={{
                            left: `${barra.left}%`,
                            width: `${barra.width}%`,
                            backgroundColor: barra.color || meta.accent,
                          }}
                          title={`${barra.title} — ${barra.rotuloPeriodo}`}
                          className={cn(
                            'absolute top-1/2 z-20 flex h-6 -translate-y-1/2 items-center overflow-hidden px-2 text-[11px] font-medium text-white shadow-sm transition hover:brightness-110',
                            barra.cortadoInicio ? 'rounded-l-none' : 'rounded-l-md',
                            barra.cortadoFim ? 'rounded-r-none' : 'rounded-r-md',
                            // Concluída fica presente mas apagada: some do
                            // caminho sem sumir da história.
                            barra.concluida && 'opacity-40 saturate-50',
                            barra.is_overdue && !barra.concluida && 'ring-1 ring-red-500',
                          )}
                        >
                          <span className={cn('truncate', barra.concluida && 'line-through')}>
                            {barra.duracaoDias > 1 ? `${barra.duracaoDias} dias` : barra.title}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </PageBody>

      <TaskFormModal
        open={!!modal}
        task={modal?.task}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null)
          refetch()
        }}
      />

      <TaskScheduler
        open={!!scheduling}
        task={scheduling}
        onClose={() => setScheduling(null)}
        onSaved={refetch}
      />

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? buildMenu(menu.payload.task) : []}
      />
      {dialogs}
    </>
  )
}

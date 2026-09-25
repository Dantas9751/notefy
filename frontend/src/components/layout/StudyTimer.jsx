import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pause, Play, Timer } from 'lucide-react'
import { documentPath, kindMeta } from '@/lib/documents'
import { cn, formatDate } from '@/lib/utils'
import {
  chaveDoDia,
  chaveDosDocumentos,
  deveContar,
  documentoAberto,
  formatarDuracao,
  gravarPorDocumento,
  gravarTotal,
  historico,
  lerPorDocumento,
  lerTotal,
  rankingDoDia,
  somarSegundo,
} from '@/lib/estudo'

/**
 * Quanto tempo de estudo hoje.
 *
 * Anda sozinho enquanto o app está na frente e a pessoa mexeu no último
 * minuto; para sozinho quando ela sai. Clicar pausa e despausa — é a
 * saída para quem está lendo no papel com o app aberto e não quer o
 * tempo contado, ou para quem está e quer.
 *
 * Mora no rodapé da sidebar porque é o único lugar que a interface toda
 * compartilha: o cabeçalho de página some no zen e no split existem dois.
 */
export default function StudyTimer({ collapsed }) {
  const [segundos, setSegundos] = useState(() => lerTotal(chaveDoDia()))
  const [pausado, setPausado] = useState(false)
  const [verHistorico, setVerHistorico] = useState(false)

  // Em ref, não em estado: mexer o mouse não pode repintar a sidebar.
  const ultimaAtividade = useRef(Date.now())
  // O dia corrente também: comparado a cada tique, é o que faz o
  // contador virar sozinho à meia-noite sem um timer só para isso.
  const chaveRef = useRef(chaveDoDia())

  useEffect(() => {
    const marcar = () => {
      ultimaAtividade.current = Date.now()
    }
    // `passive`: nenhum destes previne o default, e sem a marca o
    // Chromium reclama de listener de scroll/touch bloqueante.
    const eventos = ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }))
    return () => eventos.forEach((e) => window.removeEventListener(e, marcar))
  }, [])

  useEffect(() => {
    const tique = setInterval(() => {
      // Virou o dia: grava o que sobrou na chave velha e zera.
      const chaveAgora = chaveDoDia()
      if (chaveAgora !== chaveRef.current) {
        chaveRef.current = chaveAgora
        setSegundos(lerTotal(chaveAgora))
        return
      }

      if (
        !deveContar({
          visivel: document.visibilityState === 'visible',
          ultimaAtividade: ultimaAtividade.current,
          pausado,
        })
      ) {
        return
      }

      // O mesmo segundo que entra no total entra no documento aberto —
      // e só nele. Fora de um documento (no Kanban, na busca) o tempo
      // continua contando para o dia, sem dono: ler o próprio calendário
      // é usar o app, mas não é estudar nada em particular.
      //
      // Lê, soma e grava na mesma volta, em vez de guardar o mapa numa
      // ref: com duas janelas abertas, cada uma teria uma cópia sem as
      // entradas da outra, e a última a gravar apagaria o tempo que a
      // primeira contou.
      const emEstudo = documentoAberto()
      if (emEstudo) {
        const chaveDocs = chaveDosDocumentos()
        gravarPorDocumento(chaveDocs, somarSegundo(lerPorDocumento(chaveDocs), emEstudo))
      }

      setSegundos((atual) => {
        const proximo = atual + 1
        // ponytail: grava a cada segundo. São poucos bytes numa chave só;
        // se virar problema, gravar a cada 15s e no `visibilitychange`.
        gravarTotal(chaveRef.current, proximo)
        return proximo
      })
    }, 1000)
    return () => clearInterval(tique)
  }, [pausado])

  const rotulo = formatarDuracao(segundos)

  // O rateio de hoje muda a cada segundo, então ler direto é o certo —
  // um `JSON.parse` de um objeto com meia dúzia de chaves por segundo
  // não é custo, e um memo sobre `segundos` recalcularia do mesmo jeito.
  const ranking = verHistorico ? rankingDoDia(lerPorDocumento(chaveDosDocumentos())) : []

  // Os dias ANTERIORES são outra história: são sete leituras síncronas de
  // `localStorage`, que bloqueiam a thread principal, e eles não mudam
  // enquanto o app está aberto. No corpo do render isso acontecia a cada
  // tique do cronômetro — 7 leituras por segundo para desenhar números
  // parados. Só a virada da meia-noite os renova, e é ela que troca a
  // chave do dia.
  const ultimosDias = useMemo(
    () => (verHistorico ? historico(7).slice(1) : []),
    [verHistorico, chaveRef.current],
  )

  if (collapsed) {
    return (
      <button
        onClick={() => setPausado((p) => !p)}
        title={`Estudo hoje: ${rotulo}${pausado ? ' (pausado)' : ''}`}
        aria-label={`Estudo hoje: ${rotulo}`}
        className="flex w-full flex-col items-center gap-0.5 rounded p-1.5 text-ink-400 transition hover:bg-ink-200/60 hover:text-ink-700 dark:hover:bg-ink-800"
      >
        <Timer size={15} className={cn(!pausado && segundos > 0 && 'text-accent-500')} />
        <span className="text-[9px] font-medium tabular-nums">{rotulo}</span>
      </button>
    )
  }

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 rounded-md px-1.5 py-1 text-ink-500 dark:text-ink-400">
        <Timer
          size={14}
          className={cn('shrink-0', !pausado && segundos > 0 && 'text-accent-500')}
        />
        <button
          onClick={() => setVerHistorico((v) => !v)}
          className="min-w-0 flex-1 text-left text-[11px] transition hover:text-ink-800 dark:hover:text-ink-100"
          title="Ver os últimos 7 dias"
        >
          Estudo hoje{' '}
          <span className="font-semibold tabular-nums text-ink-700 dark:text-ink-200">
            {rotulo}
          </span>
        </button>
        <button
          onClick={() => setPausado((p) => !p)}
          aria-label={pausado ? 'Retomar contagem' : 'Pausar contagem'}
          title={pausado ? 'Retomar contagem' : 'Pausar contagem'}
          className="shrink-0 rounded p-1 transition hover:bg-ink-200/60 hover:text-ink-700 dark:hover:bg-ink-800"
        >
          {pausado ? <Play size={12} /> : <Pause size={12} />}
        </button>
      </div>

      {verHistorico && (
        <div className="mt-1 space-y-2 px-1.5 pb-1">
          {/* O que ocupou o dia vem ANTES dos dias anteriores: é a
              resposta acionável ("faltou Álgebra"), e o histórico é o
              pano de fundo dela. */}
          {ranking.length > 0 && (
            <ul className="space-y-0.5">
              {ranking.map((item) => (
                <li key={item.id}>
                  <Link
                    to={documentPath({ id: item.id, kind: item.kind })}
                    title={item.titulo}
                    className="flex items-center gap-1.5 rounded px-0.5 py-px text-[10px] text-ink-400 transition hover:bg-ink-200/60 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-100"
                  >
                    <span
                      className="h-1 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: kindMeta(item.kind).accent }}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.titulo}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatarDuracao(item.segundos)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <ul className="space-y-0.5 border-t border-ink-200/70 pt-1.5 dark:border-ink-800">
            {ultimosDias.map(({ dia, segundos: s }) => (
              <li
                key={dia.toDateString()}
                className="flex justify-between text-[10px] text-ink-400"
              >
                {/* `formatDate` e não `toLocaleDateString`: o segundo
                    seguia o idioma do NAVEGADOR, e num Chrome em inglês
                    o histórico de estudo aparecia como "21 Mon" no meio
                    de um app todo em português. */}
                <span>{formatDate(dia, 'EEEEEE dd')}</span>
                <span className="tabular-nums">{s ? formatarDuracao(s) : '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

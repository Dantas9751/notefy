import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Send, Square, X, Sparkles, Settings, Plus, Eraser, Pin } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAssistente } from '@/context/AssistenteContext'
import { useSplit } from '@/context/SplitContext'
import { useTabs } from '@/context/TabsContext'
import { chatStream, runIA } from '@/lib/ai'
import api from '@/lib/api'
import { cn, limparMarkdown } from '@/lib/utils'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { comandosPara, instrucaoDoComando, sugestoesPara } from './comandos'
import { detectarAcao, rotuloAcao } from './acoes'
import { mergeDocumento } from './merge'
import { anexarTextoNaNota } from './executar'

//: Segmento da rota -> `kind` do documento.
const KIND_DA_ROTA = {
  notes: 'note',
  sheets: 'spreadsheet',
  diagrams: 'diagram',
  canvas: 'canvas',
}

/** Largura da gaveta como fração do lado em que ela abre. */
const CHAVE_FRACAO = 'notefy.assistente.fracao'
const FRACAO_MIN = 0.25
const FRACAO_MAX = 0.9

/**
 * Painel do assistente de IA (Ctrl+J).
 *
 * Abre como uma gaveta sobre a METADE do lado em foco: com "abrir ao
 * lado" ativo e o foco no painel, cobre a metade direita do painel;
 * caso contrário cobre a metade direita da main view. O documento em
 * contexto é sempre o do lado em foco — o chat pergunta sobre o que
 * está sendo olhado.
 */
export default function AssistentePanel() {
  const {
    aberto,
    lado,
    fechar,
    conversas,
    ativa,
    ativaId,
    selecionarConversa,
    abrirConversa,
    fecharConversa,
    fecharOutras,
    fecharTodas,
    fixarConversa,
    limparConversa,
    definirMensagens,
    renomearConversa,
  } = useAssistente()
  const { painel } = useSplit()
  const { tabs } = useTabs()
  const { user } = useAuth()
  const location = useLocation()
  const { menu, openMenu, closeMenu } = useContextMenu()

  const [regiao, setRegiao] = useState(null)
  // Fração da largura do lado que a gaveta ocupa. Metade é o padrão
  // pedido; o arrasto guarda a escolha entre sessões.
  const [fracao, setFracao] = useState(() => {
    const salvo = Number(localStorage.getItem(CHAVE_FRACAO))
    return salvo >= FRACAO_MIN && salvo <= FRACAO_MAX ? salvo : 0.5
  })
  const [arrastando, setArrastando] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState(null)
  //: Item destacado na lista de comandos (navegável pelas setas).
  const [indiceComando, setIndiceComando] = useState(0)
  const entradaRef = useRef(null)

  // Limpa o erro ao trocar de conversa: a mensagem de erro de uma aba
  // não deve persistir quando o usuário muda de aba.
  useEffect(() => {
    setErro(null)
  }, [ativaId])
  const abortRef = useRef(null)
  const fimRef = useRef(null)

  // As mensagens moram no contexto (sobrevivem a fechar o painel).
  const mensagens = ativa?.mensagens ?? []
  const setMensagens = useCallback(
    (atualizar) => definirMensagens(ativaId, atualizar),
    [definirMensagens, ativaId],
  )

  // Rota do lado em foco: o documento que vira contexto do chat.
  const rotaFocada = lado === 'painel' ? painel?.path : location.pathname
  const docNaTela = useMemo(() => {
    const par = /^\/(notes|sheets|diagrams|canvas)\/([0-9a-f-]{36})(\/|$)/.exec(rotaFocada ?? '')
    if (!par) return null
    // O nome do arquivo vem da aba correspondente — mostrar "Nota" não
    // diz ao usuário QUAL arquivo o assistente está lendo.
    const rota = `/${par[1]}/${par[2]}`
    const aba = tabs.find((t) => t.path === rota)
    return {
      // O segmento da rota não é o `kind` do documento (`/sheets` guarda
      // um `spreadsheet`); os comandos filtram por kind, então traduz aqui.
      kind: KIND_DA_ROTA[par[1]],
      id: par[2],
      title: aba?.title || null,
    }
  }, [rotaFocada, tabs])

  // Conversa fixada não troca de assunto ao navegar: ela continua no
  // documento em que foi fixada.
  const contextoDoc = ativa?.fixada
    ? ativa.docId
      ? { id: ativa.docId, title: ativa.docTitulo, kind: ativa.docKind }
      : null
    : docNaTela

  // ----------------------------------------------------------------
  // Comandos de barra
  //
  // A lista depende do item aberto: `/formula` só existe em planilha,
  // `/percorrer` só em desenho. Fora de um item não há comando nenhum —
  // todos operam sobre o material em contexto.
  // ----------------------------------------------------------------
  const kindDoContexto = contextoDoc?.kind ?? null
  const comandosDisponiveis = useMemo(
    () => comandosPara(kindDoContexto),
    [kindDoContexto],
  )
  const sugestoes = useMemo(
    () => sugestoesPara(prompt, kindDoContexto),
    [prompt, kindDoContexto],
  )

  // A seleção volta ao topo sempre que a lista muda, senão o índice
  // apontaria para um comando que já saiu de vista.
  useEffect(() => {
    setIndiceComando(0)
  }, [prompt])

  /** Completa o nome do comando e deixa o cursor pronto para o argumento. */
  const aceitarComando = useCallback((comando) => {
    setPrompt(comando.arg ? `${comando.nome} ` : comando.nome)
    entradaRef.current?.focus()
  }, [])

  // A aba do assistente leva o nome do arquivo em contexto.
  useEffect(() => {
    if (!aberto || !ativaId) return
    renomearConversa(ativaId, docNaTela?.title || 'Conversa', docNaTela)
  }, [aberto, ativaId, docNaTela, renomearConversa])

  // Abrir o painel é sinal de vontade de digitar: foco no campo. O
  // requestAnimationFrame espera o gaveta existir no DOM (o painel só
  // monta depois de `aberto` virar true).
  useEffect(() => {
    if (!aberto) return
    const foco = requestAnimationFrame(() => entradaRef.current?.focus())
    return () => cancelAnimationFrame(foco)
  }, [aberto])

  const semConfig = !user?.preferences?.ai_provider

  // Área do lado em que a gaveta abre (main view ou painel do "abrir ao
  // lado"). A gaveta é uma fração dela, ancorada à direita — recalculada
  // quando a divisória do split ou a janela mudam.
  useEffect(() => {
    if (!aberto) return
    const calcular = () => {
      const alvo =
        lado === 'painel'
          ? document.querySelector('[data-painel]')
          : document.querySelector('[data-assistente-alvo]')
      if (!alvo) return
      const r = alvo.getBoundingClientRect()
      setRegiao({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    calcular()
    window.addEventListener('resize', calcular)
    // A divisória do split muda a largura sem disparar `resize`.
    const observador = new ResizeObserver(calcular)
    const alvo =
      lado === 'painel'
        ? document.querySelector('[data-painel]')
        : document.querySelector('[data-assistente-alvo]')
    if (alvo) observador.observe(alvo)
    return () => {
      window.removeEventListener('resize', calcular)
      observador.disconnect()
    }
  }, [aberto, lado])

  // Arrasto da alça: a largura vira uma fração do lado, então trocar de
  // lado (ou mexer na divisória) preserva a proporção escolhida.
  useEffect(() => {
    if (!arrastando || !regiao) return
    const mover = (e) => {
      const direita = regiao.left + regiao.width
      const nova = (direita - e.clientX) / regiao.width
      setFracao(Math.min(FRACAO_MAX, Math.max(FRACAO_MIN, nova)))
    }
    const soltar = () => setArrastando(false)
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    const cursorAntes = document.body.style.cursor
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      document.body.style.cursor = cursorAntes
      document.body.style.userSelect = ''
    }
  }, [arrastando, regiao])

  useEffect(() => {
    if (!arrastando) localStorage.setItem(CHAVE_FRACAO, String(fracao))
  }, [arrastando, fracao])

  const parar = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // Fechar interrompe a resposta em andamento.
  useEffect(() => {
    if (!aberto) parar()
  }, [aberto, parar])

  // Esc fecha o painel quando o foco está dentro dele.
  useEffect(() => {
    if (!aberto) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && e.target.closest('[data-assistente]')) {
        e.stopPropagation()
        fechar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [aberto, fechar])

  const enviar = useCallback(async () => {
    const digitado = prompt.trim()
    if (!digitado || gerando || semConfig) return

    // ----------------------------------------------------------------
    // 1) Ação direta no documento (mapa mental, diagrama, planilha...)
    //
    // Se o texto combina com um padrão de criação e há um documento
    // aberto do tipo certo, a IA gera o conteúdo e grava — por padrão
    // ACRESCENTA ao que já existe; só substitui quando o usuário pediu
    // regenerar/refazer explicitamente.
    // ----------------------------------------------------------------
    const acao = detectarAcao(digitado, kindDoContexto)
    if (acao && contextoDoc?.id) {
      const historicoDisplay = [...mensagens, { role: 'user', content: digitado }]
      setMensagens([...historicoDisplay, { role: 'assistant', content: '' }])
      setPrompt('')
      setGerando(true)
      setErro(null)

      // O botão "Parar" precisa de um controller para abortar — sem ele
      // era um no-op e o patch gravava mesmo com o usuário desistindo.
      abortRef.current = new AbortController()
      const { signal } = abortRef.current
      try {
        // Busca o documento aberto: pasta (para criar itens novos) e
        // conteúdo atual (para o merge).
        const { data: docAtual } = await api.get(`/documents/${contextoDoc.id}/`, { signal })

        if (acao.task.startsWith('criar.')) {
          // "Criar nota sobre X": gera um item NOVO na mesma pasta —
          // não tem nada a ver com o documento aberto.
          await runIA({
            task: acao.task,
            documentId: contextoDoc.id,
            input: acao.input,
            apply: 'create',
            folderId: docAtual.folder,
            kind: { 'criar.nota': 'note', 'criar.planilha': 'spreadsheet' }[acao.task],
            title: acao.input.slice(0, 60),
            signal,
          })
          const rotulo = rotuloAcao(acao.task)
          setMensagens((m) => {
            const copia = [...m]
            copia[copia.length - 1] = { role: 'assistant', content: `${rotulo} na pasta atual.` }
            return copia
          })
          // Novo item em pasta/lista aberta: sidebar e listas precisam saber.
          window.dispatchEvent(new Event('notefy:moved'))
        } else if (acao.task.startsWith('nota.') && acao.task !== 'nota.traduzir') {
          // Tarefas de TEXTO dentro da nota aberta ("escreva um texto
          // sobre X", "continua", "resume"...): o resultado é texto e
          // entra como NOVA SEÇÃO — nunca substituindo o que há.
          // "continua sobre X" leva o assunto junto: continuar uma nota
          // quase vazia sem tema fazia o modelo devolver um sermão em vez
          // de texto.
          const pedido =
            acao.task === 'nota.texto'
              ? `Escreva um texto de estudo sobre ${acao.input}, com títulos curtos e parágrafos objetivos.`
              : undefined
          const resultado = await runIA({
            task: acao.task === 'nota.texto' ? 'chat' : acao.task,
            documentId: contextoDoc.id,
            input: pedido ?? acao.input,
            signal,
          })
          await anexarTextoNaNota({
            documentId: contextoDoc.id,
            texto: resultado.text,
            atual: docAtual,
            signal,
          })
          const rotulo = rotuloAcao(acao.task)
          setMensagens((m) => {
            const copia = [...m]
            copia[copia.length - 1] = { role: 'assistant', content: rotulo }
            return copia
          })
        } else {
          // Gera para o DOCUMENTO ABERTO (preview — sem gravar ainda).
          const resultado = await runIA({
            task: acao.task,
            documentId: contextoDoc.id,
            input: acao.input,
            signal,
          })

          // "Regenerar/refazer" substitui; criar normal acrescenta ao
          // existente — perder o trabalho anterior num pedido novo seria
          // hostil, e Ctrl+Z não devolve o que o chat sobrescreveu.
          const merged = mergeDocumento(contextoDoc.kind, docAtual.data, resultado.data, {
            substituir: acao.apply === 'replace',
          })

          await api.patch(`/documents/${contextoDoc.id}/`, { data: merged }, { signal })

          const rotulo = rotuloAcao(acao.task)
          setMensagens((m) => {
            const copia = [...m]
            copia[copia.length - 1] = { role: 'assistant', content: rotulo }
            return copia
          })
          // Avisa o editor que o documento mudou.
          window.dispatchEvent(
            new CustomEvent(`notefy:saved:${contextoDoc.id}`, {
              detail: { origem: 'chat' },
            }),
          )
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // Usuário parou: remove a bolha vazia, sem erro na tela.
          setMensagens((m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)))
        } else {
          setErro(err.message || 'Falha ao gerar.')
          setMensagens((m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)))
        }
      } finally {
        setGerando(false)
        abortRef.current = null
        fimRef.current?.scrollIntoView({ block: 'end' })
      }
      return
    }

    // ----------------------------------------------------------------
    // 2) Chat normal (comando ou pergunta)
    // ----------------------------------------------------------------
    const instrucao = instrucaoDoComando(digitado, kindDoContexto) ?? digitado
    const historicoDisplay = [...mensagens, { role: 'user', content: digitado }]
    const historicoIA = [...mensagens, { role: 'user', content: instrucao }]
    setMensagens([...historicoDisplay, { role: 'assistant', content: '' }])
    setPrompt('')
    setGerando(true)
    setErro(null)

    abortRef.current = new AbortController()
    let acumulado = ''
    try {
      await chatStream({
        messages: historicoIA,
        documentId: contextoDoc?.id,
        signal: abortRef.current.signal,
        onText: (pedaco) => {
          acumulado += pedaco
          setMensagens((m) => {
            const copia = [...m]
            copia[copia.length - 1] = { role: 'assistant', content: acumulado }
            return copia
          })
        },
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        setMensagens((m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)))
      } else {
        setErro(err.message || 'Falha na chamada de IA.')
        setMensagens((m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)))
      }
    } finally {
      setGerando(false)
      abortRef.current = null
      fimRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [prompt, gerando, semConfig, mensagens, contextoDoc, kindDoContexto])

  if (!aberto) return null

  return (
    <div
      data-assistente=""
      className="fixed z-40 flex flex-col border-l border-ink-200 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-950"
      style={{
        left: (regiao?.left ?? 0) + (regiao?.width ?? 0) * (1 - fracao),
        top: regiao?.top ?? 0,
        width: (regiao?.width ?? 0) * fracao,
        height: regiao?.height ?? 0,
      }}
    >
      {/* Alça de largura: mesma pegada da divisória do split. */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Arraste para redimensionar"
        onMouseDown={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        className={cn(
          'absolute inset-y-0 -left-1 w-2 cursor-col-resize transition',
          arrastando ? 'bg-accent-500/40' : 'hover:bg-accent-500/20',
        )}
      />

      <div className="flex shrink-0 items-center gap-2 border-b border-ink-200 px-4 py-3 dark:border-ink-800">
        <Sparkles size={16} className="text-accent-600" />
        <h2 className="flex-1 truncate text-sm font-semibold text-ink-900 dark:text-ink-50">
          Laviel
        </h2>
        {contextoDoc && (
          <span
            className={cn(
              'flex max-w-[10rem] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px]',
              ativa?.fixada
                ? 'border-accent-300 text-accent-700 dark:border-accent-500/40 dark:text-accent-300'
                : 'border-ink-200 text-ink-500 dark:border-ink-800 dark:text-ink-400',
            )}
            title={
              ativa?.fixada
                ? `Fixada em "${contextoDoc.title || 'este item'}". Não muda ao navegar.`
                : `O chat lê "${contextoDoc.title || 'este item'}" como contexto`
            }
          >
            {ativa?.fixada && <Pin size={9} className="shrink-0" />}
            <span className="truncate">{contextoDoc.title || 'Sem título'}</span>
          </span>
        )}
        <button
          onClick={() => limparConversa(ativaId)}
          disabled={!mensagens.length}
          className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-ink-800 dark:hover:text-ink-200"
          title="Limpar conversa"
        >
          <Eraser size={15} />
        </button>
        <button
          onClick={fechar}
          className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
          title="Fechar (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      {/* Abas de conversa: mesma ideia das abas do app, cada uma com o
          seu histórico e o nome do arquivo que estava em contexto. */}
      <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/40">
        {conversas.map((c) => (
          <div
            key={c.id}
            onClick={() => selecionarConversa(c.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              selecionarConversa(c.id)
              openMenu(e, {
                items: [
                  {
                    label: c.fixada ? 'Desafixar conversa' : 'Manter esta conversa',
                    icon: Pin,
                    onClick: () => fixarConversa(c.id, docNaTela),
                  },
                  { separator: true },
                  { label: 'Limpar conversa', icon: Eraser, onClick: () => limparConversa(c.id) },
                  { label: 'Fechar', icon: X, onClick: () => fecharConversa(c.id) },
                  {
                    label: 'Fechar as outras',
                    icon: X,
                    disabled: conversas.length < 2,
                    onClick: () => fecharOutras(c.id),
                  },
                  { label: 'Fechar todas', icon: X, onClick: fecharTodas },
                ],
              })
            }}
            className={cn(
              'group flex min-w-[6rem] max-w-[11rem] shrink-0 cursor-pointer items-center gap-1.5 border-r border-ink-200 px-2.5 py-1.5 text-xs transition dark:border-ink-800',
              c.id === ativaId
                ? 'bg-white text-ink-900 dark:bg-ink-950 dark:text-ink-50'
                : 'text-ink-500 hover:bg-ink-100/70 dark:text-ink-400 dark:hover:bg-ink-800/50',
            )}
            title={c.fixada ? `${c.titulo} (fixada)` : c.titulo}
          >
            {c.fixada && <Pin size={10} className="shrink-0 text-accent-600" />}
            <span className="min-w-0 flex-1 truncate">{c.titulo}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                fecharConversa(c.id)
              }}
              className="shrink-0 rounded p-0.5 text-ink-400 opacity-0 transition group-hover:opacity-100 hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
              title="Fechar conversa"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          onClick={abrirConversa}
          className="flex shrink-0 items-center border-r border-ink-200 px-2.5 text-ink-400 transition hover:bg-ink-100/70 hover:text-accent-600 dark:border-ink-800 dark:hover:bg-ink-800/50"
          title="Nova conversa"
        >
          <Plus size={14} />
        </button>
      </div>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu?.payload?.items ?? []}
      />

      {semConfig ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Sparkles size={28} className="text-ink-300 dark:text-ink-600" />
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Configure sua chave de IA nas configurações para falar com o Laviel.
          </p>
          <a
            href="/settings"
            className="flex items-center gap-2 rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-700"
          >
            <Settings size={14} /> Abrir configurações
          </a>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {mensagens.length === 0 && (
              <p className="mt-4 text-center text-xs text-ink-400 dark:text-ink-500">
                {comandosDisponiveis.length
                  ? 'Peça ao Laviel para explicar, resumir ou organizar o item aberto. Digite / para ver os comandos.'
                  : 'Abra uma nota, planilha, diagrama ou canvas para o Laviel trabalhar sobre ele.'}
              </p>
            )}
            {mensagens.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'mb-2 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'ml-8 bg-accent-600 text-white'
                    : 'mr-8 bg-ink-100 text-ink-800 dark:bg-ink-800/60 dark:text-ink-100',
                )}
              >
                {m.role === 'assistant'
                  ? limparMarkdown(m.content) || (gerando && i === mensagens.length - 1 ? '…' : '')
                  : m.content}
              </div>
            ))}
            {erro && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {erro}
              </p>
            )}
            <div ref={fimRef} />
          </div>

          <div className="relative shrink-0 border-t border-ink-200 p-3 dark:border-ink-800">
            {/* Lista de comandos: aparece ACIMA do campo enquanto o nome
                do comando está sendo digitado. */}
            {sugestoes.length > 0 && (
              <div className="absolute inset-x-3 bottom-full z-10 mb-2 max-h-64 overflow-y-auto rounded-md border border-ink-200 bg-white py-1 shadow-pop dark:border-ink-700 dark:bg-ink-900">
                {sugestoes.map((c, i) => (
                  <button
                    key={c.nome}
                    onMouseEnter={() => setIndiceComando(i)}
                    onClick={() => aceitarComando(c)}
                    className={cn(
                      'flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition',
                      i === indiceComando
                        ? 'bg-accent-50 dark:bg-accent-500/10'
                        : 'hover:bg-ink-50 dark:hover:bg-ink-800',
                    )}
                  >
                    <span className="font-mono text-xs font-medium text-accent-700 dark:text-accent-300">
                      {c.nome}
                    </span>
                    {c.arg && (
                      <span className="shrink-0 font-mono text-[10px] text-ink-400">
                        {c.arg}
                      </span>
                    )}
                    <span className="ml-auto truncate text-[11px] text-ink-500 dark:text-ink-400">
                      {c.descricao}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Atalhos só quando há item: fora dele não há o que comandar. */}
            {comandosDisponiveis.length > 0 && !prompt && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {comandosDisponiveis.slice(0, 4).map((c) => (
                  <button
                    key={c.nome}
                    onClick={() => aceitarComando(c)}
                    title={c.descricao}
                    className="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] text-ink-500 transition hover:border-accent-400 hover:text-accent-600 dark:border-ink-800 dark:text-ink-400"
                  >
                    {c.nome}
                  </button>
                ))}
                <span className="self-center text-[11px] text-ink-400">
                  digite / para ver todos
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={entradaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  // Com a lista aberta, as setas escolhem e Tab/Enter
                  // completam — só depois disso o Enter envia.
                  if (sugestoes.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setIndiceComando((i) => (i + 1) % sugestoes.length)
                      return
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setIndiceComando(
                        (i) => (i - 1 + sugestoes.length) % sugestoes.length,
                      )
                      return
                    }
                    // Completa quando o texto ainda NÃO é o comando exato
                    // ("/resu" → "/resumir"). Sendo exato, Enter envia em
                    // vez de completar para sempre.
                    const alvo = sugestoes[indiceComando] ?? sugestoes[0]
                    if (
                      (e.key === 'Tab' || e.key === 'Enter') &&
                      prompt.trim().toLowerCase() !== alvo.nome.toLowerCase()
                    ) {
                      e.preventDefault()
                      aceitarComando(alvo)
                      return
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setPrompt('')
                      return
                    }
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    enviar()
                  }
                }}
                placeholder={
                  comandosDisponiveis.length
                    ? 'Pergunte ao Laviel ou digite /'
                    : 'Pergunte ao Laviel…'
                }
                className="min-w-0 flex-1 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100"
              />
              {gerando ? (
                <button
                  onClick={parar}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100 dark:border-ink-800 dark:text-ink-300 dark:hover:bg-ink-800"
                  title="Parar"
                >
                  <Square size={13} /> Parar
                </button>
              ) : (
                <button
                  onClick={enviar}
                  disabled={!prompt.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={13} /> Enviar
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
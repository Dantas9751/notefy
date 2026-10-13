import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { t } from '@/lib/i18n'

const AssistenteContext = createContext(null)

/** Uma conversa nova, sempre com histórico limpo. */
let contador = 0
const novaConversa = (titulo = t('Conversa')) => ({
  id: `c${Date.now()}-${contador++}`,
  titulo,
  mensagens: [],
  // Conversa fixada não troca de assunto quando você sai do arquivo: ela
  // guarda o documento em que nasceu e continua falando sobre ele.
  fixada: false,
  docId: null,
  docTitulo: null,
  //: O tipo do item (note, spreadsheet...). Os comandos de barra mudam
  //: conforme ele, então a conversa fixada precisa lembrar qual era.
  docKind: null,
})

/**
 * O chat do Laviel, o assistente de IA.
 *
 * `modo` é como ele aparece: `'gaveta'` (Ctrl+J), presa à direita do lado
 * em foco, ou `'flutuante'` (Ctrl+Shift+Espaço), uma caixa solta sobre o
 * app que se arrasta e muda de tamanho. É o mesmo chat nos dois: mesmas
 * conversas, mesmo arquivo em contexto.
 *
 * `lado` diz sobre qual metade da tela ele lê e abre: `'main'` (o
 * conteúdo principal) ou `'painel'` (o "abrir ao lado"). Quem decide o
 * lado é o AppLayout, olhando onde está o foco — o contexto só guarda.
 *
 * As conversas vivem AQUI, e não dentro do componente, porque fechar o
 * painel desmontava a árvore e apagava o histórico junto. São abas como
 * as do app: várias em paralelo, cada uma com o seu histórico.
 */
export function AssistenteProvider({ children }) {
  const [aberto, setAberto] = useState(false)
  const [modo, setModo] = useState('gaveta')
  const [lado, setLado] = useState('main')
  const [conversas, setConversas] = useState(() => [novaConversa()])
  const [ativaId, setAtivaId] = useState(() => null)

  const idAtiva = ativaId ?? conversas[0]?.id ?? null
  const ativa = conversas.find((c) => c.id === idAtiva) ?? conversas[0] ?? null

  const fechar = useCallback(() => setAberto(false), [])

  /**
   * O atalho de cada modo: fecha se o chat já está aberto NAQUELE modo; senão
   * abre nele (aberto no outro, só muda de jeito, sem perder a conversa).
   */
  const alternar = useCallback(
    (qualLado, qualModo = 'gaveta') => {
      if (aberto && modo === qualModo) {
        setAberto(false)
        return
      }
      if (qualLado) setLado(qualLado)
      setModo(qualModo)
      setAberto(true)
    },
    [aberto, modo],
  )

  const abrirConversa = useCallback(() => {
    const conversa = novaConversa()
    setConversas((lista) => [...lista, conversa])
    setAtivaId(conversa.id)
  }, [])

  /** Fechar a última conversa deixa uma vazia no lugar: o painel nunca fica sem aba. */
  const fecharConversa = useCallback((id) => {
    setConversas((lista) => {
      const restantes = lista.filter((c) => c.id !== id)
      if (restantes.length) {
        setAtivaId((atual) => {
          if (atual !== id) return atual
          const indice = lista.findIndex((c) => c.id === id)
          return (restantes[indice] ?? restantes[restantes.length - 1]).id
        })
        return restantes
      }
      const limpa = novaConversa()
      setAtivaId(limpa.id)
      return [limpa]
    })
  }, [])

  /** Limpa o histórico sem fechar a aba. */
  const limparConversa = useCallback((id) => {
    setConversas((lista) =>
      lista.map((c) => (c.id === id ? { ...c, mensagens: [] } : c)),
    )
  }, [])

  const definirMensagens = useCallback((id, atualizar) => {
    setConversas((lista) =>
      lista.map((c) =>
        c.id === id
          ? {
              ...c,
              mensagens:
                typeof atualizar === 'function' ? atualizar(c.mensagens) : atualizar,
            }
          : c,
      ),
    )
  }, [])

  /** Fecha todas menos a indicada. */
  const fecharOutras = useCallback((id) => {
    setConversas((lista) => lista.filter((c) => c.id === id))
    setAtivaId(id)
  }, [])

  /** Fecha tudo e começa do zero. */
  const fecharTodas = useCallback(() => {
    const limpa = novaConversa()
    setConversas([limpa])
    setAtivaId(limpa.id)
  }, [])

  /**
   * Fixa a conversa no documento em que ela está.
   *
   * Fixada, ela para de seguir a navegação: sair do arquivo `aa` não
   * transforma o chat sobre `aa` num chat sobre outra coisa. É o que
   * permite ter uma aba por arquivo sem abrir duas no mesmo sem querer.
   */
  const fixarConversa = useCallback((id, doc) => {
    setConversas((lista) =>
      lista.map((c) =>
        c.id === id
          ? c.fixada
            ? { ...c, fixada: false }
            : {
                ...c,
                fixada: true,
                docId: doc?.id ?? c.docId,
                docTitulo: doc?.title ?? c.docTitulo,
                docKind: doc?.kind ?? c.docKind,
                titulo: doc?.title ?? c.titulo,
              }
          : c,
      ),
    )
  }, [])

  /** O título da aba é o nome do arquivo em contexto, não o tipo. */
  const renomearConversa = useCallback((id, titulo, doc) => {
    setConversas((lista) =>
      lista.map((c) =>
        c.id === id && !c.fixada
          ? {
              ...c,
              titulo: titulo || t('Conversa'),
              docId: doc?.id ?? null,
              docTitulo: doc?.title ?? null,
              docKind: doc?.kind ?? null,
            }
          : c,
      ),
    )
  }, [])

  const value = useMemo(
    () => ({
      aberto,
      modo,
      trocarModo: setModo,
      lado,
      fechar,
      alternar,
      conversas,
      ativa,
      ativaId: idAtiva,
      selecionarConversa: setAtivaId,
      abrirConversa,
      fecharConversa,
      fecharOutras,
      fecharTodas,
      fixarConversa,
      limparConversa,
      definirMensagens,
      renomearConversa,
    }),
    [
      aberto,
      modo,
      lado,
      fechar,
      alternar,
      conversas,
      ativa,
      idAtiva,
      abrirConversa,
      fecharConversa,
      fecharOutras,
      fecharTodas,
      fixarConversa,
      limparConversa,
      definirMensagens,
      renomearConversa,
    ],
  )

  return <AssistenteContext.Provider value={value}>{children}</AssistenteContext.Provider>
}

export function useAssistente() {
  const ctx = useContext(AssistenteContext)
  if (!ctx) throw new Error('useAssistente precisa estar dentro de <AssistenteProvider>.')
  return ctx
}
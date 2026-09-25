import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { semQuery } from '@/context/SplitContext'

const TabsContext = createContext(null)

/** Por janela, não por usuário: cada janela tem o seu conjunto de abas. */
const STORAGE_KEY = 'notefy.tabs'

/**
 * Rotas que viram aba.
 *
 * Documentos se abrem e editam — caso óbvio de aba. As páginas do app
 * (dashboard, categoria, pasta, quadro...) também: navegar para uma
 * delas cria uma aba, e duas categorias ficam lado a lado na barra,
 * como duas abas de navegador. Rotas que são só passagem — busca,
 * ajustes — não viram aba.
 */
const ABRIVEIS = [
  [/^\/notes\/[^/]+$/, 'note'],
  [/^\/sheets\/[^/]+$/, 'spreadsheet'],
  [/^\/diagrams\/[^/]+$/, 'diagram'],
  [/^\/canvas\/[^/]+$/, 'canvas'],
  [/^\/files\/[^/]+$/, 'file'],
  [/^\/$/, 'home'],
  [/^\/categories\/[^/]+$/, 'category'],
  [/^\/folders\/[^/]+$/, 'folder'],
  [/^\/board$/, 'board'],
  [/^\/calendar$/, 'calendar'],
  [/^\/recent$/, 'recent'],
  [/^\/trash$/, 'trash'],
  [/^\/roadmap$/, 'roadmap'],
]

/**
 * Título padrão da aba de uma página — a página depois o corrige com o
 * nome real (categoria "Matemática", pasta "Projeto X"). Documento não
 * tem título aqui: quem o conhece é quem carregou o conteúdo.
 */
const TITULOS_PADRAO = {
  home: 'Início',
  category: 'Categoria',
  folder: 'Pasta',
  board: 'Quadro',
  calendar: 'Calendário',
  recent: 'Recentes',
  trash: 'Lixeira',
  roadmap: 'Roadmap',
}

/** Descreve a aba de uma rota, ou `null` se a rota não é abrível. */
export function tabDe(location) {
  const par = ABRIVEIS.find(([re]) => re.test(location.pathname))
  if (!par) return null

  // Dois `/notes/new` em pastas diferentes são documentos diferentes; o
  // caminho sozinho os fundiria numa aba só.
  const key = location.pathname.endsWith('/new')
    ? location.pathname + location.search
    : location.pathname

  // `title` só quando existe padrão: documento não tem título aqui (quem
  // o conhece é quem carregou o conteúdo), e mandar `null` no spread do
  // REPLACE apagaria o título que a aba já tinha.
  const title = TITULOS_PADRAO[par[1]] ?? undefined
  return title ? { key, path: key, kind: par[1], title } : { key, path: key, kind: par[1] }
}

export function TabsProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const tipoNavegacao = useNavigationType()

  const [tabs, setTabs] = useState(() => {
    try {
      const bruto = sessionStorage.getItem(STORAGE_KEY)
      const lido = bruto ? JSON.parse(bruto) : []
      return Array.isArray(lido) ? lido : []
    } catch {
      return []
    }
  })

  const atual = tabDe(location)

  // Última aba que o usuário ativou NA MÃO. Com abas duplicadas de
  // página (dois "Início"), o path sozinho não diz qual delas está
  // ativa — o desempate é esta referência.
  const ultimaAtiva = useRef(null)

  // Path que não pode virar aba nova nesta navegação. Fechar a última
  // aba navega para `/` (ou a vizinha) só para preencher a tela; sem o
  // aviso, o efeito abaixo recriaria a aba que acabou de ser fechada.
  const suprimirReaddicao = useRef(null)

  /** Ativa uma aba específica (clique na aba). */
  const ativar = useCallback((key) => {
    ultimaAtiva.current = key
  }, [])

  const activeKey = useMemo(() => {
    if (!atual) return null
    const iguais = tabs.filter((t) => t.path === atual.path)
    if (iguais.length === 0) return null
    if (iguais.length === 1) return iguais[0].key
    return iguais.some((t) => t.key === ultimaAtiva.current)
      ? ultimaAtiva.current
      : iguais[iguais.length - 1].key
  }, [atual, tabs])

  // Qual aba estava ativa antes desta navegação. É o que permite tratar o
  // `replace` como "mesma vaga" logo abaixo.
  const anterior = useRef(activeKey)
  const pathAtual = atual?.path ?? null

  useEffect(() => {
    const saindo = anterior.current
    anterior.current = activeKey

    setTabs((atuais) => {
      // Navegação vinda do fechamento de aba (vizinha ou `/`): não é uma
      // visita real, e recriar a aba de lá deixaria o usuário preso numa
      // aba que ele acabou de fechar.
      if (suprimirReaddicao.current && atual && atual.path === suprimirReaddicao.current) {
        suprimirReaddicao.current = null
        return atuais
      }

      const indice = atuais.findIndex((t) => t.key === saindo)

      // `replace` não empilha histórico — é a mesma posição sendo trocada,
      // e a aba tem que acompanhar. Cobre os dois casos que existem:
      // salvar um documento novo (/notes/new → /notes/<id>, que viraria
      // duas abas) e excluir um (vai para a listagem, e a aba deve fechar
      // em vez de ficar apontando para um item que não existe mais).
      if (tipoNavegacao === 'REPLACE' && indice !== -1 && saindo !== activeKey) {
        const copia = [...atuais]
        if (atual) copia[indice] = { ...copia[indice], ...atual }
        else copia.splice(indice, 1)
        return copia
      }

      if (tipoNavegacao === 'REPLACE' && saindo === activeKey) return atuais

      // Rota já aberta: foca a aba existente em vez de empilhar.
      if (!atual || atuais.some((t) => t.path === atual.path)) return atuais

      // Rota nova. Se a aba ativa é uma PÁGINA (Início, categoria, pasta,
      // quadro, calendário...) e o destino também é página, a navegação
      // TROCA o conteúdo da aba atual — clicar em categoria/folder/board
      // altera a aba em uso (nome e ícone) em vez de abrir uma aba a mais.
      // Documento continua ganhando aba própria: quem abre outro item
      // quer compará-lo na lateral, e a aba atual (documento) não deve
      // sumir só por ter clicado num link.
      const ativa = atuais.find((t) => t.key === saindo)
      const paginaDestino = TITULOS_PADRAO[atual.kind] !== undefined
      if (ativa && paginaDestino && TITULOS_PADRAO[ativa.kind] !== undefined) {
        return atuais.map((t) => (t.key === ativa.key ? { ...atual, key: atual.key } : t))
      }
      return [...atuais, atual]
    })
    // `atual` é derivado de `activeKey`; incluí-lo só refaria o efeito a
    // cada render com um objeto novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, tipoNavegacao, pathAtual])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
    } catch {
      // Modo privado sem quota: perder a restauração é aceitável, quebrar
      // a navegação não.
    }
  }, [tabs])

  /** Atualiza título/estado de uma aba sem trocar o array à toa. */
  const patchTab = useCallback((key, changes) => {
    setTabs((atuais) => {
      const alvo = atuais.find((t) => t.key === key)
      if (!alvo) return atuais
      const mudou = Object.entries(changes).some(([campo, valor]) => alvo[campo] !== valor)
      if (!mudou) return atuais
      return atuais.map((t) => (t.key === key ? { ...t, ...changes } : t))
    })
  }, [])

  /** Para onde ir quando a aba fechada era a que estava aberta. */
  const irPara = useCallback(
    (restantes, indiceFechado) => {
      const vizinha = restantes[indiceFechado] ?? restantes[indiceFechado - 1]
      // Avisa o efeito de criação: navegar para cá é só preencher a tela,
      // não é uma visita que mereça aba nova.
      suprimirReaddicao.current = vizinha ? vizinha.path : '/'
      navigate(vizinha ? vizinha.path : '/', { replace: true })
    },
    [navigate],
  )

  const closeTab = useCallback(
    (key) => {
      const indice = tabs.findIndex((t) => t.key === key)
      if (indice === -1) return
      const restantes = tabs.filter((t) => t.key !== key)
      setTabs(restantes)
      // `activeKey` é null em rota não-abrível; fechar a aba em foco a
      // partir dali ainda precisa levar a tela para a vizinha, senão o
      // usuário fica olhando o conteúdo de uma aba que não existe mais.
      if (key === activeKey || (!activeKey && key === ultimaAtiva.current)) {
        irPara(restantes, indice)
      }
    },
    [tabs, activeKey, irPara],
  )

  const closeOthers = useCallback(
    (key) => {
      const alvo = tabs.find((t) => t.key === key)
      if (!alvo) return
      setTabs([alvo])
      if (activeKey !== key) navigate(alvo.path)
    },
    [tabs, activeKey, navigate],
  )

  const closeAll = useCallback(() => {
    setTabs([])
    suprimirReaddicao.current = '/'
    if (activeKey) navigate('/', { replace: true })
  }, [activeKey, navigate])

  /**
   * Abre uma SEGUNDA aba da mesma rota de página (dois "Início", duas
   * categorias iguais...). Documentos não passam por aqui: duas abas do
   * mesmo arquivo seriam dois autosaves brigando pelo mesmo JSON.
   *
   * A chave ganha um sufixo `~n` — a rota continua sendo a mesma para
   * o navegador, mas cada aba tem identidade própria na barra.
   */
  const duplicarAba = useCallback(
    (path) => {
      const desc = tabDe({ pathname: semQuery(path) })
      if (!desc) return
      const base = desc.key
      const maior = tabs.reduce((n, t) => {
        if (!t.key.startsWith(`${base}~`)) return n
        const sufixo = Number(t.key.slice(base.length + 1))
        return Number.isFinite(sufixo) && sufixo > n ? sufixo : n
      }, 0)
      const key = `${base}~${maior + 1}`
      setTabs((atuais) => [...atuais, { ...desc, key }])
      ultimaAtiva.current = key
    },
    [tabs],
  )

  const moveTab = useCallback((de, para) => {
    setTabs((atuais) => {
      if (de === para || de < 0 || para < 0 || de >= atuais.length) return atuais
      const copia = [...atuais]
      const [item] = copia.splice(de, 1)
      copia.splice(para, 0, item)
      return copia
    })
  }, [])

  /**
   * Aba que o usuário considera "a de agora", mesmo quando a rota atual
   * não é abrível (`/settings`, `/search`, uma rota com query que não
   * seja `/new`...). Nesses casos `activeKey` é null — a rota não casa
   * com aba nenhuma — e quem depende só dele fica sem alvo: era isso que
   * fazia o Ctrl+Q apenas piscar o realce e não fechar nada.
   */
  const chaveEmFoco = useMemo(() => {
    if (activeKey) return activeKey
    if (ultimaAtiva.current && tabs.some((t) => t.key === ultimaAtiva.current)) {
      return ultimaAtiva.current
    }
    return tabs.length ? tabs[tabs.length - 1].key : null
  }, [activeKey, tabs])

  const value = useMemo(
    () => ({
      tabs,
      activeKey,
      chaveEmFoco,
      ativar,
      patchTab,
      closeTab,
      closeOthers,
      closeAll,
      duplicarAba,
      moveTab,
    }),
    [
      tabs,
      activeKey,
      chaveEmFoco,
      ativar,
      patchTab,
      closeTab,
      closeOthers,
      closeAll,
      duplicarAba,
      moveTab,
    ],
  )

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>
}

export function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('useTabs precisa estar dentro de <TabsProvider>.')
  return ctx
}

/**
 * A página diz à sua aba como se chamar.
 *
 * A rota só carrega um id — quem sabe o nome do documento é quem o
 * carregou. Também é daqui que sai o título da janela, o que importa
 * quando uma aba é destacada e vira janela própria na barra de tarefas.
 */
export function useTabState({ title, dirty = false, enabled = true } = {}) {
  const { activeKey, patchTab, tabs } = useTabs()

  // Efeito de filho roda ANTES do efeito do pai, então na primeira vez a
  // aba desta rota ainda não existe e o `patchTab` cairia no vazio —
  // deixando, por exemplo, o ponto de "não salvo" aceso num documento
  // recém-criado. Depender da existência da aba faz o efeito voltar
  // assim que o pai a cria.
  const jaExiste = tabs.some((t) => t.key === activeKey)

  useEffect(() => {
    if (enabled && activeKey && jaExiste) {
      patchTab(activeKey, { title: title || 'Sem título', dirty: !!dirty })
    }
  }, [enabled, activeKey, jaExiste, title, dirty, patchTab])

  useEffect(() => {
    // `enabled: false` é o painel lateral do split: a aba e o título da
    // janela pertencem ao documento da esquerda, e deixar os dois lados
    // escrevendo neles faria o nome piscar entre um e outro.
    if (!enabled) return undefined
    document.title = title ? `${title} — Notefy` : 'Notefy'
    return () => {
      document.title = 'Notefy'
    }
  }, [enabled, title])
}

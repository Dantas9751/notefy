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
import { t } from '@/lib/i18n'
import { chaveDaConta } from '@/lib/conta'
import { guardarSessao, janelaDestacada, lerSessao } from '@/lib/sessao'
import { useAuth } from '@/context/AuthContext'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'

const TabsContext = createContext(null)

/** Por janela e por conta: cada janela tem o seu conjunto de abas, e outra conta não herda as desta. */
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
  [/^\/designs\/[^/]+$/, 'design'],
  [/^\/files\/[^/]+$/, 'file'],
  [/^\/$/, 'home'],
  [/^\/categories\/[^/]+$/, 'category'],
  [/^\/folders\/[^/]+$/, 'folder'],
  [/^\/board$/, 'board'],
  [/^\/calendar$/, 'calendar'],
  [/^\/recent$/, 'recent'],
  [/^\/trash$/, 'trash'],
  [/^\/roadmap$/, 'roadmap'],
  // Arquivos e Modelos são páginas do menu como Recentes e Lixeira: sem
  // aba, a barra ficava sem nenhuma aba marcada enquanto se usava a tela.
  [/^\/files$/, 'files'],
  [/^\/templates$/, 'templates'],
]

/**
 * Título padrão da aba de uma página — a página depois o corrige com o
 * nome real (categoria "Matemática", pasta "Projeto X"). Documento não
 * tem título aqui: quem o conhece é quem carregou o conteúdo.
 */
const TITULOS_PADRAO = {
  get home() { return t('Início') },
  get category() { return t('Categoria') },
  get folder() { return t('Pasta') },
  get board() { return t('Quadro') },
  get calendar() { return t('Calendário') },
  get recent() { return t('Recentes') },
  get trash() { return t('Lixeira') },
  get roadmap() { return t('Roadmap') },
  get files() { return t('Arquivos') },
  get templates() { return t('Modelos') },
}

/** Rotas de passagem: não viram aba, mas dão nome à janela (na barra de tarefas, "Notefy" sozinho não diz onde se está). */
const TITULOS_SEM_ABA = [
  [/^\/search/, () => t('Buscar')],
  [/^\/settings/, () => t('Configurações')],
]

/** Páginas cujo título é sempre o padrão (categoria e pasta levam o nome delas). */
const TITULOS_FIXOS = new Set(['home', 'board', 'calendar', 'recent', 'trash', 'roadmap', 'files', 'templates'])

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

/**
 * O título das páginas fixas é refeito na leitura: as abas sobrevivem à troca
 * de idioma, e "Início" guardado precisa virar "Home".
 */
const noIdiomaAtual = (abas) =>
  abas.map((aba) => (TITULOS_FIXOS.has(aba.kind) ? { ...aba, title: TITULOS_PADRAO[aba.kind] } : aba))

function abasDaJanela(chave) {
  try {
    const bruto = chave && sessionStorage.getItem(chave)
    const lido = bruto ? JSON.parse(bruto) : []
    return Array.isArray(lido) ? noIdiomaAtual(lido) : []
  } catch {
    return []
  }
}

export function TabsProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const tipoNavegacao = useNavigationType()
  const { user } = useAuth()
  // A conta não muda com o provedor montado: entrar com outra desmonta tudo.
  const [chave] = useState(() => chaveDaConta(STORAGE_KEY))

  // "Onde parei" (Tela inicial): o app abrindo, sem abas nesta janela, reabre
  // as da última sessão e vai para a que estava em foco (`destino`).
  const [inicio] = useState(() => {
    const daJanela = abasDaJanela(chave)
    const continuar =
      !daJanela.length && location.pathname === '/' && user?.preferences?.default_view === 'last' && !janelaDestacada()
    const sessao = continuar ? lerSessao() : null
    return sessao ? { abas: noIdiomaAtual(sessao.abas), destino: sessao.ativa } : { abas: daJanela, destino: null }
  })
  const [tabs, setTabs] = useState(inicio.abas)
  //: A aba para onde a sessão reaberta vai; some quando a rota chega lá.
  const destinoRef = useRef(inicio.destino)

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
      // Sessão reaberta: a rota de partida (`/`) não vira aba. O caminho até
      // o destino é só passagem.
      if (destinoRef.current) {
        if (atual?.path === destinoRef.current.path) destinoRef.current = null
        return atuais
      }

      // Nunca zero abas: a tela sempre mostra alguma rota, e ela precisa de
      // uma aba que a represente. Cobre a primeira abertura (o login chega
      // aqui por `replace`, que o resto do efeito ignora) e o fechamento da
      // última aba, que volta ao Início e o reabre como aba.
      if (atuais.length === 0 && atual) {
        suprimirReaddicao.current = null
        return [atual]
      }

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
    const destino = destinoRef.current
    if (!destino) return
    ultimaAtiva.current = destino.key
    navigate(destino.path, { replace: true })
  }, [navigate])

  useEffect(() => {
    try {
      if (chave) sessionStorage.setItem(chave, JSON.stringify(tabs))
    } catch {
      // Modo privado sem quota: perder a restauração é aceitável, quebrar
      // a navegação não.
    }
  }, [tabs])

  // O ícone trocado num item vale também para a aba dele que não está à
  // mostra: quem atualiza a aba ativa é a página (`useTabState`).
  useListenerDeJanela('notefy:icone', (evento) => {
    const { id, icon } = evento.detail ?? {}
    if (!id) return
    setTabs((atuais) =>
      atuais.some((aba) => semQuery(aba.path).endsWith(`/${id}`))
        ? atuais.map((aba) => (semQuery(aba.path).endsWith(`/${id}`) ? { ...aba, icone: icon } : aba))
        : atuais,
    )
  })

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
    // "Fechar todas" deixa só o Início, como o navegador deixa a página
    // nova: zero abas não existe.
    setTabs([tabDe({ pathname: '/' })])
    ultimaAtiva.current = null
    navigate('/', { replace: true })
  }, [navigate])

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

  // Sempre, e não só com "Onde parei" ligado: quem liga depois já encontra a sessão anterior.
  useEffect(() => {
    guardarSessao(tabs, chaveEmFoco)
  }, [tabs, chaveEmFoco])

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

  // O título da janela é o da aba ativa — documento ou página (Quadro,
  // Recentes...). Era só o documento que o escrevia, e as páginas deixavam
  // "Notefy": numa aba destacada como janela, a barra de tarefas não dizia
  // qual era qual.
  const tituloAtivo = activeKey
    ? tabs.find((aba) => aba.key === activeKey)?.title
    : TITULOS_SEM_ABA.find(([rota]) => rota.test(location.pathname))?.[1]()
  useEffect(() => {
    document.title = tituloAtivo ? `${tituloAtivo} — Notefy` : 'Notefy'
  }, [tituloAtivo])

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
export function useTabState({ title, dirty = false, enabled = true, icone } = {}) {
  const { activeKey, patchTab, tabs } = useTabs()

  // Efeito de filho roda ANTES do efeito do pai, então na primeira vez a
  // aba desta rota ainda não existe e o `patchTab` cairia no vazio —
  // deixando, por exemplo, o ponto de "não salvo" aceso num documento
  // recém-criado. Depender da existência da aba faz o efeito voltar
  // assim que o pai a cria.
  const jaExiste = tabs.some((t) => t.key === activeKey)

  // `title` indefinido é "ainda não sei": a aba guarda o nome que tinha.
  // A página reaproveitada entre dois documentos ainda segura o anterior
  // enquanto o novo carrega — e, se o novo foi para a lixeira, para
  // sempre: a aba dele ganhava o nome do item aberto antes.
  // `icone` segue a mesma regra: indefinido mantém o que a aba já mostra.
  useEffect(() => {
    if (enabled && activeKey && jaExiste) {
      patchTab(activeKey, {
        dirty: !!dirty,
        ...(title !== undefined && { title: title || t('Sem título') }),
        ...(icone !== undefined && { icone }),
      })
    }
  }, [enabled, activeKey, jaExiste, title, dirty, icone, patchTab])

  // O título da janela sai da aba ativa (no `TabsProvider`). `enabled:
  // false` é o painel lateral do split: a aba pertence ao documento da
  // esquerda, e o painel não escreve nela.
}

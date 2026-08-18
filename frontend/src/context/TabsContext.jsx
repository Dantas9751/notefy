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

const TabsContext = createContext(null)

/** Por janela, não por usuário: cada janela tem o seu conjunto de abas. */
const STORAGE_KEY = 'notefy.tabs'

/**
 * Rotas que viram aba — só o que se ABRE e EDITA.
 *
 * Pasta e categoria ficaram de fora de propósito: elas já estão na
 * sidebar, que é permanente e sempre visível. Transformá-las em aba
 * duplicaria a árvore e encheria a barra de lugares por onde o usuário só
 * passou. Aba aqui quer dizer "documento aberto", como no VS Code.
 */
const ABRIVEIS = [
  [/^\/notes\/[^/]+$/, 'note'],
  [/^\/sheets\/[^/]+$/, 'spreadsheet'],
  [/^\/diagrams\/[^/]+$/, 'diagram'],
  [/^\/canvas\/[^/]+$/, 'canvas'],
  [/^\/files\/[^/]+$/, 'file'],
]

/** Descreve a aba de uma rota, ou `null` se a rota não é abrível. */
export function tabDe(location) {
  const par = ABRIVEIS.find(([re]) => re.test(location.pathname))
  if (!par) return null

  // Dois `/notes/new` em pastas diferentes são documentos diferentes; o
  // caminho sozinho os fundiria numa aba só.
  const key = location.pathname.endsWith('/new')
    ? location.pathname + location.search
    : location.pathname

  return { key, path: key, kind: par[1] }
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
  const activeKey = atual?.key ?? null

  // Qual aba estava ativa antes desta navegação. É o que permite tratar o
  // `replace` como "mesma vaga" logo abaixo.
  const anterior = useRef(activeKey)

  useEffect(() => {
    const saindo = anterior.current
    anterior.current = activeKey

    setTabs((atuais) => {
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

      if (!atual || atuais.some((t) => t.key === atual.key)) return atuais
      return [...atuais, atual]
    })
    // `atual` é derivado de `activeKey`; incluí-lo só refaria o efeito a
    // cada render com um objeto novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, tipoNavegacao])

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
      if (key === activeKey) irPara(restantes, indice)
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
    if (activeKey) navigate('/', { replace: true })
  }, [activeKey, navigate])

  const moveTab = useCallback((de, para) => {
    setTabs((atuais) => {
      if (de === para || de < 0 || para < 0 || de >= atuais.length) return atuais
      const copia = [...atuais]
      const [item] = copia.splice(de, 1)
      copia.splice(para, 0, item)
      return copia
    })
  }, [])

  const value = useMemo(
    () => ({ tabs, activeKey, patchTab, closeTab, closeOthers, closeAll, moveTab }),
    [tabs, activeKey, patchTab, closeTab, closeOthers, closeAll, moveTab],
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
export function useTabState({ title, dirty = false } = {}) {
  const { activeKey, patchTab, tabs } = useTabs()

  // Efeito de filho roda ANTES do efeito do pai, então na primeira vez a
  // aba desta rota ainda não existe e o `patchTab` cairia no vazio —
  // deixando, por exemplo, o ponto de "não salvo" aceso num documento
  // recém-criado. Depender da existência da aba faz o efeito voltar
  // assim que o pai a cria.
  const jaExiste = tabs.some((t) => t.key === activeKey)

  useEffect(() => {
    if (activeKey && jaExiste) {
      patchTab(activeKey, { title: title || 'Sem título', dirty: !!dirty })
    }
  }, [activeKey, jaExiste, title, dirty, patchTab])

  useEffect(() => {
    document.title = title ? `${title} — Notefy` : 'Notefy'
    return () => {
      document.title = 'Notefy'
    }
  }, [title])
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PADRAO, limitar } from '@/lib/split'

const SplitContext = createContext(null)

/** Por janela, como as abas: cada janela tem o seu arranjo de painéis. */
const STORAGE_KEY = 'notefy.split'

/** Rota sem query string: `/notes/new?folder=X` vira `/notes/new`. */
export const semQuery = (rota) => rota.split('?')[0]

/**
 * O painel lateral do "abrir ao lado".
 *
 * Guarda `{ path, title, sessao }` — qualquer rota do app, não só
 * documentos. O path é SEMPRE normalizado sem query string: a query só
 * distingue documentos `/new` entre pastas, e esses não vão ao painel
 * de jeito nenhum. Com a query fora, a comparação "painel mostra a
 * mesma rota que a esquerda?" deixa de depender de `location.search`,
 * que o React Router não expõe junto com `pathname` de forma
 * confiável.
 *
 * `sessao` identifica a viagem de navegação do painel: cada "abrir ao
 * lado" aponta para uma rota nova e incrementa o número, o que faz o
 * conteúdo do painel REMONTAR no endereço pedido. Navegação DENTRO do
 * painel não remonta — só troca o path, a sessão fica.
 *
 * `historico` é a pilha de caminhos por onde o painel passou (sempre
 * terminando no path atual). É o que alimenta a seta de voltar: navegar
 * dentro do painel empilha, e voltar desempilha.
 */
export function SplitProvider({ children }) {
  const location = useLocation()
  const [painel, setPainel] = useState(() => {
    try {
      const bruto = sessionStorage.getItem(STORAGE_KEY)
      if (!bruto) return null
      const lido = JSON.parse(bruto)
      // Sessões antigas podem ter guardado `{ id, kind }` em vez de
      // `{ path, title }` — sem path não há o que renderizar. Painéis
      // apontando para `/new` também são lixo: documento que ainda não
      // existe no servidor.
      if (!lido || typeof lido.path !== 'string') return null
      const path = semQuery(lido.path)
      if (path.endsWith('/new')) return null
      // Sessões antigas não têm histórico; a lista sempre termina no path
      // atual, então forçamos isso aqui também.
      const historico = (Array.isArray(lido.historico) ? lido.historico : []).map(semQuery)
      if (historico[historico.length - 1] !== path) historico.push(path)
      return { ...lido, path, historico, sessao: lido.sessao ?? Date.now() }
    } catch {
      return null
    }
  })

  const [divisao, setDivisao] = useState(PADRAO)

  const persistir = useCallback((proximo) => {
    setPainel(proximo)
    try {
      if (proximo) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(proximo))
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Modo privado sem quota.
    }
  }, [])

  /**
   * Abre qualquer rota no painel lateral.
   *
   * Aceita `{ path, title }` (rota direta, ex: `/folders/123`) ou o
   * formato `{ id, kind, title }` legado dos documentos. Ignora:
   *  - rotas `/new` de tipos não-criáveis — documento ainda não existe
   *    no servidor, não há o que carregar, e o painel travava num
   *    spinner infinito buscando `/documents/new/`;
   *  - a rota que já está aberta à esquerda — dois lados do mesmo item
   *    são dois autosaves brigando pelo mesmo JSON.
   *
   * Rotas de CRIAÇÃO (`/notes/new?folder=...`) são aceitas COM a query:
   * o painel renderiza o editor em modo de criação e a pasta de destino
   * viaja nela.
   */
  const abrirAoLado = useCallback(
    (alvo) => {
      if (!alvo) return

      // Monta a path se só veio id+kind.
      let bruto = alvo.path
      if (!bruto && alvo.id) {
        const prefixo =
          alvo.kind === 'spreadsheet' ? 'sheets'
          : alvo.kind === 'diagram' ? 'diagrams'
          : alvo.kind === 'canvas' ? 'canvas'
          : alvo.kind === 'note' ? 'notes'
          : 'files'
        bruto = `/${prefixo}/${alvo.id}`
      }

      // Rotas de criação guardam a query (o `?folder=`); as demais não.
      const eCriacao = /^\/(notes|sheets|diagrams|canvas)\/new($|\?)/.test(bruto ?? '')
      const path = eCriacao ? bruto : semQuery(bruto ?? '')
      if (!path) return
      // `/new` de outro tipo não existe no painel — mandar "new" gera um
      // 404 que trava a tela num spinner infinito.
      if (!eCriacao && path.endsWith('/new')) return

      // Mesma rota nos dois lados é permitido: o usuário clica em "Abrir
      // ao lado" no item que já está aberto à esquerda justamente para
      // comparar/ver os dois lados. Quem cuida de não deixar os dois lados
      // brigando é o fechamento quando a ESQUERDA navega até a rota do
      // painel (efeito `fecharAoNavegarEsquerda`), não um bloqueio cego
      // aqui que deixava o botão mudo.

      // Sessão nova: o conteúdo do painel remonta na rota pedida e o
      // histórico da viagem anterior é descartado.
      persistir({
        path,
        title: alvo.title ?? alvo.name ?? null,
        historico: [path],
        sessao: (painel?.sessao ?? 0) + 1,
      })
    },
    [painel, persistir],
  )

  // O painel fica visível sempre que existe — não derivamos mais de
  // "path diferente do da esquerda", porque abrir o item atual ao lado é
  // um caso legítimo. O fechamento acontece num efeito abaixo, só quando a
  // ESQUERDA navega até a rota que o painel já mostra.
  const painelVisivel = painel

  const fecharPainel = useCallback(() => {
    persistir(null)
    setDivisao(PADRAO)
  }, [persistir])

  // Rota da ESQUERDA na renderização anterior. Usada para distinguir
  // "a esquerda navegou até o painel" de "o painel foi aberto no mesmo
  // path da esquerda" (caso que queremos manter aberto).
  const esquerdaAntes = useRef(location.pathname)
  useEffect(() => {
    // Chegou na rota que o painel exibia: fecha de vez — dois lados do
    // mesmo item seriam dois autosaves brigando pelo mesmo JSON. Só fecha
    // quando a ESQUERDA de fato navegou; se o painel foi aberto no path
    // atual (abrir o item da esquerda ao lado), `esquerdaAntes` é igual e
    // ele permanece.
    if (painel && painel.path === location.pathname && location.pathname !== esquerdaAntes.current) {
      fecharPainel()
    }
    esquerdaAntes.current = location.pathname
  }, [location.pathname, painel?.path, fecharPainel])

  /**
   * O painel navegou sozinho (clique numa pasta, numa categoria...).
   * O conteúdo do painel é renderizado direto do `painel.path`; este é
   * o caminho de volta para o resto do app: o path do painel acompanha,
   * e a aba-tabuada e o auto-fechamento continuam certos.
   *
   * A sessão NÃO muda aqui: remontar o conteúdo a cada clique apagaria
   * o histórico de navegação do próprio painel.
   */
  const registrarPathPainel = useCallback(
    (path) => {
      // Rotas de criação guardam a query (o `?folder=`); as demais não.
      const eCriacao = /^\/(notes|sheets|diagrams|canvas)\/new($|\?)/.test(path ?? '')
      const p = eCriacao ? path : semQuery(path)
      // `/new` de outro tipo não existe no painel — o path guardado não
      // pode virar lixo de `/new`.
      if (!p || (!eCriacao && p.endsWith('/new'))) return
      if (!painel || p === painel.path) return

      // Chegou na rota que a esquerda já mostra: fecha o painel de vez —
      // dois lados do mesmo item são dois autosaves brigando pelo JSON.
      if (p === location.pathname) {
        fecharPainel()
        return
      }

      // O histórico termina no path atual por invariante, então empilhar
      // a rota nova estende a viagem sem duplicar nada.
      persistir({ ...painel, path: p, historico: [...painel.historico, p] })
    },
    [painel, location.pathname, persistir, fecharPainel],
  )

  /**
   * Seta de voltar do painel: desempilha o histórico e mostra a rota
   * anterior da viagem. Se o destino for a rota que a esquerda já exibe,
   * vale a mesma regra de sempre — dois lados do mesmo item se fecham.
   */
  const voltarPainel = useCallback(() => {
    if (!painel || painel.historico.length <= 1) return
    const historico = painel.historico.slice(0, -1)
    const path = historico[historico.length - 1]
    if (path === location.pathname) {
      fecharPainel()
      return
    }
    persistir({ ...painel, path, historico })
  }, [painel, location.pathname, persistir, fecharPainel])

  const moverDivisoria = useCallback((porcentagem) => {
    setDivisao(limitar(porcentagem))
  }, [])

  const value = useMemo(
    () => ({
      painel: painelVisivel,
      divisao,
      abrirAoLado,
      fecharPainel,
      registrarPathPainel,
      voltarPainel,
      podeVoltar: !!(painelVisivel && painelVisivel.historico.length > 1),
      moverDivisoria,
    }),
    [
      painelVisivel,
      divisao,
      abrirAoLado,
      fecharPainel,
      registrarPathPainel,
      voltarPainel,
      moverDivisoria,
    ],
  )

  return <SplitContext.Provider value={value}>{children}</SplitContext.Provider>
}

export function useSplit() {
  const ctx = useContext(SplitContext)
  if (!ctx) throw new Error('useSplit precisa estar dentro de <SplitProvider>.')
  return ctx
}
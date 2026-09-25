import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom'
import { useSplit } from '@/context/SplitContext'
import { MAX, MIN, PADRAO, porcentagemDoPonteiro } from '@/lib/split'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import PanelErrorBoundary from '@/components/layout/PanelErrorBoundary'

/**
 * Páginas carregadas sob demanda: o bundle do painel puxa só o que a
 * rota atual pede, e o `Spinner` dá feedback enquanto o chunk chega.
 */
const Home = lazy(() => import('@/pages/Home'))
const DocumentEditor = lazy(() => import('@/pages/DocumentEditor'))
const FileViewer = lazy(() => import('@/pages/FileViewer'))
const CategoryDetail = lazy(() => import('@/pages/CategoryDetail'))
const FolderDetail = lazy(() => import('@/pages/FolderDetail'))
const Recent = lazy(() => import('@/pages/Recent'))
const Board = lazy(() => import('@/pages/Board'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const Trash = lazy(() => import('@/pages/Trash'))
const Roadmap = lazy(() => import('@/pages/Roadmap'))

const CARREGANDO = (
  <div className="flex h-64 items-center justify-center">
    <Spinner size={18} />
  </div>
)

/** `notes` → `note`, `sheets` → `spreadsheet`, e por aí vai. */
const KIND_POR_ROTA = {
  notes: 'note',
  sheets: 'spreadsheet',
  diagrams: 'diagram',
  canvas: 'canvas',
}

/** Páginas fixas que o painel sabe renderizar além de `Início`. */
const PAGINAS_FIXAS = [
  ['/recent', Recent],
  ['/board', Board],
  ['/calendar', Calendar],
  ['/trash', Trash],
  ['/roadmap', Roadmap],
]

function ForaDoPainel({ path }) {
  // Última linha de defesa para sessões antigas: `/new` não tem o que
  // buscar no servidor, e o fetch de um id inexistente deixava o painel
  // num spinner infinito.
  if (path.endsWith('/new')) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-ink-400">
        Documento ainda não salvo. Abra ao lado depois de salvar.
      </div>
    )
  }
  return (
    <div className="flex h-64 items-center justify-center text-sm text-ink-400">
      Rota não suportada no painel lateral.
    </div>
  )
}

/**
 * Escolhe a página do painel a partir do path.
 *
 * O id vai por PROP — é isso que mantém `emPainel = true`: a página sabe
 * que está no segundo painel e não escreve na aba nem no título da
 * janela, que pertencem à esquerda.
 *
 * Rotas de criação (`/notes/new?folder=...`) também vivem no painel: a
 * pasta de destino viaja na query e o editor abre em modo de criação sem
 * tocar na rota da esquerda.
 */
function paginaDoPainel(path) {
  const [semQuery, query] = path.split('?')
  const partes = semQuery.split('/').filter(Boolean)
  const [raiz, id] = partes

  if (!raiz) return <Home />
  for (const [rota, Pagina] of PAGINAS_FIXAS) {
    if (semQuery === rota) return <Pagina />
  }
  if (KIND_POR_ROTA[raiz]) {
    if (id === 'new') {
      const folder = new URLSearchParams(query ?? '').get('folder')
      return <DocumentEditor kind={KIND_POR_ROTA[raiz]} mode="create" folderId={folder} emPainel />
    }
    return <DocumentEditor kind={KIND_POR_ROTA[raiz]} id={id} emPainel />
  }
  if (raiz === 'categories') return <CategoryDetail id={id} />
  if (raiz === 'folders') return <FolderDetail id={id} />
  if (raiz === 'files') return <FileViewer id={id} />
  return <ForaDoPainel path={path} />
}

/**
 * O conteúdo do painel — uma segunda instância do app SEM um segundo
 * router.
 *
 * O React Router v6 proíbe `<Router>` dentro de `<Router>` (a tentativa
 * com `MemoryRouter` derrubava o app inteiro com "You cannot render a
 * <Router> inside another <Router>"). Em vez disso, o painel é só o
 * `SplitContext` renderizando a página do path atual, e a NAVEGAÇÃO
 * interna é capturada pelo `NavigationContext`:
 *
 * - `useNavigate()`/`<Link>` dentro do painel caem no `navegador` abaixo,
 *   que chama `registrarPathPainel` — o painel troca de página e a
 *   esquerda nem percebe (era o contrário disso que empilhava abas antes);
 * - a rota da ESQUERDA continua sendo a única do `BrowserRouter`.
 *
 * `key={painel.sessao}` remonta o conteúdo sempre que o painel é apontado
 * para uma rota nova ("abrir ao lado" de outro item) — navegação DENTRO
 * do painel não muda a sessão e não remonta.
 */
function ConteudoDoPainel({ painel }) {
  const { registrarPathPainel, voltarPainel, podeVoltar, fecharPainel } = useSplit()

  const contextoDeNavegacao = useMemo(() => {
    const rotaDe = (alvo) => {
      if (typeof alvo === 'string') return alvo
      return `${alvo?.pathname ?? ''}${alvo?.search ?? ''}`
    }
    const navegador = {
      // Toda navegação do painel é interna — inclusive `/new?folder=`,
      // que o SplitContext agora aceita para o editor criar DENTRO do
      // painel, sem encostar na rota da esquerda.
      push: (alvo) => registrarPathPainel(rotaDe(alvo)),
      replace: (alvo) => registrarPathPainel(rotaDe(alvo)),
      // `navigate(-1)` dos botões de voltar das próprias páginas cai aqui:
      // sem isto, a setinha de cada página do painel não fazia nada.
      go: (delta) => {
        if (delta >= 0) return
        // Tem viagem interna: desempilha a do painel.
        if (podeVoltar) {
          voltarPainel()
          return
        }
        // Painel aberto direto no item (sem viagem interna): a seta
        // devolve para o lugar anterior do usuário, que é o histórico
        // do NAVEGADOR — a esquerda não se mexeu quando o painel foi
        // aberto, então o topo dele é a pasta/categoria de onde o item
        // saiu. Sem histórico algum, "voltar" é fechar o painel.
        if ((window.history.state?.idx ?? 0) > 0) {
          window.history.back()
        } else {
          fecharPainel()
        }
      },
      createHref: (alvo) => rotaDe(alvo),
    }
    // `future` é lido pelo `useNavigate` do router global (flag
    // v7_relativeSplatPath) — sem ele o painel estouraria. E `static`
    // tem que ser `false`: com `true`, o react-router desliga o efeito
    // que liga o `activeRef` do `useNavigate`, e todo clique vira um
    // `navigate` que retorna em silêncio sem navegar nada.
    return { basename: '/', navigator: navegador, static: false, future: {} }
  }, [registrarPathPainel, voltarPainel, podeVoltar, fecharPainel])

  return (
    <NavigationContext.Provider value={contextoDeNavegacao} key={painel.sessao}>
      <Suspense fallback={CARREGANDO}>{paginaDoPainel(painel.path)}</Suspense>
    </NavigationContext.Provider>
  )
}

/**
 * Divide a área central em dois, com uma divisória arrastável.
 *
 * Quando não há painel aberto devolve os filhos crus — sem envoltório,
 * sem custo. Com painel, cada lado ocupa a sua fração.
 *
 * Sem barra própria: os dois lados renderizam as MESMAS páginas, e o
 * voltar/breadcrumb vem do header de cada página — uma barra só no
 * painel desalinhava as telas e duplicava o voltar.
 */
export default function SplitPane({ children }) {
  const { painel, divisao, moverDivisoria } = useSplit()
  const containerRef = useRef(null)
  const [arrastando, setArrastando] = useState(false)

  const aoMover = useCallback(
    (event) => {
      const caixa = containerRef.current?.getBoundingClientRect()
      if (!caixa) return
      moverDivisoria(porcentagemDoPonteiro(event.clientX, caixa.left, caixa.width))
    },
    [moverDivisoria],
  )

  useEffect(() => {
    if (!arrastando) return undefined

    const soltar = () => setArrastando(false)
    window.addEventListener('pointermove', aoMover)
    window.addEventListener('pointerup', soltar)

    const anterior = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      window.removeEventListener('pointermove', aoMover)
      window.removeEventListener('pointerup', soltar)
      document.body.style.userSelect = anterior
      document.body.style.cursor = ''
    }
  }, [arrastando, aoMover])

  if (!painel) return children

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div
        className="flex min-w-0 shrink-0 overflow-hidden"
        style={{ width: `${divisao}%` }}
      >
        {children}
      </div>

      <div
        role="separator"
        aria-label="Ajustar divisão dos painéis"
        aria-orientation="vertical"
        aria-valuenow={Math.round(divisao)}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          setArrastando(true)
        }}
        onDoubleClick={() => moverDivisoria(PADRAO)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') moverDivisoria(divisao - 2)
          if (event.key === 'ArrowRight') moverDivisoria(divisao + 2)
        }}
        title="Arraste para ajustar. Duplo clique volta ao meio."
        className={cn(
          'group relative w-1.5 shrink-0 cursor-col-resize bg-ink-200 transition dark:bg-ink-800',
          'hover:bg-accent-400 focus:outline-none focus-visible:bg-accent-500',
          arrastando && 'bg-accent-500',
        )}
      >
        <span className="absolute inset-y-0 -left-1 -right-1" aria-hidden />
      </div>

      {/* `data-painel`: quem estiver acima na árvore (o menu de contexto
          global do AppLayout, por exemplo) precisa saber que o clique
          nasceu AQUI, e não na esquerda — a rota do React Router é uma só
          para os dois lados. */}
      <div
        data-painel=""
        className="flex min-w-0 shrink-0 flex-col overflow-hidden"
        style={{ width: `${100 - divisao}%` }}
      >
        <div className="min-w-0 flex-1 overflow-auto">
          <PanelErrorBoundary>
            <ConteudoDoPainel painel={painel} />
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  )
}
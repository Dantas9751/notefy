import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Paperclip,
  Settings2,
  Star,
  Trash2,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import useEmEstudo from '@/hooks/useEmEstudo'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useTabState, useTabs } from '@/context/TabsContext'
import { useSplit } from '@/context/SplitContext'
import {
  Badge,
  Button,
  ErrorState,
  Modal,
  Spinner,
} from '@/components/ui'
import NoteEditor from '@/components/editors/NoteEditor'
import SpreadsheetEditor from '@/components/editors/SpreadsheetEditor'
import GraphEditor from '@/components/editors/GraphEditor'
import DocumentMetaModal from '@/components/modals/DocumentMetaModal'
import DestinationModal from '@/components/modals/DestinationModal'
import ExportMenu from '@/components/ExportMenu'
import { baixarArquivoNoClique } from '@/components/FilePreview'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { useAcoesIA, AvisoIA } from '@/components/ai/useAcoesIA'
import { runIA } from '@/lib/ai'
import { copiarTexto, idDeInstancia } from '@/lib/desktop'
import { escaparTexto } from '@/lib/sanitizar'
import { DOCUMENT_STATUS, kindMeta } from '@/lib/documents'
import {
  criar,
  empilhar,
  desfazer,
  refazer,
  podeDesfazer,
  podeRefazer,
} from '@/lib/history'
import { cn, formatBytes, formatRelative } from '@/lib/utils'

const AUTOSAVE_MS = 1500

/** Corpo do POST/PATCH de um documento.

    Fora do componente porque o flush de saída manda o mesmo corpo sem
    passar por `persist` — dois construtores acabariam divergindo, e o
    que diverge aqui é o que o servidor grava. */
function corpoDoDocumento(payload) {
  return {
    kind: payload.kind,
    title: payload.title?.trim() || 'Sem título',
    status: payload.status,
    color: payload.color ?? '',
    folder: payload.folder,
    is_favorite: payload.is_favorite ?? false,
    // Só entra quando é uma lista de verdade. `undefined` faz o axios
    // omitir o campo e o PATCH preserva o que está gravado; mandar `[]`
    // por engano — num payload que não carrega etiquetas — apagaria
    // todas as do documento.
    ...(Array.isArray(payload.categories) ? { categories: payload.categories } : {}),
    // A nota também vive no `data` desde que virou seções; `content`
    // segue no payload apenas para não zerar o que notas antigas
    // ainda guardam ali.
    data: payload.data ?? {},
    ...(payload.kind === 'note'
      ? { content: payload.content ?? '', content_format: 'html' }
      : {}),
  }
}

/**
 * Editor único para todos os tipos de documento.
 *
 * A casca — título, breadcrumb, salvar, propriedades, anexos, excluir — é
 * a mesma para nota, planilha, diagrama e canvas; só o miolo troca. Foi
 * assim que "um lugar para cada" não virou quatro telas com mecânicas
 * diferentes: o usuário reaprende nada ao mudar de tipo.
 */
export default function DocumentEditor({ mode, kind: routeKind, id: idProp, folderId: folderIdProp, emPainel: emPainelProp }) {
  const params = useParams()
  // `idProp` vence a rota: no painel da direita do split o React Router
  // continua apontando para o documento da ESQUERDA — há uma location só
  // para os dois painéis. Quem abre o segundo passa o id por prop.
  const id = idProp ?? params.id
  const emPainel = emPainelProp ?? !!idProp

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refresh: refreshTree } = useWorkspace()
  const { closeTab, activeKey } = useTabs()
  const { fecharPainel } = useSplit()

  const isCreate = mode === 'create'
  // Pasta de destino da criação: a prop vence a query — no painel a query
  // é a da ESQUERDA, e a pasta certa viaja na prop.
  const folderParaCriar = folderIdProp ?? searchParams.get('folder')
  const { data, loading, error, errorStatus, refetch, setData } = useFetch(
    `/documents/${id}/`,
    { enabled: !isCreate, deps: [id] },
  )

  const [doc, setDoc] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // Identidade desta instância do editor. O aviso de "documento salvo" é
  // global (dois editores do mesmo doc precisam se ver), mas quem salvou
  // NÃO pode se recarregar: o refetch liga o `loading`, o editor troca de
  // lugar com o spinner e o GraphEditor remonta — a ferramenta escolhida
  // voltava para "Selecionar" sozinha e a pilha de desfazer zerava a cada
  // autosave. Era isso que fazia o Ctrl+Z parecer preso ao relógio.
  // String e não `Symbol`: hoje `notefy:saved:<id>` não atravessa a ponte
  // entre janelas, mas no dia em que atravessar o símbolo derrubaria o
  // `postMessage` — foi exatamente o que acontecia no quadro.
  const instanciaRef = useRef(idDeInstancia())
  // Contador de edições locais. Serve para saber se o usuário mexeu no
  // documento ENQUANTO o PATCH do autosave estava no ar: nesse caso a
  // resposta do servidor está velha e adotá-la apagaria os traços feitos
  // no meio do caminho.
  const edicoesRef = useRef(0)
  const [savedAt, setSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [showMeta, setShowMeta] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const autosaveRef = useRef(null)
  // Payload do autosave agendado. Existe para o flush de saída poder
  // mandá-lo — sem isto, sair dentro da janela do debounce descartava
  // a última edição.
  const pendenteRef = useRef(null)

  // ----------------------------------------------------------------
  // Histórico de desfazer / refazer
  //
  // A pilha vive inteira numa ref, e não em estado: mexer nela não
  // precisa repintar nada. Quem muda a tela é o `setDoc` do desfazer;
  // a pilha em si ninguém desenha — não há botão de undo cuja aparência
  // dependa de "tem passo disponível?".
  //
  // O truque que mantém o desfazer por GESTO e não por quadro: `patch()`
  // atualiza o documento e agenda o autosave, mas NÃO empilha. Quem
  // empilha é o GraphEditor, chamando `onCommit` ao soltar o ponteiro ou
  // ao fechar um traço. Assim um arraste inteiro gasta um passo, e não
  // sessenta.
  //
  // O `onCommit` recebe o ESTADO FINAL do gesto quando o último update
  // acontece no mesmo instante (desenhar um traço, criar uma forma):
  // ler `docRef.current` nessa hora devolveria o estado ANTERIOR — o
  // React ainda não re-renderizou — e o desfazer comia dois gestos de
  // uma vez. Quando não há estado (borracha, arraste), o renderizado já
  // é o final e o fallback resolve.
  // ----------------------------------------------------------------
  const historyRef = useRef(null)
  const docRef = useRef(doc)
  docRef.current = doc

  // Garante que a pilha existe mesmo antes do primeiro commit.
  useEffect(() => {
    if (doc && !historyRef.current) {
      historyRef.current = criar(doc)
    }
  }, [doc])

  // Zera ao trocar de documento: desfazer no canvas B não pode trazer de
  // volta um traço do canvas A.
  const prevIdRef = useRef(id)
  useEffect(() => {
    if (prevIdRef.current !== id) {
      prevIdRef.current = id
      historyRef.current = null
    }
  }, [id])

  /** Grava o estado atual no topo da pilha. Chamar no fim do gesto.
      `estado` é só o `data` do quadro quando o último update do gesto
      acontece junto do commit — os demais campos do documento vêm do
      renderizado, que está correto para eles. */
  const commitHistory = useCallback((estado) => {
    const atual = estado ? { ...docRef.current, data: estado } : docRef.current
    if (!atual) return
    if (!historyRef.current) {
      historyRef.current = criar(atual)
      return
    }
    historyRef.current = empilhar(historyRef.current, atual)
  }, [])

  const kind = doc?.kind ?? routeKind ?? 'note'
  const meta = kindMeta(kind)

  // A rota carrega um id; quem sabe o nome é quem carregou o documento.
  // `dirty` vira o ponto de "não salvo" na aba — o que dá ao usuário o
  // aviso que ele perdeu ao parar de olhar para esta tela.
  //
  // No painel lateral fica desligado: a aba ativa pertence ao documento
  // da esquerda, e deixar os dois escrevendo nela faria o título piscar
  // entre um e outro a cada tecla digitada em qualquer um dos lados.
  useTabState({ title: doc?.title, dirty, enabled: !emPainel })

  // O cronômetro de estudo credita os segundos a quem está aberto.
  useEmEstudo(doc, !emPainel)

  useEffect(() => {
    if (data) {
      setDoc(data)
      setDirty(false)
    }
  }, [data])

  // Dois editores do mesmo documento (split view, ou duas abas) devem
  // refletir a mesma coisa. Quando um salva, o outro descobre pelo
  // evento e recarrega — sem isto, edits no lado esquerdo só aparecem
  // no lado direito no próximo F5.
  useEffect(() => {
    if (isCreate || !id) return
    const nome = `notefy:saved:${id}`
    const aoSalvar = (evento) => {
      // Ignora o próprio salvamento: a resposta do PATCH já entrou pelo
      // `setData`, e recarregar remontaria este editor no meio do uso.
      if (evento.detail?.origem === instanciaRef.current) return
      refetch()
    }
    window.addEventListener(nome, aoSalvar)
    return () => window.removeEventListener(nome, aoSalvar)
  }, [id, isCreate, refetch])

  // Documento novo nasce em memória e só vai ao servidor no primeiro
  // salvamento — assim abrir um editor não polui a pasta com rascunhos
  // vazios que o usuário desistiu de escrever.
  useEffect(() => {
    if (!isCreate) return
    setDoc({
      kind: routeKind,
      title: '',
      content: '',
      content_format: 'html',
      data: null,
      status: 'draft',
      folder: folderParaCriar,
      is_favorite: false,
      attachments: [],
    })
  }, [isCreate, routeKind, folderParaCriar])

  // Sem pasta não há onde criar. Em vez de deixar salvar e receber um 400,
  // o seletor abre de saída e a escolha vira parte do fluxo de criação.
  const [pickingFolder, setPickingFolder] = useState(false)
  useEffect(() => {
    if (isCreate && !folderParaCriar) setPickingFolder(true)
  }, [isCreate, folderParaCriar])

  const persist = useCallback(
    async (payload) => {
      setSaving(true)
      setSaveError(null)
      const edicoesNoEnvio = edicoesRef.current
      try {
        const body = corpoDoDocumento(payload)

        const response = isCreate
          ? await api.post('/documents/', body)
          : await api.patch(`/documents/${id}/`, body)

        pendenteRef.current = null
        setDirty(false)
        setSavedAt(new Date())
        refreshTree()
        // Avisa OUTROS editores do mesmo documento que a versão mudou. A
        // origem viaja junto para que este aqui não se recarregue sozinho.
        window.dispatchEvent(
          new CustomEvent(`notefy:saved:${payload.id}`, {
            detail: { origem: instanciaRef.current },
          }),
        )

        if (isCreate) {
          navigate(`${meta.route}/${response.data.id}`, { replace: true })
        } else if (edicoesRef.current === edicoesNoEnvio) {
          // Ninguém desenhou enquanto o PATCH viajava: a resposta é a
          // versão corrente e pode virar a base. Se tivesse havido edição,
          // adotá-la apagaria da tela o que foi feito nesse intervalo.
          setData(response.data)
        }
        return response.data
      } catch (err) {
        setSaveError(extractError(err))
        throw err
      } finally {
        setSaving(false)
      }
    },
    [id, isCreate, meta.route, navigate, refreshTree, setData],
  )

  /* Autosave, em todos os tipos.
     Numa planilha ou canvas cada arraste gera uma mudança; exigir Ctrl+S a
     cada gesto seria hostil. A nota entrou junto quando virou blocos: o
     gesto de digitar passou a ser o mesmo dos outros editores, e ser a
     única tela com Ctrl+S obrigatório era a exceção que ninguém lembrava. */
  const scheduleAutosave = useCallback(
    (next) => {
      // Nota agora também salva sozinha: com blocos de código, o gesto de
      // digitar é o mesmo dos outros editores e exigir Ctrl+S a cada
      // bloco seria a única exceção da interface.
      if (isCreate) return
      // Só salva o que já veio do servidor: durante a troca de documento o
      // estado ainda aponta para o anterior, e gravar aqui sobrescreveria
      // o novo com o conteúdo do velho.
      if (next.id !== id) return
      clearTimeout(autosaveRef.current)
      pendenteRef.current = next
      autosaveRef.current = setTimeout(() => {
        pendenteRef.current = null
        persist(next).catch(() => {})
      }, AUTOSAVE_MS)
    },
    [isCreate, id, persist],
  )

  // Ao TROCAR de documento, não só ao desmontar: ir de /canvas/A para
  // /canvas/B reaproveita este mesmo componente.
  //
  // O timer morre aqui, mas o que ele ia salvar NÃO: fechar a aba, trocar
  // de item ou sair do editor dentro dos 1,5s do debounce jogava a última
  // edição fora — a aba mostrava o ponto de "não salvo" e ele sumia junto
  // com a alteração. O PATCH vai pelo id do payload (o de A, nunca o de
  // B) e sem tocar em estado: este editor já está indo embora, e
  // `persist` marcaria como limpo um documento que a esta altura é outro.
  useEffect(
    () => () => {
      clearTimeout(autosaveRef.current)
      const pendente = pendenteRef.current
      pendenteRef.current = null
      if (pendente) {
        api
          .patch(`/documents/${pendente.id}/`, corpoDoDocumento(pendente))
          .catch(() => {})
      }
    },
    [id],
  )

  /** Volta um passo. */
  const undo = useCallback(() => {
    const pilha = historyRef.current
    if (!pilha || !podeDesfazer(pilha)) return
    edicoesRef.current += 1
    clearTimeout(autosaveRef.current)
    historyRef.current = desfazer(pilha)
    const presente = historyRef.current.presente
    setDoc(presente)
    setDirty(true)
    scheduleAutosave(presente)
  }, [scheduleAutosave])

  /** Avança um passo. */
  const redo = useCallback(() => {
    const pilha = historyRef.current
    if (!pilha || !podeRefazer(pilha)) return
    edicoesRef.current += 1
    clearTimeout(autosaveRef.current)
    historyRef.current = refazer(pilha)
    const presente = historyRef.current.presente
    setDoc(presente)
    setDirty(true)
    scheduleAutosave(presente)
  }, [scheduleAutosave])

  const patch = (changes) => {
    edicoesRef.current += 1
    setDoc((current) => {
      const next = { ...current, ...changes }
      setDirty(true)
      scheduleAutosave(next)
      return next
    })
  }

  const save = () => persist(doc).catch(() => {})

  // ----------------------------------------------------------------
  // IA dentro do editor
  //
  // O menu de botão direito ganha um item "IA" com as mecânicas do tipo.
  // Texto volta para cá e é encaixado no documento; estrutura (diagrama,
  // planilha) o backend já gravou, então só recarregamos.
  // ----------------------------------------------------------------
  const { menu: menuIA, openMenu: abrirMenuIA, closeMenu: fecharMenuIA } = useContextMenu()

  const aplicarTexto = useCallback(
    (texto, task) => {
      const limpo = (texto || '').trim()
      if (!limpo) return
      if (kind !== 'note') {
        // Planilha/diagrama não têm onde encaixar texto solto: a resposta
        // (uma fórmula, por exemplo) vai para a área de transferência.
        copiarTexto(limpo)
        return
      }
      // Escapado: `limpo` é a resposta da IA, e o endereço do provedor
      // é escolhido pelo usuário — o texto vem de um servidor que o app
      // não controla. O `merge.js`, no caminho vizinho, já escapava; aqui
      // ia cru para dentro do HTML da nota.
      const secoes = doc.data?.sections ?? []
      const nova = { id: `s${Date.now()}`, type: 'text', html: `<p>${escaparTexto(limpo)}</p>` }
      // Corrigir reescreve; resumir e continuar acrescentam ao fim.
      //
      // Reescreve a primeira seção de TEXTO, não a primeira seção: numa
      // nota que começa com um bloco de código (ou hoje com um checklist
      // ou uma tabela), escrever um `html` por cima deixava o bloco com
      // o tipo antigo e um campo que ele não desenha — o texto corrigido
      // sumia e o bloco original ficava intacto.
      const alvo = secoes.findIndex((s) => (s?.type ?? 'text') === 'text')
      const proximas =
        task === 'nota.corrigir'
          ? alvo === -1
            ? [nova, ...secoes]
            : secoes.map((s, i) => (i === alvo ? { ...s, html: `<p>${escaparTexto(limpo)}</p>` } : s))
          : [...secoes, nova]
      patch({ data: { ...doc.data, sections: proximas } })
    },
    // `patch` é recriado a cada render por desenho; o que importa aqui é
    // o documento atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, doc],
  )

  const aplicarDocumento = useCallback(
    (data) => {
      // O backend gravou com `apply: replace`; refletimos na tela sem
      // marcar sujo (nada a salvar de novo).
      setDoc((atual) => ({ ...atual, data }))
      commitHistory({ ...doc, data })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, commitHistory],
  )

  const { itemIA, rodando: rodandoIA, erro: erroIA, limparErro, modalIA } = useAcoesIA({
    kind,
    documentId: isCreate ? null : id,
    onTexto: aplicarTexto,
    onDocumento: aplicarDocumento,
  })

  // ----------------------------------------------------------------
  // Título: sugestão fantasma aplicada com Enter.
  //
  // Só aparece quando o título ainda está vazio e há conteúdo para ler —
  // sugerir título de documento em branco não tem de onde sair.
  // ----------------------------------------------------------------
  const [sugestaoTitulo, setSugestaoTitulo] = useState('')
  const tituloPedidoRef = useRef(false)

  useEffect(() => {
    if (isCreate || !doc || tituloPedidoRef.current) return
    if ((doc.title || '').trim()) return
    tituloPedidoRef.current = true
    runIA({ task: 'titulo.sugerir', documentId: id })
      .then((r) => setSugestaoTitulo((r.text || '').trim().slice(0, 80)))
      .catch(() => {})
  }, [isCreate, doc, id])

  /**
   * Estrela: PATCH próprio, sem passar pelo autosave.
   *
   * Pelo `patch` comum a gravação só sairia 1500 ms depois, e a sidebar só
   * é avisada por `notefy:favorites-changed` — que ninguém disparava aqui.
   * O resultado era a estrela do editor acesa e a da sidebar apagada até
   * recarregar a página. Agora vai junto: grava, avisa, e a lista lateral
   * acende no mesmo tique.
   */
  const toggleFavorite = async () => {
    const novo = !doc.is_favorite
    setDoc((atual) => ({ ...atual, is_favorite: novo }))
    if (isCreate) return

    const endpoint = `/documents/${id}/`
    try {
      await api.patch(endpoint, { is_favorite: novo })
      window.dispatchEvent(
        new CustomEvent('notefy:favorites-changed', {
          detail: { endpoint, is_favorite: novo },
        }),
      )
    } catch (err) {
      // Desfaz o otimismo: deixar a estrela acesa sobre um PATCH que
      // falhou é pior do que não tê-la ligado.
      setDoc((atual) => ({ ...atual, is_favorite: !novo }))
      setSaveError(extractError(err))
    }
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty) save()
      }
      // Ctrl+Shift+F alterna a estrela do item aberto, pela mesma porta do
      // botão do cabeçalho.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        toggleFavorite()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const handleDelete = async () => {
    await api.delete(`/documents/${id}/`)
    // Um autosave agendado dispararia um PATCH contra o item que acabou de
    // ir para a lixeira — e o ressuscitaria, ou tomaria 404 na cara do
    // usuário logo depois de ele confirmar a exclusão.
    clearTimeout(autosaveRef.current)
    refreshTree()
    setConfirmDelete(false)

    // Excluir o que está no painel fecha o painel — navegar levaria o
    // lado ESQUERDO para a pasta, que não é o que se pediu.
    if (emPainel) {
      fecharPainel()
      return
    }

    // A aba fica: o `REPLACE` abaixo a reaproveita como "mesma vaga" e o
    // TabsContext a remove, mas só se ela ainda for a ativa. Fechar
    // explicitamente cobre também a navegação que não passa por ali.
    if (activeKey) closeTab(activeKey)
    // A pasta é para onde se quer voltar depois de excluir. `meta.route`
    // (`/notes`, `/sheets`...) não é rota de nada — só existem `/new` e
    // `/:id` abaixo dela — e deixava a tela em branco.
    navigate(doc.folder ? `/folders/${doc.folder}` : '/', { replace: true })
  }

  /* O item saiu debaixo da aba.
     Acontece quando a exclusão veio de outro lugar — da sidebar, de outra
     janela, de outra aba com o mesmo documento. Vem ANTES do spinner de
     propósito: sem `doc` e sem `loading`, a checagem antiga (`!doc`)
     ganhava e a aba girava para sempre. `onRetry` também não serve aqui,
     porque tentar de novo só traz o mesmo 404. */
  if (!isCreate && (errorStatus === 404 || errorStatus === 410)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Trash2 size={28} className="text-ink-300 dark:text-ink-600" />
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Este item foi movido para a lixeira.
        </p>
        <div className="flex gap-2">
          {!emPainel && (
            <Button variant="secondary" onClick={() => navigate('/trash')}>
              Ver lixeira
            </Button>
          )}
          <Button onClick={() => (emPainel ? fecharPainel() : activeKey && closeTab(activeKey))}>
            {emPainel ? 'Fechar painel' : 'Fechar aba'}
          </Button>
        </div>
      </div>
    )
  }

  if (loading || !doc) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={22} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message={error} onRetry={refetch} />
      </div>
    )
  }

  const status = DOCUMENT_STATUS[doc.status] ?? DOCUMENT_STATUS.draft
  const Icon = meta.icon

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra de ações */}
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 px-4 py-2 dark:border-ink-800">
        {/* No painel lateral não há "voltar": o histórico pertence ao lado
            esquerdo, e um `navigate(-1)` aqui trocaria o documento DE LÁ
            enquanto o usuário olha para este. */}
        {/* Volta também no painel: o `navigate(-1)` de dentro do painel
            cai no navegador do SplitContext (go → voltarPainel), e fora
            dele é o histórico do navegador mesmo. */}
        <button
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
        >
          <ArrowLeft size={16} />
        </button>

        <Icon size={15} className="shrink-0" style={{ color: doc.color || meta.accent }} />

        {doc.breadcrumb?.length > 0 && (
          <nav className="hidden min-w-0 items-center gap-1 text-xs text-ink-400 sm:flex">
            {doc.breadcrumb.map((crumb) => (
              <span key={crumb.id} className="flex shrink-0 items-center gap-1">
                {/* O `<Link>` navega no router de quem o renderiza: na
                    esquerda troca a rota principal, e no painel o
                    SplitContext intercepta e navega o próprio painel de
                    volta para a pasta/categoria. */}
                <Link
                  to={
                    crumb.type === 'category'
                      ? `/categories/${crumb.id}`
                      : `/folders/${crumb.id}`
                  }
                  className="max-w-[110px] truncate hover:text-ink-700 dark:hover:text-ink-200"
                >
                  {crumb.name}
                </Link>
                <ChevronRight size={11} />
              </span>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {saving && <Spinner size={13} />}
          {savedAt && !dirty && !saving && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check size={12} /> salvo
            </span>
          )}

          <Badge className={status.className}>{status.label}</Badge>

          {!isCreate && (
            <>
              <button
                onClick={toggleFavorite}
                aria-label="Favoritar"
                className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <Star size={15} className={cn(doc.is_favorite && 'fill-amber-400 text-amber-400')} />
              </button>
              <ExportMenu document={doc} disabled={dirty} onError={setSaveError} />
              <button
                onClick={() => setConfirmDelete(true)}
                aria-label="Excluir"
                className="rounded p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}

          <button
            onClick={() => setShowMeta(true)}
            aria-label="Propriedades"
            title="Pasta, categorias e status"
            className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <Settings2 size={15} />
          </button>

          <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
            {isCreate ? 'Criar' : 'Salvar'}
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="px-4 pt-3">
          <ErrorState message={saveError} />
        </div>
      )}

      {/* Título. A sugestão da IA aparece como texto fantasma atrás do
          campo; Enter (ou Tab) aceita, digitar qualquer coisa descarta. */}
      <div className="relative shrink-0 px-4 pt-4">
        {sugestaoTitulo && !(doc.title || '').trim() && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-4 truncate text-2xl font-semibold tracking-tight text-ink-300 dark:text-ink-700"
          >
            {sugestaoTitulo}
            <span className="ml-2 align-middle text-[11px] font-normal">Enter para usar</span>
          </div>
        )}
        <input
          value={doc.title}
          onChange={(e) => {
            if (sugestaoTitulo) setSugestaoTitulo('')
            patch({ title: e.target.value })
          }}
          onKeyDown={(e) => {
            // Enter aceita a sugestão fantasma quando ela está na tela.
            if (sugestaoTitulo && !(doc.title || '').trim()) {
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                patch({ title: sugestaoTitulo })
                setSugestaoTitulo('')
              }
              return
            }
            // Enter no título cria o item novo / salva a edição: quem
            // digitou o nome quer concluir, não caçar o botão Salvar.
            if (e.key === 'Enter') {
              e.preventDefault()
              if (isCreate || dirty) save()
              else e.currentTarget.blur()
            }
          }}
          placeholder={sugestaoTitulo ? '' : `${meta.label} sem título`}
          autoFocus={isCreate}
          className="relative w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-0 dark:text-ink-50 dark:placeholder:text-ink-700"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {doc.category && (
            <Badge color={doc.category.color}>{doc.category.name}</Badge>
          )}
          {!isCreate && (
            <span className="text-[11px] text-ink-400">
              editado {formatRelative(doc.updated_at)}
            </span>
          )}
        </div>
      </div>

      {/* Editor conforme o tipo.
          O botão direito em qualquer ponto do editor traz o item "IA" com
          as mecânicas daquele tipo. O menu do GraphEditor (duplicar,
          excluir sobre um nó) continua vindo primeiro: ele para o evento
          antes de chegar aqui. */}
      <div
        className="mt-3 flex min-h-0 flex-1 flex-col px-4 pb-4"
        onContextMenu={(e) => {
          if (isCreate) return
          abrirMenuIA(e, { items: [itemIA] })
        }}
      >
        {kind === 'note' && (
          <NoteEditor
            documentId={doc.id}
            data={doc.data}
            onChange={(next) => patch({ data: next })}
            // Mesmo canal que o `ExportMenu` já usa: colar uma imagem que
            // falha no upload não pode terminar em silêncio, com a pessoa
            // olhando para a nota sem entender por que nada apareceu.
            onError={setSaveError}
          />
        )}

        {kind === 'spreadsheet' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink-200 dark:border-ink-800">
            <SpreadsheetEditor data={doc.data} onChange={(next) => patch({ data: next })} />
          </div>
        )}

        {(kind === 'diagram' || kind === 'canvas') && (
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-ink-200 dark:border-ink-800">
            <GraphEditor
              kind={kind}
              documentId={doc.id}
              onError={setSaveError}
              onAbrirDocumento={(alvoId, alvoKind) =>
                navigate(`${kindMeta(alvoKind || 'note').route}/${alvoId}`)
              }
              data={doc.data}
              onChange={(next) => patch({ data: next })}
              onCommit={commitHistory}
              onUndo={undo}
              onRedo={redo}
            />
          </div>
        )}

        {/* Anexos: só quando existem.
            A seção com "Nenhum anexo" ocupava espaço no rodapé de toda
            nota para dizer que não havia nada — e como o botão de anexar
            vive na barra de ações, ela não era o único caminho para
            criar o primeiro. */}
        {doc.attachments?.length > 0 && (
          <div className="mt-5 shrink-0 border-t border-ink-100 pt-4 dark:border-ink-800">
            <h3 className="mb-2 flex items-center gap-1.5 secao">
              <Paperclip size={12} />
              Anexos ({doc.attachments.length})
            </h3>
            <ul className="flex flex-wrap gap-2">
              {doc.attachments.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.file_url}
                    rel="noreferrer"
                    onClick={(event) => {
                      // Sem isto o anexo não abre no aplicativo: o
                      // `target="_blank"` não tem para onde ir numa janela
                      // sem abas, e o `file_url` é absoluto para a origem
                      // do backend, que a janela carrega de outro lugar.
                      // Mesmo tratamento que o FileViewer já dava.
                      event.preventDefault()
                      baixarArquivoNoClique(file)
                    }}
                    className="flex items-center gap-2 rounded-md border border-ink-200 px-2.5 py-1.5 text-xs text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-900"
                  >
                    <Download size={12} />
                    <span className="max-w-[180px] truncate">{file.title}</span>
                    <span className="text-ink-400">{formatBytes(file.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ContextMenu
        open={!!menuIA}
        x={menuIA?.x ?? 0}
        y={menuIA?.y ?? 0}
        onClose={fecharMenuIA}
        items={menuIA?.payload?.items ?? []}
      />

      <AvisoIA rodando={rodandoIA} erro={erroIA} onFechar={limparErro} />

      {modalIA}

      <DocumentMetaModal
        open={showMeta}
        document={doc}
        saving={saving}
        onClose={() => setShowMeta(false)}
        onSave={async (changes) => {
          const next = { ...doc, ...changes }
          setDoc(next)
          setShowMeta(false)
          await persist(next).catch(() => {})
        }}
      />

      {/* Escolha da pasta na criação: sem destino, não há o que salvar. */}
      <DestinationModal
        open={pickingFolder}
        kind={kind}
        onClose={() => {
          setPickingFolder(false)
          if (!doc.folder) navigate(-1)
        }}
        onPick={(folderId) => {
          setPickingFolder(false)
          patch({ folder: folderId })
        }}
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Excluir ${meta.label.toLowerCase()}`}
        description="Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">
          <strong>{doc.title || 'Sem título'}</strong> será removido permanentemente
          {doc.attachments?.length > 0 && `, junto com ${doc.attachments.length} anexo(s)`}.
        </p>
      </Modal>
    </div>
  )
}

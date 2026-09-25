import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderDown, Sparkles } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useSplit } from '@/context/SplitContext'
import { useAuth } from '@/context/AuthContext'
import { documentMenuItems } from '@/components/DocumentCard'
import { AvisoIA } from '@/components/ai/useAcoesIA'
import { runIA } from '@/lib/ai'
import { kindMeta } from '@/lib/documents'
import DestinationModal from '@/components/modals/DestinationModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'

//: Tipos que a IA sabe gerar a partir de outro item.
const KINDS_DERIVAVEIS = ['note', 'spreadsheet', 'diagram', 'canvas', 'file']

//: Tarefa do backend por tipo alvo.
const TAREFA_POR_KIND = {
  note: 'criar.nota',
  spreadsheet: 'criar.planilha',
  diagram: 'criar.diagrama',
  canvas: 'criar.canvas',
}

/**
 * Ações de item (mover, duplicar, excluir) com os diálogos que elas pedem.
 *
 * Concentradas aqui porque aparecem em quatro telas — pasta, categoria,
 * recentes e busca — e cada uma reimplementá-las significaria quatro
 * comportamentos que divergem com o tempo.
 */
export function useDocumentActions({ onChanged, onRename } = {}) {
  const navigate = useNavigate()
  const { refresh } = useWorkspace()
  const { abrirAoLado } = useSplit()
  const { user } = useAuth()

  const [moving, setMoving] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [gerando, setGerando] = useState(null)
  const [erroIA, setErroIA] = useState(null)
  const [extrair, setExtrair] = useState(null)
  const [erroExtract, setErroExtract] = useState(null)
  //: Falha de uma ação do menu de contexto — duplicar, exportar. Elas
  //: rodam sem tela própria (o menu já fechou quando o pedido volta),
  //: então não havia onde mostrar o motivo: duplicar sem `catch` virava
  //: promessa rejeitada e sumia, e exportar tinha um `catch` vazio.
  const [erroAcao, setErroAcao] = useState(null)

  const done = useCallback(() => {
    refresh()
    onChanged?.()
    // Mover, duplicar e excluir mudam o que TODAS as listagens mostram, não
    // só a que abriu o menu. Sem este aviso, mover um item numa pasta
    // deixava ele visível em Recentes e na busca até recarregar a página.
    window.dispatchEvent(new Event('notefy:moved'))
  }, [refresh, onChanged])

  /**
   * Liga/desliga a estrela. Mesmo PATCH e mesmo evento que o
   * `<FavoriteButton />` usa, para as duas portas nunca divergirem.
   */
  const toggleFavorite = useCallback(
    async (doc) => {
      const endpoint = `/documents/${doc.id}/`
      const novo = !doc.is_favorite
      await api.patch(endpoint, { is_favorite: novo })
      window.dispatchEvent(
        new CustomEvent('notefy:favorites-changed', {
          detail: { endpoint, is_favorite: novo },
        }),
      )
      done()
      return novo
    },
    [done],
  )

  /**
   * "Criar a partir de": a IA lê o item clicado e gera um item NOVO na
   * mesma pasta, do tipo escolhido. O backend grava e devolve o id; a
   * gente abre o resultado — quem pediu quer ver o que saiu.
   */
  const criarAPartirDe = useCallback(
    async (doc, kind) => {
      setErroIA(null)
      setGerando(kindMeta(kind).label)
      try {
        const resultado = await runIA({
          task: TAREFA_POR_KIND[kind],
          documentId: doc.id,
          apply: 'create',
          folderId: doc.folder,
          kind,
          title: `${doc.title || 'Sem título'} (${kindMeta(kind).label})`,
        })
        done()
        navigate(`${kindMeta(kind).route}/${resultado.document_id}`)
      } catch (e) {
        setErroIA(e.message)
      } finally {
        setGerando(null)
      }
    },
    [done, navigate],
  )

  const buildMenu = useCallback(
    (doc) => {
      const itens = documentMenuItems(doc, {
        navigate,
        onOpenAside: abrirAoLado,
        // A tela que lista é quem sabe DESENHAR o campo no lugar do
        // título; o menu só avisa qual item entrou em edição. Sem
        // `onRename`, o item nem aparece no menu.
        onRename: onRename && (() => onRename(doc)),
        onMove: () => setMoving(doc),
        onDuplicate: async () => {
          try {
            await api.post(`/documents/${doc.id}/duplicate/`)
            done()
          } catch (err) {
            setErroAcao(extractError(err))
          }
        },
        onDelete: () => setDeleting(doc),
        onError: setErroAcao,
      })

      // Detectar .zip pela extensão do título ou nome original
      const nome = (doc.title || doc.original_name || '').toLowerCase()
      const isZip = doc.kind === 'file' && nome.endsWith('.zip')

      // .zip não pode ser fonte para "Criar a partir de" — a IA não sabe
      // ler binário. Mas pode ser extraído.
      if (isZip) {
        return [
          ...itens,
          { separator: true },
          {
            label: `Extrair "${doc.title || 'Sem título'}"`,
            icon: FolderDown,
            onClick: () => {
              setErroExtract(null)
              setExtrair(doc)
            },
          },
        ]
      }

      // Arquivo pode ser usado como fonte para criar documentos novos
      // (o backend extrai o texto do upload). O tipo do próprio item sai
      // da lista: "criar uma nota a partir desta nota" é duplicar.
      if (!KINDS_DERIVAVEIS.includes(doc.kind)) return itens

      const configurada = !!user?.preferences?.ai_provider
      // Não é possível criar arquivo a partir de arquivo — só tipos editáveis.
      const alvos = KINDS_DERIVAVEIS.filter(
        (k) => k !== doc.kind && k !== 'file',
      )

      return [
        ...itens,
        { separator: true },
        {
          label: `Criar a partir de "${doc.title || 'Sem título'}"`,
          icon: Sparkles,
          disabled: !configurada || !!gerando,
          submenu: configurada
            ? alvos.map((k) => {
                const meta = kindMeta(k)
                return {
                  label: `Como ${meta.label}`,
                  icon: meta.icon,
                  onClick: () => criarAPartirDe(doc, k),
                }
              })
            : [{ label: 'Ative o Laviel em Configurações', disabled: true }],
        },
      ]
    },
    [navigate, done, abrirAoLado, user, gerando, criarAPartirDe, onRename],
  )

  const extrairZip = useCallback(
    async (folderId) => {
      if (!extrair) return
      setErroExtract(null)
      try {
        const { data } = await api.post(`/documents/${extrair.id}/extract/`, {
          folder: folderId || undefined,
        })
        setExtrair(null)
        done()
        navigate(`/folders/${data.folder}`)
      } catch (e) {
        // `extractError` e nao a mao: aqui `e.message` era a frase em
        // inglês do axios quando o corpo não trazia `detail`.
        setErroExtract(extractError(e, 'Falha ao extrair.'))
      }
    },
    [extrair, done, navigate],
  )

  const dialogs = (
    <>
      <AvisoIA
        rodando={gerando && `Gerando ${gerando}`}
        erro={erroIA}
        onFechar={() => setErroIA(null)}
      />
      {/* Mesmo aviso flutuante, para o que não é IA. O componente só
          desenha um recado no topo — de IA ele tem o nome. */}
      <AvisoIA rodando={null} erro={erroAcao} onFechar={() => setErroAcao(null)} />

      <DestinationModal
        open={!!moving}
        title="Mover item"
        confirmLabel="Mover"
        currentFolderId={moving?.folder}
        onClose={() => setMoving(null)}
        onPick={async (folderId) => {
          const doc = moving
          setMoving(null)
          await api.post(`/documents/${doc.id}/move/`, { folder: folderId })
          done()
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir item"
        message={
          <>
            <strong>{deleting?.title}</strong> será removido permanentemente
            {deleting?.attachment_count > 0 &&
              `, junto com ${deleting.attachment_count} anexo(s)`}
            .
          </>
        }
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api.delete(`/documents/${deleting.id}/`)
          done()
        }}
      />

      <DestinationModal
        open={!!extrair}
        title="Extrair .zip"
        confirmLabel="Extrair"
        currentFolderId={extrair?.folder}
        // Extrair na pasta em que o .zip já está é o caso comum: o
        // backend cria uma subpasta com o nome do arquivo.
        permitirPastaAtual
        onClose={() => { setExtrair(null); setErroExtract(null) }}
        onPick={extrairZip}
      />

      {erroExtract && extrair && (
        <AvisoIA rodando={null} erro={erroExtract} onFechar={() => setErroExtract(null)} />
      )}
    </>
  )

  return { buildMenu, dialogs, toggleFavorite }
}

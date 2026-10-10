import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileOutput, FolderDown, LayoutTemplate, Sparkles } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useSplit } from '@/context/SplitContext'
import { useAuth } from '@/context/AuthContext'
import { usePropriedadesNoMenu } from '@/context/PropriedadesContext'
import { documentMenuItems } from '@/components/DocumentCard'
import { MensagemDeExclusao } from '@/hooks/useCascadeDelete'
import { avisarErro, avisarProgresso, avisarSucesso, fecharAviso } from '@/lib/avisoFlutuante'
import { runIA } from '@/lib/ai'
import { documentPath, kindMeta } from '@/lib/documents'
import DestinationModal from '@/components/modals/DestinationModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import ModeloModal from '@/components/modals/ModeloModal'
import { t } from '@/lib/i18n'

//: Tipos que a IA sabe gerar a partir de outro item.
const KINDS_DERIVAVEIS = ['note', 'spreadsheet', 'diagram', 'canvas', 'file']

//: Tipos que viram modelo (arquivo não: o modelo guarda o conteúdo editável).
const KINDS_DE_MODELO = ['note', 'spreadsheet', 'diagram', 'canvas', 'design']

//: Tarefa do backend por tipo alvo.
const TAREFA_POR_KIND = {
  note: 'criar.nota',
  spreadsheet: 'criar.planilha',
  diagram: 'criar.diagrama',
  canvas: 'criar.canvas',
}

/**
 * Converte um arquivo importado (imagens entre si, imagem e texto para
 * PDF). O resultado nasce na mesma pasta; o aviso diz o nome e abre o
 * arquivo no clique, porque vindo de Recentes ele não está na tela.
 */
async function converterArquivo(doc, formato, abrir) {
  // Por formato: PDF e JPG do mesmo arquivo ao mesmo tempo são dois avisos.
  const id = `converter-${doc.id}-${formato}`
  avisarProgresso(id, t('Convertendo "{nome}" para {formato}...', { nome: doc.title, formato: formato.toUpperCase() }))
  try {
    const { data } = await api.post(`/documents/${doc.id}/convert/`, { para: formato })
    avisarSucesso(t('"{nome}" foi criado na mesma pasta.', { nome: data.title }), id, () => abrir(data))
    return data
  } catch (err) {
    avisarErro(extractError(err), id)
    return null
  }
}

/** Os formatos de `doc.conversoes` como itens de menu: o botão direito e a tela do arquivo. */
export const formatosDeConversao = (doc, abrir, aoCriar) =>
  doc.conversoes.map((formato) => ({
    label: formato.toUpperCase(),
    onClick: async () => (await converterArquivo(doc, formato, abrir)) && aoCriar?.(),
  }))

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
  const fimDoMenu = usePropriedadesNoMenu()

  const [moving, setMoving] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [gerando, setGerando] = useState(null)
  const [extrair, setExtrair] = useState(null)
  const [salvandoModelo, setSalvandoModelo] = useState(null)

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
      setGerando(kindMeta(kind).label)
      avisarProgresso('ia-criar', t('Gerando {tipo}', { tipo: kindMeta(kind).label }) + '...')
      try {
        const resultado = await runIA({
          task: TAREFA_POR_KIND[kind],
          documentId: doc.id,
          apply: 'create',
          folderId: doc.folder,
          kind,
          title: `${doc.title || t('Sem título')} (${kindMeta(kind).label})`,
        })
        fecharAviso('ia-criar')
        done()
        navigate(`${kindMeta(kind).route}/${resultado.document_id}`)
      } catch (e) {
        avisarErro(e.message, 'ia-criar')
      } finally {
        setGerando(null)
      }
    },
    [done, navigate],
  )

  const montarMenu = useCallback(
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
            avisarErro(extractError(err))
          }
        },
        onDelete: () => setDeleting(doc),
        // Duplicar e exportar rodam com o menu já fechado: o motivo de uma
        // falha só tem onde aparecer no aviso flutuante.
        onError: avisarErro,
      })

      // Salvar como modelo, logo depois de Duplicar: é a mesma ideia (uma
      // cópia), só que guardada para servir de ponto de partida.
      if (KINDS_DE_MODELO.includes(doc.kind)) {
        const depoisDeDuplicar = itens.findIndex((i) => i.label === t('Duplicar')) + 1
        itens.splice(depoisDeDuplicar, 0, {
          label: t('Salvar como modelo'),
          icon: LayoutTemplate,
          onClick: () => setSalvandoModelo(doc),
        })
      }

      // Só arquivo importado traz `conversoes`; itens do app vêm com [].
      if (doc.conversoes?.length) {
        const depoisDeDuplicar = itens.findIndex((i) => i.label === t('Duplicar')) + 1
        itens.splice(depoisDeDuplicar, 0, {
          label: t('Converter para'),
          icon: FileOutput,
          submenu: formatosDeConversao(doc, (novo) => navigate(documentPath(novo)), done),
        })
      }

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
            label: t('Extrair "{valor}"', { valor: doc.title || t('Sem título') }),
            icon: FolderDown,
            onClick: () => setExtrair(doc),
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
          label: t('Criar a partir de "{valor}"', { valor: doc.title || t('Sem título') }),
          icon: Sparkles,
          disabled: !configurada || !!gerando,
          submenu: configurada
            ? alvos.map((k) => {
                const meta = kindMeta(k)
                return {
                  label: t('Como {label}', { label: meta.label }),
                  icon: meta.icon,
                  onClick: () => criarAPartirDe(doc, k),
                }
              })
            : [{ label: t('Ative o Laviel em Configurações'), disabled: true }],
        },
      ]
    },
    [navigate, done, abrirAoLado, user, gerando, criarAPartirDe, onRename],
  )

  // Propriedades fecha o menu de todo item, como no Explorer.
  const buildMenu = useCallback(
    (doc) => [...montarMenu(doc), ...fimDoMenu('documento', doc.id)],
    [montarMenu, fimDoMenu],
  )

  const extrairZip = useCallback(
    async (folderId) => {
      if (!extrair) return
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
        avisarErro(extractError(e, t('Falha ao extrair.')))
      }
    },
    [extrair, done, navigate],
  )

  const dialogs = (
    <>
      <ModeloModal open={!!salvandoModelo} documento={salvandoModelo} onClose={() => setSalvandoModelo(null)} />

      <DestinationModal
        open={!!moving}
        title={t('Mover item')}
        confirmLabel={t('Mover')}
        currentFolderId={moving?.folder}
        onClose={() => setMoving(null)}
        onPick={async (folderId) => {
          const doc = moving
          setMoving(null)
          try {
            await api.post(`/documents/${doc.id}/move/`, { folder: folderId })
            done()
          } catch (err) {
            avisarErro(extractError(err))
          }
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t('Excluir item')}
        message={<MensagemDeExclusao nome={deleting?.title} anexos={deleting?.attachment_count} />}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api.delete(`/documents/${deleting.id}/`)
          done()
        }}
      />

      <DestinationModal
        open={!!extrair}
        title={t('Extrair .zip')}
        confirmLabel={t('Extrair')}
        currentFolderId={extrair?.folder}
        // Extrair na pasta em que o .zip já está é o caso comum: o
        // backend cria uma subpasta com o nome do arquivo.
        permitirPastaAtual
        onClose={() => setExtrair(null)}
        onPick={extrairZip}
      />
    </>
  )

  return { buildMenu, dialogs, toggleFavorite }
}

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Download, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { exportarSelecao } from '@/components/ExportMenu'
import { useFetch } from '@/hooks/useFetch'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useTabState } from '@/context/TabsContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { BarraDeSelecao, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { usePropriedadesNoMenu } from '@/context/PropriedadesContext'
import FolderFormModal from '@/components/modals/FolderFormModal'
import PastaCard from '@/components/PastaCard'
import { useF2, useRenomear } from '@/hooks/useRenomear'
import { itensDaPasta } from '@/components/layout/menusDaArvore'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import { useExcluirSelecao } from '@/hooks/useCascadeDelete'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { useMultiSelect } from '@/hooks/useMultiSelect'
import { canDrop, hasItemPayload, readDragPayload } from '@/lib/dnd'
import { t } from '@/lib/i18n'

/**
 * Segundo nível da navegação: as pastas de uma categoria.
 *
 * Aceita `id` por prop para o painel lateral do split: lá dentro o React
 * Router continua apontando para a rota da ESQUERDA, e `useParams()`
 * devolveria o id do documento principal — o painel mostraria a categoria
 * errada.
 */
export default function CategoryDetail({ id: idProp }) {
  const params = useParams()
  const id = idProp ?? params.id
  const emPainel = !!idProp
  const navigate = useNavigate()
  const { refresh } = useWorkspace()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const fimDoMenu = usePropriedadesNoMenu()

  const { data, loading, error, refetch } = useFetch(`/categories/${id}/contents/`, {
    deps: [id],
  })

  // Título da aba: categoria abre como aba própria, e o nome real
  // substitui o "Categoria" padrão. No painel lateral o router pertence
  // à esquerda, então a aba não é mexida (enabled: false).
  useTabState({ title: data?.category?.name ?? t('Categoria'), enabled: !emPainel })

  const [folderModal, setFolderModal] = useState(null)
  const [categoryModal, setCategoryModal] = useState(false)

  // Seleção múltipla: o mesmo hook das outras listas. A cópia que morava
  // aqui esquecia de mover a âncora depois do Shift (o intervalo seguinte
  // saía do item errado) e não tinha Esc — dois comportamentos que a tela
  // de pastas e a busca já tinham. Chave `folder:<id>`, como em toda lista.
  const {
    selected: selectedIds,
    isSelected,
    clear: limparSelecao,
    handleClick,
    handleContextMenu: selecionarParaMenu,
  } = useMultiSelect((data?.folders ?? []).map((f) => `folder:${f.id}`))

  const renomear = useRenomear({ onRenamed: refetch })
  useF2(renomear, selectedIds, ['folder'])

  const { pedirExclusao, requestDelete, dialogs: deleteDialogs } = useExcluirSelecao({
    selecionados: selectedIds,
    itemDe: (chave) => data?.folders?.find((f) => `folder:${f.id}` === chave),
    onExcluido: () => {
      limparSelecao()
      refresh()
    },
  })

  // Mover algo pela sidebar pode ter tirado (ou trazido) uma pasta daqui.
  useListenerDeJanela('notefy:moved', refetch)

  // `&& !data`: um refetch não troca a página pelo esqueleto.
  if (loading && !data) {
    return (
      <PageBody>
        <ListSkeleton rows={4} />
      </PageBody>
    )
  }

  if (error && !data) {
    return (
      <PageBody>
        <ErrorState message={error} onRetry={refetch} />
      </PageBody>
    )
  }

  const { category, folders = [] } = data ?? {}
  const target = { type: 'category', id }

  const handleFolderClick = (folder, event) =>
    handleClick(`folder:${folder.id}`, event, () => navigate(`/folders/${folder.id}`))

  const handleContextMenu = (folder, event) => {
    event.preventDefault()
    const quantos = selecionarParaMenu(`folder:${folder.id}`)
    openMenu(event, { folder, isMultiple: quantos > 1 })
  }

  const folderMenu = (payload) => {
    const { folder, isMultiple } = payload

    if (isMultiple) {
      return [
        {
          label: t('Exportar ({length}) como .zip', { length: selectedIds.length }),
          icon: Download,
          onClick: () => exportarSelecao(selectedIds),
        },
        { separator: true },
        {
          label: t('Excluir ({length} selecionadas)', { length: selectedIds.length }),
          icon: Trash2,
          danger: true,
          onClick: pedirExclusao,
        },
      ]
    }

    return itensDaPasta(folder, {
      navigate,
      novaSubpasta: () => setFolderModal({ parent: folder, categoryId: id }),
      renomear: () => renomear.abrir(folder.id),
      editar: () => setFolderModal({ folder, categoryId: id }),
      excluir: () => requestDelete({ kind: 'folder', id: folder.id, name: folder.name }),
      fimDoMenu,
    })
  }

  return (
    <div
      onDragOver={(event) => {
        // Sem preventDefault o navegador marca o drop como inválido e o
        // onDrop nunca dispara. O realce ficou de fora de propósito: a
        // página inteira como "zona" confundia o gesto.
        if (hasItemPayload(event)) event.preventDefault()
      }}
      onDrop={async (event) => {
        const payload = readDragPayload(event)
        if (!canDrop(payload, target)) return
        event.preventDefault()
        await api.post(`/folders/${payload.id}/move/`, { category: id })
        refetch()
        refresh()
      }}
      className="min-h-full pb-20"
    >
      <PageHeader
        title={category?.name}
        subtitle={category?.description || t('{length} pasta(s) nesta categoria.', { length: folders.length })}
        breadcrumb={
          <nav className="mb-2 flex items-center gap-1 text-xs text-ink-400">
            <Link to="/" className="hover:text-ink-700 dark:hover:text-ink-200">
              {t('Início')}
            </Link>
            <ChevronRight size={11} />
            {/* Termina no lugar atual, como o da pasta: "Categorias" não é uma tela. */}
            <span className="text-ink-500 dark:text-ink-300">{category?.name}</span>
          </nav>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={Pencil}
              onClick={() => setCategoryModal(true)}
            >
              {t('Editar')}
            </Button>
            <Button
              size="sm"
              icon={FolderPlus}
              onClick={() => setFolderModal({ parent: null, categoryId: id })}
            >
              {t('Nova pasta')}
            </Button>
          </>
        }
      />

      <PageBody>
        {folders.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((folder) => {
              const selecionada = isSelected(`folder:${folder.id}`)
              return (
                <PastaCard
                  key={folder.id}
                  pasta={folder}
                  selecionada={selecionada}
                  renomear={renomear}
                  arraste={{ type: 'folder', id: folder.id, title: folder.name, parentId: null, categoryId: id, isRoot: true }}
                  onClickCapture={(e) => handleFolderClick(folder, e)}
                  onContextMenu={(e) => handleContextMenu(folder, e)}
                  onFavoritou={refresh}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={FolderOpen}
            title={t('Nenhuma pasta nesta categoria')}
            description={t('Crie uma pasta para começar a guardar notas, arquivos, planilhas, diagramas, canvas e designs aqui.')}
            action={
              <Button
                icon={FolderPlus}
                onClick={() => setFolderModal({ parent: null, categoryId: id })}
              >
                {t('Criar pasta')}
              </Button>
            }
          />
        )}
      </PageBody>

      <BarraDeSelecao
        total={selectedIds.length}
        rotulo={t(selectedIds.length === 1 ? '1 selecionada' : '{n} selecionadas', { n: selectedIds.length })}
        onExcluir={pedirExclusao}
        onLimpar={limparSelecao}
      />

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? folderMenu(menu.payload) : []}
      />

      <FolderFormModal
        open={!!folderModal}
        folder={folderModal?.folder}
        parent={folderModal?.parent}
        categoryId={folderModal?.categoryId}
        onClose={() => setFolderModal(null)}
        onSaved={() => {
          setFolderModal(null)
          refetch()
          refresh()
        }}
      />

      <CategoryFormModal
        open={categoryModal}
        category={category}
        onClose={() => setCategoryModal(false)}
        onSaved={() => {
          setCategoryModal(false)
          refetch()
          refresh()
        }}
      />

      {deleteDialogs}
    </div>
  )
}
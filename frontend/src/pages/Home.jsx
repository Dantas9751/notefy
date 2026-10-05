import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CheckSquare,
  Crop,
  FolderOpen,
  FolderPlus,
  Layers,
  LayoutGrid,
  List,
  Plus,
  Rows3,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useCascadeDelete } from '@/hooks/useCascadeDelete'
import { usePreferencias } from '@/hooks/usePreferencias'
import { useRenomear } from '@/hooks/useRenomear'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { usePropriedadesNoMenu } from '@/context/PropriedadesContext'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import FolderFormModal from '@/components/modals/FolderFormModal'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import Bloco, { Abas } from '@/components/inicio/Bloco'
import Capa, { BotaoDaCapa, enviarCapa } from '@/components/inicio/Capa'
import ItensDoInicio from '@/components/inicio/ItensDoInicio'
import BlocoTarefas from '@/components/inicio/BlocoTarefas'
import BlocoAgenda from '@/components/inicio/BlocoAgenda'
import BlocoRascunho from '@/components/inicio/BlocoRascunho'
import BlocoArquivos from '@/components/inicio/BlocoArquivos'
import PersonalizarInicio from '@/components/inicio/PersonalizarInicio'
import { DOCUMENT_KINDS } from '@/lib/documents'
import { LAYOUTS_DE_ITENS, layoutDoInicio } from '@/lib/inicio'
import { cn } from '@/lib/utils'
import { ICONE } from '@/lib/ui'
import { idioma, t } from '@/lib/i18n'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return t('Bom dia')
  if (hour < 18) return t('Boa tarde')
  return t('Boa noite')
}

/**
 * Um número do painel.
 *
 * O ícone fica no RÓTULO, não numa caixa colorida acima do número: o
 * painel de quatro cartões com ícone dentro de um quadradinho é o que
 * todo gerador de interface produz.
 */
function Numero({ icon: Icon, label, value, to, onClick }) {
  const conteudo = (
    <>
      <p
        className={cn(
          'font-serif text-numero tabular-nums text-ink-900 transition dark:text-ink-50',
          (to || onClick) && 'group-hover:text-accent-700 dark:group-hover:text-accent-400',
        )}
      >
        {value ?? '—'}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500 dark:text-ink-400">
        <Icon size={ICONE.sm} className="shrink-0" />
        {label}
      </p>
    </>
  )
  // Número sem destino é só número: um link para a própria página parecia
  // clicável e não levava a lugar nenhum.
  if (to) return <Link to={to} className="group block">{conteudo}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="group block text-left">{conteudo}</button>
  return <div>{conteudo}</div>
}

/** Cartão de categoria com suporte a seleção e clique direito. */
function CategoryCard({ category, isSelected, onClickCapture, onContextMenu, indice = 0 }) {
  const folders = category.folders ?? []
  const preview = folders.slice(0, 4)

  return (
    <Link
      to={`/categories/${category.id}`}
      // Captura: o handler precisa barrar Shift/Ctrl ANTES do router e do
      // browser resolverem o clique, senão a categoria abre em outra aba.
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      style={{ '--i': indice }}
      className={cn(
        'entra group block px-2 py-3 transition',
        isSelected ? 'bg-accent-100 dark:bg-accent-500/25' : 'hover:bg-ink-100/60 dark:hover:bg-ink-800/40',
      )}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
        <h3 className="titulo min-w-0 flex-1 truncate text-[15px]">{category.name}</h3>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{category.document_count}</span>
      </div>
      <p className="mt-1 truncate pl-[18px] text-[12px] text-ink-500 dark:text-ink-400">
        {folders.length === 0 ? (
          <span className="text-ink-400">{t('sem pastas')}</span>
        ) : (
          <>
            {preview.map((f) => f.name).join(' · ')}
            {folders.length > preview.length && ` · +${folders.length - preview.length}`}
          </>
        )}
      </p>
    </Link>
  )
}

const ICONES_DE_LAYOUT = { cartoes: LayoutGrid, pilha: Rows3, lista: List }
const QUANTOS = { cartoes: 6, pilha: 5, lista: 8 }

/**
 * Início — painel e porta de entrada da hierarquia.
 *
 * Montado em blocos, como a tela inicial do Evernote: capa com a saudação
 * e, embaixo, o que a pessoa escolher ver — itens recentes ou com estrela
 * (em cartões, pilha ou lista), tarefas para marcar, a agenda do dia, um
 * bloco de rascunho, os arquivos que chegaram por último e as categorias.
 * "Personalizar" decide quais, em que ordem e com que largura; fica salvo
 * na conta (`home_layout`).
 */
export default function Home() {
  const { user } = useAuth()
  const { categories, loading, refresh } = useWorkspace()
  const navigate = useNavigate()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const fimDoMenu = usePropriedadesNoMenu()
  const { prefs, salvar } = usePreferencias()
  const layout = layoutDoInicio(prefs.home_layout)

  const [categoryModal, setCategoryModal] = useState(false)
  const [folderModal, setFolderModal] = useState(null)
  const [personalizando, setPersonalizando] = useState(false)
  const [recortando, setRecortando] = useState(false)

  const [selectedIds, setSelectedIds] = useState([])
  const [actionError, setActionError] = useState(null)
  const lastSelectedId = useRef(null)

  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)

  const stats = useFetch('/documents/stats/')
  const recent = useFetch('/documents/recent/')
  const favoritos = useFetch('/documents/', {
    params: { is_favorite: true, ordering: '-updated_at', page_size: 12 },
    enabled: layout.aba_notas === 'favoritos',
  })
  const tarefasAbertas = useFetch('/tasks/', { params: { open: true, page_size: 1 } })

  const itens = layout.aba_notas === 'favoritos' ? favoritos.data?.results ?? [] : recent.data ?? []
  const fonteDosItens = layout.aba_notas === 'favoritos' ? favoritos : recent
  const itensVisiveis = itens.slice(0, QUANTOS[layout.itens])

  const recarregarItens = () => {
    recent.refetch()
    if (layout.aba_notas === 'favoritos') favoritos.refetch()
  }

  const renomear = useRenomear({ onRenamed: recarregarItens })
  const { buildMenu, dialogs: docActionDialogs } = useDocumentActions({
    onChanged: recarregarItens,
    onRename: (doc) => renomear.abrir(doc.id),
  })

  const { requestDelete, dialogs: deleteDialogs } = useCascadeDelete({
    onDeleted: () => {
      setSelectedIds([])
      stats.refetch()
      recarregarItens()
      refresh()
    },
    onError: setActionError,
  })

  /** Muda o layout na hora e grava na conta. */
  const mudarLayout = (patch) => {
    salvar({ home_layout: { ...layout, ...patch } }).catch((err) => setActionError(extractError(err)))
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedIds([])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const onChanged = () => {
      stats.refetch()
      recent.refetch()
      tarefasAbertas.refetch()
      refresh()
    }
    // `task-changed` junto: o painel mostra "Tarefas abertas". Concluir uma
    // tarefa no Quadro (ou no bloco de tarefas) muda o número.
    const eventos = ['notefy:moved', 'notefy:task-changed']
    eventos.forEach((e) => window.addEventListener(e, onChanged))
    return () => eventos.forEach((e) => window.removeEventListener(e, onChanged))
  }, [stats.refetch, recent.refetch, tarefasAbertas.refetch, refresh])

  /* ------------------------------------------------------------------ */
  /* Cliques e multi-seleção                                            */
  /* ------------------------------------------------------------------ */
  const handleItemClick = (itemType, itemId, event) => {
    const uniqueKey = `${itemType}:${itemId}`

    // No toque, com a seleção aberta, o toque soma ou tira (ver useMultiSelect).
    const tocandoNaSelecao = event.nativeEvent?.pointerType === 'touch' && selectedIds.length > 0

    if (event.ctrlKey || event.metaKey || tocandoNaSelecao) {
      event.preventDefault()
      event.stopPropagation()
      setSelectedIds((prev) => (prev.includes(uniqueKey) ? prev.filter((i) => i !== uniqueKey) : [...prev, uniqueKey]))
      lastSelectedId.current = uniqueKey
      return
    }

    // Shift marca o intervalo, dentro da mesma lista.
    if (event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      const lista =
        itemType === 'category'
          ? (categories ?? []).map((c) => `category:${c.id}`)
          : itensVisiveis.map((d) => `document:${d.id}`)
      const de = lista.indexOf(lastSelectedId.current)
      const ate = lista.indexOf(uniqueKey)
      if (de === -1 || ate === -1) {
        setSelectedIds([uniqueKey])
      } else {
        const faixa = lista.slice(Math.min(de, ate), Math.max(de, ate) + 1)
        setSelectedIds((prev) => Array.from(new Set([...prev, ...faixa])))
      }
      lastSelectedId.current = uniqueKey
      return
    }

    setSelectedIds([uniqueKey])
    lastSelectedId.current = uniqueKey
  }

  const handleContextMenu = (itemType, item, event) => {
    event.preventDefault()
    const uniqueKey = `${itemType}:${item.id}`

    let currentSelected = selectedIds
    if (!selectedIds.includes(uniqueKey)) {
      currentSelected = [uniqueKey]
      setSelectedIds([uniqueKey])
      lastSelectedId.current = uniqueKey
    }

    const payload = itemType === 'category' ? { type: 'category', category: item } : { type: 'document', document: item }
    openMenu(event, { ...payload, isMultiple: currentSelected.length > 1 })
  }

  /* ------------------------------------------------------------------ */
  /* Exclusão                                                            */
  /* ------------------------------------------------------------------ */
  const deleteOne = async (selectionKey) => {
    const [itemType, itemId] = selectionKey.split(':')
    const endpoint = itemType === 'category' ? `/categories/${itemId}/` : `/documents/${itemId}/`

    try {
      await api.delete(endpoint)
    } catch (err) {
      if (err.response?.status === 404) return
      try {
        await api.delete(`${endpoint}?force=true`)
      } catch (forceErr) {
        if (forceErr.response?.status === 404) return
        throw forceErr
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    const idsToDelete = [...selectedIds]
    setActionError(null)
    try {
      for (const selectionKey of idsToDelete) {
        await deleteOne(selectionKey)
      }
    } catch (err) {
      setActionError(extractError(err))
    } finally {
      setSelectedIds([])
      lastSelectedId.current = null
      setBulkDeleteModalOpen(false)
      stats.refetch()
      recarregarItens()
      refresh()
    }
  }

  const handleBulkDeleteWithDialog = () => {
    if (selectedIds.length === 0) return
    if (selectedIds.length === 1) {
      const [itemType, itemId] = selectedIds[0].split(':')
      if (itemType === 'category') {
        const cat = categories.find((c) => String(c.id) === String(itemId))
        if (cat) {
          setActionError(null)
          requestDelete({ kind: 'category', id: cat.id, name: cat.name })
          return
        }
      } else if (itemType === 'document') {
        const doc = itens.find((d) => String(d.id) === String(itemId))
        if (doc) {
          setActionError(null)
          requestDelete({ kind: 'document', id: doc.id, name: doc.title })
          return
        }
      }
    }
    setBulkDeleteModalOpen(true)
  }

  const firstName = (user?.full_name || user?.username || '').split(' ')[0]
  const saudacao = `${greeting()}${firstName ? `, ${firstName}` : ''}`
  const byKind = stats.data?.by_kind ?? {}
  const totalFolders = categories.reduce((sum, c) => sum + (c.folder_count ?? 0), 0)

  /* ------------------------------------------------------------------ */
  /* Blocos                                                              */
  /* ------------------------------------------------------------------ */
  const largura = (b) => (b.largura === 'inteira' ? 'lg:col-span-2' : '')
  // As categorias (e as pastas delas) moram no bloco de categorias do próprio
  // Início; escondido o bloco, os números ficam só números.
  const categoriasVisiveis = layout.blocos.some((b) => b.id === 'categorias' && b.visivel)
  const irParaCategorias = categoriasVisiveis
    ? () => document.getElementById('bloco-categorias')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    : undefined

  const blocos = {
    resumo: (b) => (
      <Bloco key={b.id} titulo={t('Resumo')} icon={BarChart3} className={largura(b)}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Numero icon={Layers} label={t('Itens no total')} value={stats.data?.total} to="/recent" />
          <Numero icon={Tag} label={t('Categorias')} value={categories.length} onClick={irParaCategorias} />
          <Numero icon={FolderOpen} label={t('Pastas')} value={totalFolders} onClick={irParaCategorias} />
          <Numero icon={CheckSquare} label={t('Tarefas abertas')} value={tarefasAbertas.data?.count} to="/board" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {Object.entries(DOCUMENT_KINDS).map(([kind, meta]) => {
            const count = byKind[kind] ?? 0
            return (
              // `type` e não `kind`: é o nome que a busca lê da URL.
              <Link
                key={kind}
                to={`/search?type=${kind}`}
                title={t('Ver {valor}', { valor: meta.plural.toLowerCase() })}
                className={cn(
                  'group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                  count === 0
                    ? 'border-ink-200 text-ink-400 dark:border-ink-800 dark:text-ink-500'
                    : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-900 dark:border-ink-700 dark:text-ink-300 dark:hover:border-ink-600 dark:hover:text-ink-50',
                )}
              >
                <meta.icon
                  size={ICONE.sm}
                  className="shrink-0 self-center transition group-hover:scale-110"
                  style={{ color: count === 0 ? undefined : meta.accent }}
                />
                <span className="font-medium tabular-nums">{count}</span>
                <span>{count === 1 ? meta.label : meta.plural}</span>
              </Link>
            )
          })}
        </div>
      </Bloco>
    ),

    notas: (b) => (
      <Bloco
        key={b.id}
        titulo={layout.aba_notas === 'favoritos' ? t('Com estrela') : t('Mexidos recentemente')}
        icon={Layers}
        className={largura(b)}
        acoes={
          <>
            <Abas
              valor={layout.aba_notas}
              rotulo={t('Quais itens')}
              onTrocar={(aba) => mudarLayout({ aba_notas: aba })}
              opcoes={[
                { id: 'recentes', nome: t('Recentes') },
                { id: 'favoritos', nome: t('Favoritos') },
              ]}
            />
            {/* O desenho dos itens, direto no bloco: mudar e ver na hora. */}
            <div className="ml-1 flex" role="radiogroup" aria-label={t('Desenho dos itens')}>
              {LAYOUTS_DE_ITENS.map((l) => {
                const Icone = ICONES_DE_LAYOUT[l.id]
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={layout.itens === l.id}
                    title={l.nome}
                    aria-label={l.nome}
                    onClick={() => mudarLayout({ itens: l.id })}
                    className={cn(
                      'rounded p-1 transition [@media(pointer:coarse)]:p-2',
                      layout.itens === l.id
                        ? 'bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-50'
                        : 'text-ink-400 hover:text-ink-700 dark:hover:text-ink-200',
                    )}
                  >
                    <Icone size={14} />
                  </button>
                )
              })}
            </div>
          </>
        }
      >
        {fonteDosItens.loading && !fonteDosItens.data ? (
          <ListSkeleton rows={3} />
        ) : fonteDosItens.error ? (
          <ErrorState message={fonteDosItens.error} onRetry={fonteDosItens.refetch} />
        ) : itensVisiveis.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-400">
            {layout.aba_notas === 'favoritos'
              ? t('Nada com estrela ainda. Clique na estrela de um item para ele aparecer aqui.')
              : t('Nada por aqui ainda. Crie uma nota pelo botão Criar.')}
          </p>
        ) : (
          <>
            <ItensDoInicio
              itens={itensVisiveis}
              layout={layout.itens}
              selecionados={selectedIds}
              renomear={renomear}
              onClickCapture={(doc, e) => handleItemClick('document', doc.id, e)}
              onContextMenu={(doc, e) => handleContextMenu('document', doc, e)}
            />
            {layout.aba_notas === 'recentes' && (
              <div className="mt-3 text-right">
                <Link to="/recent" className="text-xs text-ink-500 underline-offset-2 hover:underline dark:text-ink-400">
                  {t('Ver todos')}
                </Link>
              </div>
            )}
          </>
        )}
      </Bloco>
    ),

    tarefas: (b) => <BlocoTarefas key={b.id} className={largura(b)} />,
    agenda: (b) => <BlocoAgenda key={b.id} className={largura(b)} />,
    rascunho: (b) => <BlocoRascunho key={b.id} className={largura(b)} />,
    arquivos: (b) => (
      <BlocoArquivos
        key={b.id}
        className={largura(b)}
        aba={layout.aba_arquivos}
        onTrocarAba={(aba) => mudarLayout({ aba_arquivos: aba })}
      />
    ),

    categorias: (b) => (
      <Bloco
        key={b.id}
        id="bloco-categorias"
        titulo={t('Categorias')}
        icon={Tag}
        className={cn('scroll-mt-4', largura(b))}
        acoes={
          <button
            type="button"
            onClick={() => setCategoryModal(true)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100"
          >
            <Plus size={12} />
            {t('Nova categoria')}
          </button>
        }
      >
        {loading ? (
          <ListSkeleton rows={2} />
        ) : categories.length ? (
          <div className="rows -mx-2">
            {categories.map((category, i) => (
              <CategoryCard
                key={category.id}
                indice={i}
                category={category}
                isSelected={selectedIds.includes(`category:${category.id}`)}
                onClickCapture={(e) => handleItemClick('category', category.id, e)}
                onContextMenu={(e) => handleContextMenu('category', category, e)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Tag}
            title={t('Comece criando uma categoria')}
            description={t('Tudo no Notefy mora dentro de uma categoria: ela guarda pastas, e as pastas guardam suas notas, arquivos, planilhas, diagramas e canvas.')}
            action={
              <Button icon={Plus} onClick={() => setCategoryModal(true)}>
                {t('Criar categoria')}
              </Button>
            }
          />
        )}
      </Bloco>
    ),
  }

  /** Foto nova na capa (dos arquivos, do computador ou arrastada): vale na hora e já abre o recorte. */
  const usarFoto = (url) => {
    mudarLayout({ capa: { tipo: 'imagem', url } })
    setPersonalizando(false)
    setRecortando(true)
  }
  const usarFotoNaCapa = async (arquivo) => {
    setActionError(null)
    try {
      usarFoto(await enviarCapa(arquivo))
    } catch (err) {
      setActionError(extractError(err))
    }
  }

  const acoesDoTopo = (naCapa, escuro = false) =>
    naCapa ? (
      <>
        {layout.capa.tipo === 'imagem' && (
          <BotaoDaCapa icon={Crop} escuro={escuro} onClick={() => setRecortando(true)} aria-label={t('Recortar')}>
            <span className="max-sm:hidden">{t('Recortar')}</span>
          </BotaoDaCapa>
        )}
        <BotaoDaCapa icon={SlidersHorizontal} escuro={escuro} onClick={() => setPersonalizando(true)} aria-label={t('Personalizar')}>
          <span className="max-sm:hidden">{t('Personalizar')}</span>
        </BotaoDaCapa>
        <BotaoDaCapa icon={Plus} escuro={escuro} onClick={() => setCategoryModal(true)} aria-label={t('Nova categoria')}>
          <span className="max-sm:hidden">{t('Nova categoria')}</span>
        </BotaoDaCapa>
      </>
    ) : (
      <>
        <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setPersonalizando(true)}>
          {t('Personalizar')}
        </Button>
        <Button size="sm" icon={Plus} onClick={() => setCategoryModal(true)}>
          {t('Nova categoria')}
        </Button>
      </>
    )

  return (
    <div className="pb-24">
      {layout.capa.tipo === 'nenhuma' ? (
        <PageHeader title={saudacao} actions={acoesDoTopo(false)} />
      ) : (
        <Capa
          capa={layout.capa}
          saudacao={saudacao}
          data={new Date().toLocaleDateString(idioma, { weekday: 'long', day: 'numeric', month: 'long' })}
          acoes={(escuro) => acoesDoTopo(true, escuro)}
          onSoltarImagem={usarFotoNaCapa}
          recortando={recortando && layout.capa.tipo === 'imagem'}
          onSalvarRecorte={(recorte) => {
            mudarLayout({ capa: { ...layout.capa, ...recorte } })
            setRecortando(false)
          }}
          onCancelarRecorte={() => setRecortando(false)}
        />
      )}

      <PageBody>
        {actionError && (
          <div className="mb-4">
            <ErrorState message={actionError} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {layout.blocos.filter((b) => b.visivel).map((b) => blocos[b.id]?.(b))}
        </div>

        {layout.blocos.every((b) => !b.visivel) && (
          <p className="py-16 text-center text-sm text-ink-400">
            {t('Todos os blocos estão escondidos.')}{' '}
            <button type="button" onClick={() => setPersonalizando(true)} className="underline underline-offset-2">
              {t('Personalizar')}
            </button>
          </p>
        )}
      </PageBody>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 animate-slide-up items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 text-white shadow-xl dark:bg-ink-800">
          <span className="text-xs font-medium">
            {selectedIds.length} {t('selecionado(s)')}
          </span>
          <div className="h-4 w-px bg-ink-700" />
          <button
            onClick={handleBulkDeleteWithDialog}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/20"
          >
            <Trash2 size={14} /> {t('Excluir')}
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="rounded p-1 text-ink-400 transition hover:text-white"
            title={t('Limpar seleção')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload?.isMultiple
            ? [
                {
                  label: t('Excluir ({length} selecionados)', { length: selectedIds.length }),
                  icon: Trash2,
                  danger: true,
                  onClick: handleBulkDeleteWithDialog,
                },
              ]
            : menu?.payload?.type === 'category'
              ? [
                  {
                    label: t('Nova pasta'),
                    icon: FolderPlus,
                    onClick: () => setFolderModal({ categoryId: menu.payload.category.id }),
                  },
                  { separator: true },
                  {
                    label: t('Excluir'),
                    icon: Trash2,
                    danger: true,
                    onClick: () => {
                      setActionError(null)
                      requestDelete({ kind: 'category', id: menu.payload.category.id, name: menu.payload.category.name })
                    },
                  },
                  ...fimDoMenu('categoria', menu.payload.category.id),
                ]
              : menu?.payload?.document
                ? buildMenu(menu.payload.document)
                : []
        }
      />

      {deleteDialogs}
      {docActionDialogs}

      <PersonalizarInicio
        open={personalizando}
        onClose={() => setPersonalizando(false)}
        layout={layout}
        onMudar={mudarLayout}
        onEnviarFoto={usarFotoNaCapa}
        onEscolherFoto={usarFoto}
        onRecortar={() => {
          setPersonalizando(false)
          setRecortando(true)
        }}
        onRestaurar={() => salvar({ home_layout: {} }).catch((err) => setActionError(extractError(err)))}
      />

      <ConfirmDialog
        open={bulkDeleteModalOpen}
        onClose={() => setBulkDeleteModalOpen(false)}
        title={t('Excluir itens selecionados')}
        message={t('{n} itens vão para a lixeira, junto com o que houver dentro deles.', { n: selectedIds.length })}
        confirmLabel={t('Excluir {n} itens', { n: selectedIds.length })}
        onConfirm={handleBulkDelete}
      />

      <CategoryFormModal
        open={categoryModal}
        onClose={() => setCategoryModal(false)}
        onSaved={(category) => {
          setCategoryModal(false)
          refresh()
          if (category?.id) navigate(`/categories/${category.id}`)
        }}
      />

      <FolderFormModal
        open={!!folderModal}
        categoryId={folderModal?.categoryId}
        onClose={() => setFolderModal(null)}
        onSaved={async (newFolder) => {
          setFolderModal(null)
          await refresh()
          if (newFolder?.id) navigate(`/folders/${newFolder.id}`)
        }}
      />
    </div>
  )
}

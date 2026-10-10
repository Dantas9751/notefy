import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CheckSquare,
  Clock,
  Crop,
  Download,
  FolderOpen,
  Layers,
  Plus,
  SlidersHorizontal,
  Tag,
  Trash2,
} from 'lucide-react'
import { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { useExcluirSelecao } from '@/hooks/useCascadeDelete'
import { useMultiSelect } from '@/hooks/useMultiSelect'
import { exportarSelecao } from '@/components/ExportMenu'
import { avisarErro } from '@/lib/avisoFlutuante'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { usePreferencias } from '@/hooks/usePreferencias'
import { CampoDeRenomear, useF2, useRenomear } from '@/hooks/useRenomear'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { BarraDeSelecao, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { usePropriedadesNoMenu } from '@/context/PropriedadesContext'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import { itensDaCategoria } from '@/components/layout/menusDaArvore'
import FolderFormModal from '@/components/modals/FolderFormModal'
import Bloco, { Abas } from '@/components/inicio/Bloco'
import Capa, { BotaoDaCapa, enviarCapa, fundoDaCapa } from '@/components/inicio/Capa'
import BlocoRelogio from '@/components/inicio/BlocoRelogio'
import { urlDeMedia } from '@/lib/fileMedia'
import ItensDoInicio from '@/components/inicio/ItensDoInicio'
import BlocoTarefas from '@/components/inicio/BlocoTarefas'
import BlocoAgenda from '@/components/inicio/BlocoAgenda'
import BlocoRascunho from '@/components/inicio/BlocoRascunho'
import BlocoArquivos from '@/components/inicio/BlocoArquivos'
import PersonalizarInicio from '@/components/inicio/PersonalizarInicio'
import GradeDoInicio from '@/components/inicio/GradeDoInicio'
import { DOCUMENT_KINDS } from '@/lib/documents'
import { blocosParaSalvar, layoutDoInicio } from '@/lib/inicio'
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
function CategoryCard({ category, isSelected, renomear, onClickCapture, onContextMenu, indice = 0 }) {
  const folders = category.folders ?? []
  const preview = folders.slice(0, 4)
  const renomeando = renomear.estaEditando(category.id)
  // Renomeando, o cartão deixa de ser link: clicar no campo para mexer no
  // cursor seguiria o link e abriria a categoria.
  const Raiz = renomeando ? 'div' : Link

  return (
    <Raiz
      to={renomeando ? undefined : `/categories/${category.id}`}
      // Captura: o handler precisa barrar Shift/Ctrl ANTES do router e do
      // browser resolverem o clique, senão a categoria abre em outra aba.
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      // Duplo clique renomeia o que já está selecionado, como nos cartões.
      onDoubleClick={(event) => {
        if (!isSelected) return
        event.preventDefault()
        renomear.abrir(category.id)
      }}
      style={{ '--i': indice }}
      className={cn(
        'entra group block px-2 py-3 transition',
        isSelected ? 'bg-accent-100 dark:bg-accent-500/25' : 'hover:bg-ink-100/60 dark:hover:bg-ink-800/40',
      )}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
        {renomeando ? (
          <CampoDeRenomear
            renomear={renomear}
            valorAtual={category.name}
            endpoint={`/categories/${category.id}/`}
            className="titulo text-[15px]"
          />
        ) : (
          <h3 className="titulo min-w-0 flex-1 truncate text-[15px]">{category.name}</h3>
        )}
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
    </Raiz>
  )
}


/**
 * Início — painel e porta de entrada da hierarquia.
 *
 * Montado em blocos, como a tela inicial do Evernote: capa com a saudação
 * e, embaixo, o que a pessoa escolher ver — itens recentes ou com estrela
 * (em cartões, pilha ou lista), tarefas para marcar, a agenda do dia, um
 * bloco de rascunho, os arquivos que chegaram por último e as categorias.
 * Os blocos se arrumam DIRETO na página: arrastar pelo título muda a
 * ordem, o canto muda o tamanho (`GradeDoInicio`); "Personalizar" fica com
 * a capa e o desenho dos itens. Tudo vai para a conta (`home_layout`).
 */
export default function Home() {
  const { user } = useAuth()
  const { categories, loading, refresh } = useWorkspace()
  const navigate = useNavigate()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const fimDoMenu = usePropriedadesNoMenu()
  const { prefs, salvar } = usePreferencias()
  const layout = layoutDoInicio(prefs.home_layout)

  const [categoryModal, setCategoryModal] = useState(null)
  const [folderModal, setFolderModal] = useState(null)
  const [personalizando, setPersonalizando] = useState(false)
  const [recortando, setRecortando] = useState(false)

  const stats = useFetch('/documents/stats/')
  const recent = useFetch('/documents/recent/')
  const favoritos = useFetch('/documents/', {
    params: { is_favorite: true, ordering: '-updated_at', page_size: 12 },
    enabled: layout.aba_notas === 'favoritos',
  })
  const tarefasAbertas = useFetch('/tasks/', { params: { open: true, page_size: 1 } })

  const itens = layout.aba_notas === 'favoritos' ? favoritos.data?.results ?? [] : recent.data ?? []
  const fonteDosItens = layout.aba_notas === 'favoritos' ? favoritos : recent
  const itensVisiveis = itens.slice(0, 12)

  // A mesma seleção das outras listas: categorias e itens na ordem em que a
  // tela os desenha, que é o que dá sentido ao intervalo do Shift.
  const {
    selected: selectedIds,
    clear: limparSelecao,
    handleClick,
    handleContextMenu: selecionarParaMenu,
  } = useMultiSelect([...categories.map((c) => `category:${c.id}`), ...itensVisiveis.map((d) => `document:${d.id}`)])

  const recarregarItens = () => {
    recent.refetch()
    if (layout.aba_notas === 'favoritos') favoritos.refetch()
  }

  const renomear = useRenomear({ onRenamed: recarregarItens })
  useF2(renomear, selectedIds, ['document', 'category'])
  const { buildMenu, dialogs: docActionDialogs } = useDocumentActions({
    onChanged: recarregarItens,
    onRename: (doc) => renomear.abrir(doc.id),
  })

  // Números e lista recarregam pelo `notefy:moved` que a exclusão anuncia.
  const { pedirExclusao, dialogs: deleteDialogs } = useExcluirSelecao({
    selecionados: selectedIds,
    itemDe: (chave) =>
      categories.find((c) => `category:${c.id}` === chave) ?? itens.find((d) => `document:${d.id}` === chave),
    onExcluido: limparSelecao,
  })

  /** Muda o layout na hora e grava na conta. */
  const mudarLayout = (patch) => {
    const proximo = { ...layout, ...patch }
    salvar({ home_layout: { ...proximo, blocos: blocosParaSalvar(proximo.blocos) } }).catch((err) =>
      avisarErro(extractError(err)),
    )
  }

  // `recarregarItens`, e não só os recentes: com a aba Favoritos à mostra,
  // excluir ou mover em outra tela deixava o cartão ali até recarregar.
  // `task-changed` junto: o painel mostra "Tarefas abertas", e concluir uma
  // tarefa no Quadro (ou no bloco de tarefas) muda o número.
  const aoMudarAlgo = () => {
    stats.refetch()
    recarregarItens()
    tarefasAbertas.refetch()
    refresh()
  }
  useListenerDeJanela('notefy:moved', aoMudarAlgo)
  useListenerDeJanela('notefy:task-changed', aoMudarAlgo)

  const abrirMenu = (tipo, item, event) => {
    event.preventDefault()
    const quantos = selecionarParaMenu(`${tipo}:${item.id}`)
    const payload = tipo === 'category' ? { type: 'category', category: item } : { type: 'document', document: item }
    openMenu(event, { ...payload, isMultiple: quantos > 1 })
  }

  const firstName = (user?.full_name || user?.username || '').split(' ')[0]
  const saudacao = `${greeting()}${firstName ? `, ${firstName}` : ''}`
  const byKind = stats.data?.by_kind ?? {}
  const totalFolders = categories.reduce((sum, c) => sum + (c.folder_count ?? 0), 0)

  /* ------------------------------------------------------------------ */
  /* Blocos                                                              */
  /* ------------------------------------------------------------------ */
  // As categorias (e as pastas delas) moram no bloco de categorias do próprio
  // Início; escondido o bloco, os números ficam só números.
  const categoriasVisiveis = layout.blocos.some((b) => b.id === 'categorias' && b.visivel)
  const irParaCategorias = categoriasVisiveis
    ? () => document.getElementById('bloco-categorias')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    : undefined

  const blocos = {
    resumo: (b) => (
      <Bloco key={b.id} titulo={t('Resumo')} icon={BarChart3}>
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
              selecionados={selectedIds}
              renomear={renomear}
              onClickCapture={(doc, e) => handleClick(`document:${doc.id}`, e)}
              onContextMenu={(doc, e) => abrirMenu('document', doc, e)}
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

    tarefas: (b) => <BlocoTarefas key={b.id} />,
    agenda: (b) => <BlocoAgenda key={b.id} />,
    rascunho: (b) => <BlocoRascunho key={b.id} />,
    relogio: (b) => (
      <Bloco key={b.id} titulo={t('Relógio')} icon={Clock} corpoClassName="relative p-0">
        <BlocoRelogio foto={layout.foto} />
      </Bloco>
    ),
    arquivos: (b) => (
      <BlocoArquivos
        key={b.id}
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
        className="scroll-mt-4"
        acoes={
          <button
            type="button"
            onClick={() => setCategoryModal({})}
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
                renomear={renomear}
                onClickCapture={(e) => handleClick(`category:${category.id}`, e)}
                onContextMenu={(e) => abrirMenu('category', category, e)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Tag}
            title={t('Comece criando uma categoria')}
            description={t('Tudo no Notefy mora dentro de uma categoria: ela guarda pastas, e as pastas guardam suas notas, arquivos, planilhas, diagramas e canvas.')}
            action={
              <Button icon={Plus} onClick={() => setCategoryModal({})}>
                {t('Criar categoria')}
              </Button>
            }
          />
        )}
      </Bloco>
    ),
  }

  /**
   * Foto nova (dos arquivos, do computador ou arrastada) na capa, no papel de
   * parede (`fundo`) ou no relógio (`foto`). Vale na hora; a da capa já abre
   * o recorte, que é feito na própria capa.
   */
  const usarFoto = (url, para = 'capa') => {
    mudarLayout({ [para]: { tipo: 'imagem', url } })
    if (para !== 'capa') return
    setPersonalizando(false)
    setRecortando(true)
  }
  const enviarFoto = async (arquivo, para = 'capa') => {
    try {
      usarFoto(await enviarCapa(arquivo, para), para)
    } catch (err) {
      avisarErro(extractError(err))
    }
  }
  const usarFotoNaCapa = (arquivo) => enviarFoto(arquivo, 'capa')

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
        <BotaoDaCapa icon={Plus} escuro={escuro} onClick={() => setCategoryModal({})} aria-label={t('Nova categoria')}>
          <span className="max-sm:hidden">{t('Nova categoria')}</span>
        </BotaoDaCapa>
      </>
    ) : (
      <>
        <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setPersonalizando(true)}>
          {t('Personalizar')}
        </Button>
        <Button size="sm" icon={Plus} onClick={() => setCategoryModal({})}>
          {t('Nova categoria')}
        </Button>
      </>
    )

  // O papel de parede fica parado enquanto a página rola (`fixed`): é o fundo
  // da janela, e não uma imagem esticada até a altura de todos os blocos.
  const fundo = layout.fundo
  const papelDeParede =
    fundo.tipo === 'imagem'
      ? { backgroundImage: `url("${urlDeMedia(fundo.url)}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
      : fundo.tipo === 'gradiente'
        ? { background: fundoDaCapa(fundo), backgroundAttachment: 'fixed' }
        : undefined

  return (
    <div className="relative min-h-full pb-24" style={papelDeParede}>
      {/* Véu da cor da página sobre o papel de parede: o que fica entre os
          blocos (títulos soltos, vãos) continua legível em claro e escuro. */}
      {papelDeParede && <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/35 dark:bg-ink-950/45" />}
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

      <PageBody className="relative">
        <GradeDoInicio
          blocos={layout.blocos}
          renderizar={(b) => blocos[b.id]?.(b)}
          onMudar={(novos) => mudarLayout({ blocos: novos })}
        />
      </PageBody>

      <BarraDeSelecao total={selectedIds.length} onExcluir={pedirExclusao} onLimpar={limparSelecao} />

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu?.payload?.isMultiple
            ? [
                {
                  label: t('Exportar ({length}) como .zip', { length: selectedIds.length }),
                  icon: Download,
                  onClick: () => exportarSelecao(selectedIds),
                },
                { separator: true },
                {
                  label: t('Excluir ({length} selecionados)', { length: selectedIds.length }),
                  icon: Trash2,
                  danger: true,
                  onClick: pedirExclusao,
                },
              ]
            : menu?.payload?.type === 'category'
              ? itensDaCategoria(menu.payload.category, {
                  navigate,
                  novaPasta: () => setFolderModal({ categoryId: menu.payload.category.id }),
                  renomear: () => renomear.abrir(menu.payload.category.id),
                  editar: () => setCategoryModal({ category: menu.payload.category }),
                  // O menu já marcou a categoria: é o mesmo Excluir da seleção.
                  excluir: pedirExclusao,
                  fimDoMenu,
                })
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
        onEnviarFoto={enviarFoto}
        onEscolherFoto={usarFoto}
        onRecortar={() => {
          setPersonalizando(false)
          setRecortando(true)
        }}
        onRestaurar={() => salvar({ home_layout: {} }).catch((err) => avisarErro(extractError(err)))}
      />

      <CategoryFormModal
        open={!!categoryModal}
        category={categoryModal?.category}
        onClose={() => setCategoryModal(null)}
        onSaved={(category) => {
          setCategoryModal(null)
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

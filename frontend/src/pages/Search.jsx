import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { CheckSquare, Download, Folder as FolderIcon, SearchX, Trash2, X, ExternalLink, Sparkles } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useDebounced, useFetch } from '@/hooks/useFetch'
import { useExcluirSelecao } from '@/hooks/useCascadeDelete'
import { avisarErro } from '@/lib/avisoFlutuante'
import { useMultiSelect } from '@/hooks/useMultiSelect'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { CampoDeRenomear, useF2, useRenomear } from '@/hooks/useRenomear'
import { useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { BarraDeSelecao, Badge, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { usePropriedadesNoMenu } from '@/context/PropriedadesContext'
import { runIA } from '@/lib/ai'
import FilterBar from '@/components/filters/FilterBar'
import { exportarSelecao } from '@/components/ExportMenu'
import { DOCUMENT_KINDS } from '@/lib/documents'
import { cn, formatRelative } from '@/lib/utils'
import { t } from '@/lib/i18n'
import { semMouse } from '@/lib/desktop'

const TYPE_META = {
  ...Object.fromEntries(
    Object.entries(DOCUMENT_KINDS).map(([kind, meta]) => [
      kind,
      { get label() { return meta.plural }, icon: meta.icon, accent: meta.accent },
    ]),
  ),
  folder: { get label() { return t('Pastas') }, icon: FolderIcon, accent: '#78716C' },
  task: { get label() { return t('Tarefas') }, icon: CheckSquare, accent: '#0EA5E9' },
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [types, setTypes] = useState(searchParams.getAll('type'))
  const [category, setCategory] = useState(searchParams.get('category') ?? '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') ?? '')
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') ?? '')

  // Contextos
  const { refresh } = useWorkspace()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const fimDoMenu = usePropriedadesNoMenu()


  const debouncedQuery = useDebounced(query, 350)

  // ----------------------------------------------------------------
  // Resposta da IA embutida na busca (Ctrl+Enter).
  //
  // Os trechos vêm dos resultados que já estão na tela: a IA responde
  // sobre o que VOCÊ tem, não sobre o mundo. Sem resultados não há
  // pergunta a fazer.
  // ----------------------------------------------------------------
  const [respostaIA, setRespostaIA] = useState(null)
  const [perguntandoIA, setPerguntandoIA] = useState(false)

  // Reflete o estado dos filtros na URL
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedQuery) next.set('q', debouncedQuery)
    types.forEach((tipo) => next.append('type', tipo))
    if (category) next.set('category', category)
    if (dateFrom) next.set('date_from', dateFrom)
    if (dateTo) next.set('date_to', dateTo)
    setSearchParams(next, { replace: true })
  }, [debouncedQuery, types, category, dateFrom, dateTo, setSearchParams])

  // Quanto a busca traz por tipo. O "carregar mais" sobe este número e
  // refaz a consulta — o servidor mescla os três tipos em memória, então
  // pedir a "próxima página" por tipo emendaria errado.
  const [limite, setLimite] = useState(20)

  const { data, loading, error, refetch } = useFetch('/search/', {
    params: {
      q: debouncedQuery || undefined,
      type: types.length ? types : undefined,
      category: category || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      limit: limite,
    },
  })

  // Trocar o termo ou o filtro recomeça do topo: manter um limite alto
  // de uma busca anterior faria a nova abrir com 200 resultados.
  useEffect(() => {
    setLimite(20)
  }, [debouncedQuery, types, category, dateFrom, dateTo])

  const toggleType = (type) =>
    setTypes((prev) => (prev.includes(type) ? prev.filter((tipo) => tipo !== type) : [...prev, type]))

  const results = data?.results ?? []
  const hasCriteria = debouncedQuery || types.length || category || dateFrom || dateTo

  // A busca mistura tipos na mesma lista — daí a chave composta. A ordem é
  // a que o servidor devolveu, que é a que a lista desenha.
  const selectableKeys = useMemo(
    () => results.map((item) => `${item.type}:${item.id}`),
    [results],
  )

  // Antes do `useMultiSelect`: o efeito do F2 logo abaixo lê daqui.
  const renomear = useRenomear({ onRenamed: refetch })

  const { selected: selectedIds, isSelected, clear, handleClick, handleContextMenu } =
    useMultiSelect(selectableKeys)

  useF2(renomear, selectedIds, ['note', 'file', 'spreadsheet', 'diagram', 'canvas'])

  const { pedirExclusao, dialogs: deleteDialogs } = useExcluirSelecao({
    selecionados: selectedIds,
    itemDe: (chave) => results.find((item) => `${item.type}:${item.id}` === chave),
    onExcluido: () => {
      clear()
      refresh()
    },
  })

  // Menu completo de documentos (Duplicar, Mover, Exportar, Criar a
  // partir de...): o resultado da busca é um resumo — o hook precisa do
  // documento inteiro (kind, folder), então busca na hora do clique.
  const { buildMenu, dialogs: acoesDialogs } = useDocumentActions({
    onChanged: refetch,
    onRename: (doc) => renomear.abrir(doc.id),
  })

  // A busca também precisa ouvir: excluir numa pasta com esta tela montada
  // deixava um resultado fantasma na lista até recarregar a página.
  useListenerDeJanela('notefy:moved', refetch)

  /**
   * Pergunta à IA usando os resultados como fonte.
   *
   * O documento em contexto é o primeiro resultado; os títulos dos
   * demais vão no texto, para a resposta poder apontar onde procurar.
   */
  const perguntarIA = async () => {
    const pergunta = query.trim()
    if (!pergunta || perguntandoIA) return
    setPerguntandoIA(true)
    setRespostaIA({ pergunta, texto: '', erro: null })
    try {
      const documentos = results.filter((r) => r.type !== 'folder' && r.type !== 'task')
      const lista = documentos
        .slice(0, 8)
        .map((r) => `- ${r.title}`)
        .join('\n')
      const { text } = await runIA({
        task: 'busca.responder',
        documentId: documentos[0]?.id,
        input: t('Pergunta: {pergunta}\n\nItens encontrados na busca:\n{lista}', { pergunta, lista: lista || t('(nenhum)') }),
      })
      setRespostaIA({ pergunta, texto: text, erro: null })
    } catch (e) {
      setRespostaIA({ pergunta, texto: '', erro: e.message })
    } finally {
      setPerguntandoIA(false)
    }
  }

  const abrirMenu = async (item, event) => {
    const total = handleContextMenu(`${item.type}:${item.id}`)
    if (total > 1) {
      openMenu(event, { isMultiple: true })
      return
    }
    // Documento: busca o inteiro para o menu ter todas as ações. Pasta e
    // tarefa seguem com o menu próprio (não são deriváveis).
    if (DOCUMENT_KINDS[item.type]) {
      try {
        const { data: doc } = await api.get(`/documents/${item.id}/`)
        openMenu(event, { doc, item })
        return
      } catch {
        // Item sumiu entre renderizar e clicar: menu básico ainda funciona.
      }
    }
    openMenu(event, { item })
  }

  /**
   * Abre a pasta de um resultado. O documento inteiro (já buscado para o
   * menu) traz `folder`; tarefa e o resto são buscados agora. Aviso e erro
   * vão para o aviso flutuante: um `alert` abria a caixa cinza do sistema, e
   * só logar no console fechava o menu sem nada acontecer.
   */
  const irParaPasta = async (item, doc) => {
    try {
      const endpoint = item.type === 'task' ? `/tasks/${item.id}/` : `/documents/${item.id}/`
      const folderId = doc ? doc.folder : (await api.get(endpoint)).data.folder
      if (folderId) navigate(`/folders/${folderId}`)
      else avisarErro(t('Este item não pertence a nenhuma pasta.'))
    } catch (error) {
      avisarErro(extractError(error))
    }
  }

  return (
    <>
      <PageHeader
        title={t('Busca global')}
        // Sem subtítulo: ele listava "notas, arquivos, planilhas,
        // diagramas, canvas, pastas e tarefas" — exatamente os chips de
        // filtro logo abaixo, que além de dizer o mesmo são clicáveis. O
        // Início também não tem frase explicativa; as duas telas
        // precisavam ter o mesmo cabeçalho.
      >
        <div className="mt-4 space-y-3">
          <FilterBar
            query={query}
            onQueryChange={setQuery}
            onQueryKeyDown={(e) => {
              // Ctrl+Enter transforma a busca em pergunta: a IA responde
              // usando os itens encontrados como fonte.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                perguntarIA()
              }
            }}
            placeholder={
              semMouse() ? t('Buscar em tudo...') : t('Buscar em tudo... (Ctrl+Enter pergunta ao Laviel)')
            }
            category={category}
            onCategoryChange={setCategory}
            extraActive={Boolean(dateFrom || dateTo || types.length)}
            onClearExtra={() => {
              setDateFrom('')
              setDateTo('')
              setTypes([])
            }}
            extra={
              // O período quebra linha inteiro: soltos, o "até" ficava no fim de
              // uma linha e a segunda data sozinha na outra (celular).
              <div className="flex items-center gap-2 max-sm:w-full">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label={t('Data inicial')}
                  className="input h-9 w-auto py-0 text-sm max-sm:min-w-0 max-sm:flex-1"
                />
                <span className="text-xs text-ink-400">{t('até')}</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label={t('Data final')}
                  min={dateFrom || undefined}
                  className="input h-9 w-auto py-0 text-sm max-sm:min-w-0 max-sm:flex-1"
                />
              </div>
            }
          />

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TYPE_META).map(([type, { label, icon: Icon, accent }]) => {
              const active = types.includes(type)
              const count = data?.counts?.[type]
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  style={active ? { borderColor: accent, color: accent } : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                    active
                      ? 'bg-white dark:bg-ink-900'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                  )}
                >
                  <Icon size={13} />
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="tabular-nums opacity-70">{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </PageHeader>

      <PageBody className="pb-24">

        {/* Resposta da IA sobre os resultados (Ctrl+Enter na busca). */}
        {respostaIA && (
          <div className="mb-4 rounded-lg border border-accent-200 bg-accent-50/60 p-3 dark:border-accent-500/30 dark:bg-accent-500/10">
            <div className="mb-1.5 flex items-center gap-2">
              <Sparkles size={14} className="text-accent-600" />
              <span className="flex-1 truncate text-xs font-medium text-accent-800 dark:text-accent-200">
                {respostaIA.pergunta}
              </span>
              <button
                onClick={() => setRespostaIA(null)}
                className="rounded p-0.5 text-ink-400 transition hover:text-ink-700 dark:hover:text-ink-200"
                title={t('Fechar')}
              >
                <X size={13} />
              </button>
            </div>
            {respostaIA.erro ? (
              <p className="text-sm text-red-600 dark:text-red-400">{respostaIA.erro}</p>
            ) : (
              <p className="select-text whitespace-pre-wrap text-sm text-ink-700 dark:text-ink-200">
                {respostaIA.texto || (perguntandoIA ? t('Pensando...') : '')}
              </p>
            )}
          </div>
        )}

        {error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : loading ? (
          <ListSkeleton rows={6} />
        ) : results.length ? (
          <>
            <p className="mb-3 flex items-center gap-2 text-xs text-ink-400">
              <span>
                {data.total} {t('resultado(s)')}
                {debouncedQuery && <> {t('para “')}{debouncedQuery}”</>}
              </span>
              {/* A pergunta ao Laviel era só Ctrl+Enter: no toque não existia. */}
              {debouncedQuery && (
                <button
                  onClick={perguntarIA}
                  disabled={perguntandoIA}
                  className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-accent-700 transition hover:bg-accent-50 disabled:opacity-50 dark:text-accent-300 dark:hover:bg-accent-500/10"
                >
                  <Sparkles size={12} />
                  {t('Perguntar ao Laviel')}
                </button>
              )}
            </p>

            <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {results.map((item, i) => {
                const uniqueKey = `${item.type}:${item.id}`
                const selecionado = isSelected(uniqueKey)
                const meta = TYPE_META[item.type] ?? TYPE_META.note
                const Icon = meta.icon

                return (
                  <li key={uniqueKey}>
                    {/* O `<Link>` do React Router só navega se o handler não
                        tiver chamado `preventDefault` — é o que o hook faz em
                        Shift e Ctrl. Sem isso o Shift+clique abria o item em
                        vez de marcar o intervalo.

                        A linha sangra de ponta a ponta: o realce precisa
                        cobrir a largura inteira, não uma faixa encolhida no
                        meio. Para o anel não ser fatiado pelo canto do `<ul>`
                        (`rounded-lg` + `overflow-hidden`), ele é `ring-inset`
                        — nasce DENTRO da caixa — e a primeira e a última
                        linha recebem o raio interno do contêiner (10px do
                        `rounded-lg` menos 1px da borda), de modo que a curva
                        do anel coincida com a da moldura em vez de cruzá-la. */}
                    <Link
                      to={item.url}
                      onClick={(e) => handleClick(uniqueKey, e)}
                      onContextMenu={(e) => abrirMenu(item, e)}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-900',
                        i === 0 && 'rounded-t-[9px]',
                        i === results.length - 1 && 'rounded-b-[9px]',
                        selecionado &&
                          'bg-accent-50/60 ring-2 ring-inset ring-accent-500 dark:bg-accent-500/10'
                      )}
                    >
                      <Icon
                        size={16}
                        className="mt-0.5 shrink-0"
                        style={{ color: item.color || meta.accent }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {renomear.estaEditando(item.id) ? (
                            // Mesmo campo da grade de cartões, no mesmo
                            // lugar do texto: a busca é justamente onde
                            // se acha o item com nome ruim.
                            <CampoDeRenomear
                              renomear={renomear}
                              valorAtual={item.title}
                              endpoint={`/documents/${item.id}/`}
                              campo="title"
                              className="titulo text-[15px]"
                            />
                          ) : (
                            <p className="titulo truncate text-[15px]">
                              {item.title}
                            </p>
                          )}
                          <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-400">{item.subtitle}</p>
                        {item.snippet && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-ink-500 dark:text-ink-400">
                            {item.snippet}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-ink-400">
                        {formatRelative(item.updated_at)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* O servidor diz se sobrou coisa; antes o teto era 20 por
                tipo e não havia como chegar no resultado 21. */}
            {data?.has_more && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  loading={loading}
                  onClick={() => setLimite((n) => n + 40)}
                >
                  {t('Carregar mais ({n} de {total})', { n: results.length, total: data.total })}
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={SearchX}
            title={hasCriteria ? t('Nenhum resultado') : t('Comece a buscar')}
            description={
              hasCriteria
                ? t('Tente outro termo ou remova alguns filtros.')
                : t('Digite um termo ou combine filtros de tipo, categoria e data.')
            }
          />
        )}
      </PageBody>

      <BarraDeSelecao total={selectedIds.length} onExcluir={pedirExclusao} onLimpar={clear} />

      {/* Menu de Contexto global para a página de busca */}
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
            : menu?.payload?.doc
              ? [
                  // Mesmo menu das outras telas (buildMenu) + o atalho para a
                  // pasta do item, que é específico da busca.
                  { label: t('Ir para pasta'), icon: FolderIcon, onClick: () => irParaPasta(menu.payload.item, menu.payload.doc) },
                  { separator: true },
                  ...buildMenu(menu.payload.doc),
                ]
              : [
                  ...(menu?.payload?.item?.type !== 'folder'
                    ? [
                        { label: t('Ir para pasta'), icon: FolderIcon, onClick: () => irParaPasta(menu.payload.item) },
                        { separator: true },
                      ]
                    : []),
                  {
                    label: t('Abrir'),
                    icon: ExternalLink,
                    onClick: () => navigate(menu.payload.item.url),
                  },
                  { separator: true },
                  {
                    label: t('Excluir'),
                    icon: Trash2,
                    danger: true,
                    onClick: pedirExclusao,
                  },
                  ...(menu?.payload?.item?.type === 'folder' ? fimDoMenu('pasta', menu.payload.item.id) : []),
                ]
        }
      />

      {/* Modais de Exclusão */}
      {deleteDialogs}

      {/* Diálogos das ações de documento (mover, excluir, IA...) */}
      {acoesDialogs}
    </>
  )
}

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FolderOpen, LayoutTemplate, PenLine, Play, Trash2, X } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { findFolder, useWorkspace } from '@/context/WorkspaceContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Button, ErrorState, ListSkeleton, Modal, Spinner } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import ChecklistSection from '@/components/editors/ChecklistSection'
import TableSection from '@/components/editors/TableSection'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import DestinationModal from '@/components/modals/DestinationModal'
import ModeloModal from '@/components/modals/ModeloModal'
import { kindMeta } from '@/lib/documents'
import { MODELOS_PRONTOS, resumoDoModelo } from '@/lib/modelos'
import { limparHtml } from '@/lib/sanitizar'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Modelos: o ponto de partida de um item novo.
 *
 * Duas prateleiras: os que vêm com o app (`lib/modelos.js`, traduzidos) e
 * os que a pessoa salvou de um item seu ("Salvar como modelo", no menu do
 * item ou na barra do editor). Usar um modelo abre o editor em modo de
 * criação já com o conteúdo: nome e pasta continuam escolha de quem cria,
 * pelo mesmo fluxo de um item em branco.
 *
 * `?folder=<id>` chega de "Novo a partir de modelo" no menu de uma pasta:
 * o item nasce ali sem perguntar de novo.
 */

const FILTROS = [
  { kind: null, get label() { return t('Todos') } },
  { kind: 'note', get label() { return t('Notas') } },
  { kind: 'spreadsheet', get label() { return t('Planilhas') } },
  { kind: 'diagram', get label() { return t('Diagramas') } },
  { kind: 'canvas', get label() { return t('Canvas') } },
]

function CartaoDeModelo({ nome, descricao, kind, onAbrir, onContextMenu }) {
  const meta = kindMeta(kind)
  const Icon = meta.icon
  return (
    <article
      tabIndex={0}
      role="button"
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAbrir()
        }
      }}
      onContextMenu={onContextMenu}
      className="card group flex h-full cursor-pointer flex-col gap-2 p-4 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${meta.accent}1f`, color: meta.accent }}
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="titulo truncate text-[15px] group-hover:text-accent-700 dark:group-hover:text-accent-300">{nome}</h3>
          <p className="text-[11px] text-ink-400">{meta.label}</p>
        </div>
      </div>
      {descricao && <p className="line-clamp-2 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">{descricao}</p>}
    </article>
  )
}

/** O conteúdo do modelo, só para ler: é o que a pessoa vai receber. */
function Previa({ kind, dados }) {
  if (!dados) return <div className="flex h-32 items-center justify-center"><Spinner /></div>
  if (kind === 'note') {
    return (
      <div className="max-h-[50vh] overflow-y-auto rounded-md border border-ink-150 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        {(dados.sections ?? []).map((s) =>
          s.type === 'checklist' ? (
            <ChecklistSection key={s.id} section={s} onChange={() => {}} readOnly />
          ) : s.type === 'table' ? (
            <TableSection key={s.id} section={s} onChange={() => {}} readOnly />
          ) : s.type === 'code' ? (
            <pre key={s.id} className="my-2 overflow-x-auto rounded-md bg-ink-100 p-3 font-mono text-xs dark:bg-ink-800">{s.code}</pre>
          ) : (
            <div key={s.id} className="prose-note" dangerouslySetInnerHTML={{ __html: limparHtml(s.html) }} />
          ),
        )}
      </div>
    )
  }
  if (kind === 'spreadsheet') {
    return (
      <div className="overflow-x-auto rounded-md border border-ink-150 dark:border-ink-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-ink-50 dark:bg-ink-800/60">
            <tr>
              {(dados.columns ?? []).map((c) => (
                <th key={c.id} className="border-b border-ink-150 px-3 py-2 font-medium dark:border-ink-800">{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(dados.rows ?? []).slice(0, 5).map((r) => (
              <tr key={r.id}>
                {(dados.columns ?? []).map((c) => (
                  <td key={c.id} className="border-b border-ink-100 px-3 py-1.5 text-ink-500 dark:border-ink-800">{String(r.cells?.[c.id] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {(dados.nodes ?? []).filter((n) => n.text).map((n) => (
        <span key={n.id} className="rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-600 dark:border-ink-700 dark:text-ink-300">{n.text}</span>
      ))}
    </div>
  )
}

export default function Templates() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { categories } = useWorkspace()
  const [filtro, setFiltro] = useState(null)
  const [aberto, setAberto] = useState(null)
  const [renomeando, setRenomeando] = useState(null)
  const [excluindo, setExcluindo] = useState(null)
  const [escolhendoPasta, setEscolhendoPasta] = useState(false)
  const [erro, setErro] = useState(null)
  const { menu, openMenu, closeMenu } = useContextMenu()

  const pastaId = searchParams.get('folder')
  const pasta = pastaId ? findFolder(categories, pastaId) : null

  const meus = useFetch('/templates/')
  const salvos = meus.data?.results ?? meus.data ?? []
  const passa = (kind) => !filtro || kind === filtro
  const prontos = MODELOS_PRONTOS.filter((m) => passa(m.kind))
  const proprios = salvos.filter((m) => passa(m.kind))

  /** Abre a prévia; modelo salvo busca o conteúdo, o do app já o tem. */
  const abrir = async (modelo) => {
    setErro(null)
    if (modelo.pronto) {
      setAberto({ ...modelo, dados: modelo.dados() })
      return
    }
    setAberto({ ...modelo, dados: null })
    try {
      const { data } = await api.get(`/templates/${modelo.id}/`)
      setAberto((atual) => atual && atual.id === modelo.id && { ...atual, dados: data.data })
    } catch (err) {
      setAberto(null)
      setErro(extractError(err))
    }
  }

  const usar = (modelo) => {
    const destino = new URLSearchParams({ modelo: modelo.id })
    if (pastaId) destino.set('folder', pastaId)
    navigate(`${kindMeta(modelo.kind).route}/new?${destino}`)
  }

  const comoPronto = (m) => ({ id: m.id, nome: m.nome, descricao: m.descricao, kind: m.kind, pronto: true, dados: m.dados })
  const comoSalvo = (m) => ({ id: m.id, nome: m.name, descricao: m.description || m.excerpt, kind: m.kind, pronto: false, bruto: m })

  return (
    <div className="pb-24">
      <PageHeader
        title={t('Modelos')}
        subtitle={t('Comece um item novo a partir de um modelo pronto ou de um que você salvou.')}
      />

      <PageBody className="space-y-8">
        {erro && <ErrorState message={erro} />}

        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFiltro(f.kind)}
              aria-pressed={filtro === f.kind}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition [@media(pointer:coarse)]:py-2',
                filtro === f.kind
                  ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-500/15 dark:text-accent-200'
                  : 'border-ink-200 text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300',
              )}
            >
              {f.label}
            </button>
          ))}

          {/* Para onde vão os itens criados daqui. */}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
            <FolderOpen size={13} />
            {pasta ? (
              <>
                {t('Criando em')} <strong className="font-medium text-ink-700 dark:text-ink-200">{pasta.name}</strong>
                <button
                  type="button"
                  onClick={() => {
                    searchParams.delete('folder')
                    setSearchParams(searchParams, { replace: true })
                  }}
                  title={t('Escolher a pasta ao criar')}
                  aria-label={t('Escolher a pasta ao criar')}
                  className="rounded p-0.5 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEscolhendoPasta(true)}
                className="underline-offset-2 hover:underline"
              >
                {t('A pasta é escolhida ao criar')}
              </button>
            )}
          </span>
        </div>

        <section>
          <h2 className="secao mb-3">{t('Meus modelos')}</h2>
          {meus.loading ? (
            <ListSkeleton rows={2} />
          ) : meus.error ? (
            <ErrorState message={meus.error} onRetry={meus.refetch} />
          ) : proprios.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {proprios.map((m) => (
                <CartaoDeModelo
                  key={m.id}
                  nome={m.name}
                  descricao={m.description || m.excerpt}
                  kind={m.kind}
                  onAbrir={() => abrir(comoSalvo(m))}
                  onContextMenu={(e) => openMenu(e, { modelo: m })}
                />
              ))}
            </div>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border border-dashed border-ink-200 px-4 py-3 text-sm text-ink-500 dark:border-ink-700 dark:text-ink-400">
              <LayoutTemplate size={16} className="mt-0.5 shrink-0" />
              {salvos.length
                ? t('Nenhum modelo seu deste tipo.')
                : t('Abra uma nota, planilha, diagrama ou canvas e use "Salvar como modelo" (no menu do item ou na barra do editor) para ele aparecer aqui.')}
            </p>
          )}
        </section>

        <section>
          <h2 className="secao mb-3">{t('Do Notefy')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {prontos.map((m) => (
              <CartaoDeModelo key={m.id} nome={m.nome} descricao={m.descricao} kind={m.kind} onAbrir={() => abrir(comoPronto(m))} />
            ))}
          </div>
        </section>
      </PageBody>

      <Modal
        open={!!aberto}
        onClose={() => setAberto(null)}
        title={aberto?.nome}
        description={aberto?.descricao}
        size="lg"
        footer={
          <>
            {aberto && !aberto.pronto && (
              <Button
                variant="secondary"
                icon={Trash2}
                className="mr-auto text-red-600 dark:text-red-400"
                onClick={() => {
                  setExcluindo(aberto.bruto)
                  setAberto(null)
                }}
              >
                {t('Excluir')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setAberto(null)}>
              {t('Cancelar')}
            </Button>
            <Button icon={Play} onClick={() => usar(aberto)} disabled={!aberto?.dados}>
              {t('Usar modelo')}
            </Button>
          </>
        }
      >
        {aberto && (
          <div className="space-y-3">
            <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">{kindMeta(aberto.kind).label}</Badge>
            <Previa kind={aberto.kind} dados={aberto.dados} />
            {aberto.dados && aberto.kind !== 'note' && (
              <p className="text-xs text-ink-400">{resumoDoModelo(aberto.kind, aberto.dados)}</p>
            )}
          </div>
        )}
      </Modal>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu
            ? [
                { label: t('Usar modelo'), icon: Play, onClick: () => usar(menu.payload.modelo) },
                { label: t('Editar nome e descrição'), icon: PenLine, onClick: () => setRenomeando(menu.payload.modelo) },
                { separator: true },
                { label: t('Excluir'), icon: Trash2, danger: true, onClick: () => setExcluindo(menu.payload.modelo) },
              ]
            : []
        }
      />

      <ModeloModal
        open={!!renomeando}
        modelo={renomeando}
        onClose={() => setRenomeando(null)}
        onSalvo={() => meus.refetch()}
      />

      <ConfirmDialog
        open={!!excluindo}
        title={t('Excluir modelo')}
        message={
          <>
            <strong>{excluindo?.name}</strong> {t('sai de Modelos. Os itens criados a partir dele continuam como estão.')}
          </>
        }
        onClose={() => setExcluindo(null)}
        onConfirm={async () => {
          await api.delete(`/templates/${excluindo.id}/`)
          meus.refetch()
        }}
      />

      <DestinationModal
        open={escolhendoPasta}
        title={t('Onde criar os itens')}
        confirmLabel={t('Escolher')}
        permitirPastaAtual
        onClose={() => setEscolhendoPasta(false)}
        onPick={(folderId) => {
          setEscolhendoPasta(false)
          searchParams.set('folder', folderId)
          setSearchParams(searchParams, { replace: true })
        }}
      />
    </div>
  )
}

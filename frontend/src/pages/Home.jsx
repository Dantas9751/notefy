import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckSquare, ChevronRight, FolderOpen, Layers, Plus, Tag } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useDocumentActions } from '@/hooks/useDocumentActions'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Badge, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import DocumentCard from '@/components/DocumentCard'
import CategoryFormModal from '@/components/modals/CategoryFormModal'
import { DOCUMENT_KINDS } from '@/lib/documents'
import { TASK_PRIORITY, formatRelative } from '@/lib/utils'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function StatCard({ icon: Icon, label, value, to, color }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-4">
      <div
        className="rounded-md p-2"
        style={color ? { backgroundColor: `${color}18`, color } : undefined}
      >
        <Icon size={17} className={color ? undefined : 'text-ink-500 dark:text-ink-400'} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight tabular-nums text-ink-900 dark:text-ink-50">
          {value ?? '—'}
        </p>
        <p className="truncate text-xs text-ink-500 dark:text-ink-400">{label}</p>
      </div>
    </Link>
  )
}

/** Cartão de categoria com uma prévia das pastas que tem dentro. */
function CategoryCard({ category }) {
  const folders = category.folders ?? []
  const preview = folders.slice(0, 4)

  return (
    <Link
      to={`/categories/${category.id}`}
      className="card group flex flex-col p-4"
      style={{ borderTopColor: category.color, borderTopWidth: 3 }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink-900 group-hover:text-accent-700 dark:text-ink-100 dark:group-hover:text-accent-300">
            {category.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {category.folder_count} pasta(s) · {category.document_count} item(ns)
          </p>
        </div>
        <ChevronRight
          size={15}
          className="mt-0.5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500"
        />
      </div>

      <div className="mt-3 flex-1 space-y-1">
        {preview.map((folder) => (
          <div
            key={folder.id}
            className="flex items-center gap-1.5 text-[12px] text-ink-500 dark:text-ink-400"
          >
            <FolderOpen size={12} className="shrink-0 text-ink-300" />
            <span className="truncate">{folder.name}</span>
            {folder.document_count > 0 && (
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-400">
                {folder.document_count}
              </span>
            )}
          </div>
        ))}
        {folders.length > preview.length && (
          <p className="text-[11px] text-ink-400">+{folders.length - preview.length} pasta(s)</p>
        )}
        {folders.length === 0 && (
          <p className="text-[11px] italic text-ink-400">Nenhuma pasta ainda.</p>
        )}
      </div>
    </Link>
  )
}

/**
 * Início — painel e porta de entrada da hierarquia.
 *
 * Junta as duas leituras: os números do acervo (quanto tem de cada tipo,
 * o que foi mexido, o que vence) e as categorias, que são o primeiro
 * nível da navegação categoria → pasta → item.
 */
export default function Home() {
  const { user } = useAuth()
  const { categories, loading, refresh } = useWorkspace()
  const navigate = useNavigate()
  const { menu, openMenu, closeMenu } = useContextMenu()
  const [categoryModal, setCategoryModal] = useState(false)

  const stats = useFetch('/documents/stats/')
  const recent = useFetch('/documents/recent/')
  const upcoming = useFetch('/tasks/', {
    params: { status: 'todo', ordering: 'starts_at', page_size: 6 },
  })
  const { buildMenu, dialogs } = useDocumentActions({ onChanged: recent.refetch })

  const firstName = (user?.full_name || user?.email || '').split(' ')[0]
  const byKind = stats.data?.by_kind ?? {}
  const totalFolders = categories.reduce((sum, c) => sum + (c.folder_count ?? 0), 0)

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle="Um resumo do seu espaço e as categorias onde tudo mora."
        actions={
          <Button icon={Plus} onClick={() => setCategoryModal(true)}>
            Nova categoria
          </Button>
        }
      />

      <PageBody className="space-y-8">
        {/* Painel: quanto tem de cada coisa */}
        <section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Layers} label="Itens no total" value={stats.data?.total} to="/recent" />
            <StatCard icon={Tag} label="Categorias" value={categories.length} to="/" />
            <StatCard icon={FolderOpen} label="Pastas" value={totalFolders} to="/" />
            <StatCard
              icon={CheckSquare}
              label="Tarefas abertas"
              value={upcoming.data?.count}
              to="/board"
            />
          </div>

          {/* Quebra por tipo — inclui os zerados, para o usuário saber que
              o formato existe mesmo sem ter criado nenhum ainda. */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(DOCUMENT_KINDS).map(([kind, meta]) => {
              const Icon = meta.icon
              const count = byKind[kind] ?? 0
              return (
                <div
                  key={kind}
                  className="card flex items-center gap-2.5 p-3"
                  style={{ borderLeftColor: meta.accent, borderLeftWidth: 3 }}
                >
                  <Icon size={16} className="shrink-0" style={{ color: meta.accent }} />
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-none tabular-nums text-ink-900 dark:text-ink-50">
                      {count}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-ink-500 dark:text-ink-400">
                      {count === 1 ? meta.label : meta.plural}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Categorias — o primeiro nível da navegação */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
              Categorias
            </h2>
          </div>

          {loading ? (
            <ListSkeleton rows={2} />
          ) : categories.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Tag}
              title="Comece criando uma categoria"
              description="Tudo no Notefy mora dentro de uma categoria: ela guarda pastas, e as pastas guardam suas notas, arquivos, planilhas, diagramas e canvas."
              action={
                <Button icon={Plus} onClick={() => setCategoryModal(true)}>
                  Criar categoria
                </Button>
              }
            />
          )}
        </section>

        {/* Recentes */}
        {(recent.loading || recent.data?.length > 0) && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
                Mexidos recentemente
              </h2>
              <Link
                to="/recent"
                className="text-xs text-ink-500 underline-offset-2 hover:underline dark:text-ink-400"
              >
                Ver todos
              </Link>
            </div>

            {recent.loading ? (
              <ListSkeleton rows={3} />
            ) : recent.error ? (
              <ErrorState message={recent.error} onRetry={recent.refetch} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {recent.data.slice(0, 6).map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    showFolder
                    onContextMenu={openMenu}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Próximas tarefas */}
        {upcoming.data?.results?.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
                Próximas tarefas
              </h2>
              <Link
                to="/board"
                className="text-xs text-ink-500 underline-offset-2 hover:underline dark:text-ink-400"
              >
                Ver quadro
              </Link>
            </div>

            <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {upcoming.data.results.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-ink-50 dark:hover:bg-ink-900"
                >
                  <CheckSquare size={15} className="shrink-0 text-ink-300" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700 dark:text-ink-200">
                    {task.title}
                  </span>
                  {task.document_title && (
                    <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                      {task.document_title}
                    </Badge>
                  )}
                  <span
                    className={`text-[11px] font-medium ${TASK_PRIORITY[task.priority]?.className}`}
                  >
                    {task.priority_label}
                  </span>
                  {task.starts_at ? (
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {formatRelative(task.starts_at)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] italic text-ink-400">sem data</span>
                  )}
                  {task.is_overdue && <Badge className="bg-red-100 text-red-700">atrasada</Badge>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageBody>

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={menu ? buildMenu(menu.payload.document) : []}
      />
      {dialogs}

      <CategoryFormModal
        open={categoryModal}
        onClose={() => setCategoryModal(false)}
        onSaved={(category) => {
          setCategoryModal(false)
          refresh()
          if (category?.id) navigate(`/categories/${category.id}`)
        }}
      />
    </>
  )
}

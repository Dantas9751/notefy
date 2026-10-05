import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Folder as FolderIcon, FolderInput, Tag } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useWorkspace, findFolder } from '@/context/WorkspaceContext'
import { Button, ColorDot, ErrorState, Field, Input, Modal, Select, Spinner } from '@/components/ui'
import { Abas } from '@/components/inicio/Bloco'
import DestinationModal from './DestinationModal'
import { DOCUMENT_STATUS, kindMeta } from '@/lib/documents'
import { cn, formatBytes, formatDate, PRESET_COLORS } from '@/lib/utils'
import { idioma, t } from '@/lib/i18n'

// Sem cor e os mesmos tons do resto do app.
const CORES = ['', ...PRESET_COLORS.slice(0, 7)]

const ENDPOINT = { documento: 'documents', pasta: 'folders', categoria: 'categories' }

/** "1.6 MB (1.678.123 bytes)", como o Explorer mostra. */
const tamanho = (bytes) => `${formatBytes(bytes)} (${new Intl.NumberFormat(idioma).format(bytes || 0)} bytes)`
const quando = (valor) => (valor ? formatDate(valor, t("d 'de' MMMM 'de' yyyy, HH:mm")) : '—')

/** Uma linha "rótulo: valor", a unidade da aba Geral. */
function Linha({ rotulo, children }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-baseline gap-3 py-1 text-sm max-sm:grid-cols-1 max-sm:gap-0.5">
      <div className="text-ink-500 dark:text-ink-400">{rotulo}</div>
      <div className="min-w-0 break-words text-ink-800 dark:text-ink-100">{children}</div>
    </div>
  )
}

const Divisor = () => <hr className="my-2 border-ink-100 dark:border-ink-800" />

function Caixa({ marcada, onMudar, rotulo, dica }) {
  return (
    <label className="flex items-start gap-2.5 py-1">
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => onMudar(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-accent-600 focus:ring-accent-500 dark:border-ink-600 dark:bg-ink-800"
      />
      <span>
        <span className="text-sm text-ink-800 dark:text-ink-100">{rotulo}</span>
        {dica && <span className="block text-xs text-ink-400">{dica}</span>}
      </span>
    </label>
  )
}

/**
 * Propriedades de qualquer item, como a janela do Explorer do Windows:
 * nome, tipo, local, tamanho, datas e atributos (somente leitura,
 * favorito). Item tem ainda a aba Organização — pasta, etiquetas, status e
 * cor —, que antes era um modal à parte com o mesmo nome.
 *
 * `alvo` é `{ tipo: 'documento' | 'pasta' | 'categoria', id, aba? }`. O
 * modal busca o item sozinho (sem marcar como aberto) e grava só o que
 * mudou.
 */
export default function PropriedadesModal({ alvo, onClose, onSalvo }) {
  const navigate = useNavigate()
  const { categories } = useWorkspace()
  const [item, setItem] = useState(null)
  const [numeros, setNumeros] = useState(null)
  const [form, setForm] = useState(null)
  const [aba, setAba] = useState('geral')
  const [erro, setErro] = useState(null)
  const [erroNome, setErroNome] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [escolhendoPasta, setEscolhendoPasta] = useState(false)

  const tipo = alvo?.tipo
  const ehDocumento = tipo === 'documento'

  useEffect(() => {
    if (!alvo) return undefined
    let vivo = true
    setItem(null)
    setNumeros(null)
    setErro(null)
    setErroNome(null)
    setAba(alvo.aba ?? 'geral')
    const base = `/${ENDPOINT[alvo.tipo]}/${alvo.id}/`
    Promise.all([
      api.get(base, { params: alvo.tipo === 'documento' ? { abrir: 0 } : undefined }),
      alvo.tipo === 'documento' ? null : api.get(`${base}properties/`),
    ])
      .then(([{ data }, extra]) => {
        if (!vivo) return
        setItem(data)
        setNumeros(extra?.data ?? null)
        setForm({
          nome: data.title ?? data.name ?? '',
          is_read_only: !!data.is_read_only,
          is_favorite: !!data.is_favorite,
          folder: data.folder ?? '',
          categories: (data.categories_detail ?? []).map((c) => c.id),
          status: data.status ?? 'draft',
          color: data.color ?? '',
        })
      })
      .catch((err) => vivo && setErro(extractError(err)))
    return () => {
      vivo = false
    }
  }, [alvo])

  const mudar = (patch) => setForm((f) => ({ ...f, ...patch }))

  const salvar = async () => {
    const nomeAtual = item.title ?? item.name
    const corpo = {}
    if (form.nome.trim() !== nomeAtual) corpo[ehDocumento ? 'title' : 'name'] = form.nome.trim()
    if (tipo !== 'categoria' && form.is_favorite !== !!item.is_favorite) corpo.is_favorite = form.is_favorite
    if (ehDocumento) {
      if (form.is_read_only !== !!item.is_read_only) corpo.is_read_only = form.is_read_only
      if (form.folder !== item.folder) corpo.folder = form.folder
      if (form.status !== item.status) corpo.status = form.status
      if (form.color !== (item.color ?? '')) corpo.color = form.color
      const antes = (item.categories_detail ?? []).map((c) => c.id).sort().join()
      if ([...form.categories].sort().join() !== antes) corpo.categories = form.categories
    }
    if (!Object.keys(corpo).length) return onClose()

    setSalvando(true)
    setErro(null)
    setErroNome(null)
    try {
      const endpoint = `/${ENDPOINT[tipo]}/${item.id}/`
      const { data } = await api.patch(endpoint, corpo)
      if ('is_favorite' in corpo) {
        window.dispatchEvent(
          new CustomEvent('notefy:favorites-changed', { detail: { endpoint, is_favorite: corpo.is_favorite } }),
        )
      }
      onSalvo?.(data)
      onClose()
    } catch (err) {
      const campos = err.response?.data
      const doNome = campos?.title ?? campos?.name
      if (doNome) setErroNome(Array.isArray(doNome) ? doNome[0] : String(doNome))
      else setErro(extractError(err))
    } finally {
      setSalvando(false)
    }
  }

  const abrirLocal = () => {
    onClose()
    if (tipo === 'documento') navigate(`/folders/${item.folder}`)
    else if (tipo === 'pasta') navigate(item.parent ? `/folders/${item.parent}` : `/categories/${item.category}`)
  }

  const meta = ehDocumento && item ? kindMeta(item.kind) : null
  const Icone = meta?.icon ?? (tipo === 'pasta' ? FolderIcon : Tag)
  const corDoIcone = item?.color || meta?.accent || item?.category_detail?.color
  const caminho = item?.breadcrumb ?? []
  const pastaEscolhida = form && ehDocumento ? findFolder(categories, form.folder) : null
  const anexos = item?.attachments ?? []
  const extensao = item?.original_name?.includes('.') ? item.original_name.split('.').pop().toLowerCase() : ''

  const geral = item && form && (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-100 dark:bg-ink-800"
          style={corDoIcone ? { color: corDoIcone } : undefined}
        >
          <Icone size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <Input
            value={form.nome}
            onChange={(e) => mudar({ nome: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && salvar()}
            aria-label={t('Nome')}
          />
          {erroNome && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erroNome}</p>}
        </div>
      </div>
      <Divisor />

      <Linha rotulo={t('Tipo')}>
        {ehDocumento ? (
          <>
            {meta.label}
            {item.kind === 'file' && extensao && ` (.${extensao})`}
            {item.mime_type && <span className="ml-2 text-xs text-ink-400">{item.mime_type}</span>}
          </>
        ) : tipo === 'pasta' ? (
          t('Pasta')
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <ColorDot color={item.color} size={8} />
            {t('Categoria')}
          </span>
        )}
      </Linha>
      {tipo !== 'categoria' && (
        <Linha rotulo={t('Local')}>
          <span className="inline-flex flex-wrap items-center gap-1">
            {caminho.map((c, i) => (
              <span key={c.id} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight size={12} className="text-ink-400" />}
                {c.name}
              </span>
            ))}
            <button type="button" onClick={abrirLocal} className="ml-2 text-xs text-accent-700 underline-offset-2 hover:underline dark:text-accent-300">
              {t('Abrir local')}
            </button>
          </span>
        </Linha>
      )}
      <Divisor />

      {ehDocumento && item.kind === 'file' && <Linha rotulo={t('Tamanho')}>{tamanho(item.size)}</Linha>}
      {ehDocumento && item.kind !== 'file' && (
        <Linha rotulo={t('Conteúdo')}>{item.word_count === 1 ? t('1 palavra') : t('{n} palavras', { n: item.word_count ?? 0 })}</Linha>
      )}
      {ehDocumento && anexos.length > 0 && (
        <Linha rotulo={t('Anexos')}>
          {t('{n} anexo(s)', { n: anexos.length })} · {formatBytes(anexos.reduce((soma, a) => soma + (a.size || 0), 0))}
        </Linha>
      )}
      {numeros && (
        <>
          <Linha rotulo={t('Contém')}>
            {t('{itens} item(ns), {pastas} pasta(s)', { itens: numeros.itens, pastas: numeros.pastas })}
          </Linha>
          <Linha rotulo={t('Tamanho')}>{tamanho(numeros.tamanho)}</Linha>
        </>
      )}
      {!ehDocumento && item.description && <Linha rotulo={t('Descrição')}>{item.description}</Linha>}
      <Divisor />

      <Linha rotulo={t('Criado em')}>{quando(item.created_at)}</Linha>
      <Linha rotulo={t('Modificado em')}>{quando(item.updated_at)}</Linha>
      {ehDocumento && <Linha rotulo={t('Aberto em')}>{quando(item.last_viewed_at)}</Linha>}

      {tipo !== 'categoria' && (
        <>
          <Divisor />
          <Linha rotulo={t('Atributos')}>
            {ehDocumento && (
              <Caixa
                marcada={form.is_read_only}
                onMudar={(v) => mudar({ is_read_only: v })}
                rotulo={t('Somente leitura')}
                dica={t('O conteúdo não pode ser editado. Nome, pasta e etiquetas continuam mudando.')}
              />
            )}
            <Caixa marcada={form.is_favorite} onMudar={(v) => mudar({ is_favorite: v })} rotulo={t('Favorito')} />
          </Linha>
        </>
      )}
    </div>
  )

  const organizacao = item && form && ehDocumento && (
    <div className="space-y-4">
      <Field label={t('Onde mora')} hint={t('A categoria do item vem da pasta escolhida.')}>
        <button
          type="button"
          onClick={() => setEscolhendoPasta(true)}
          className="flex w-full items-center gap-2 overflow-hidden rounded-md border border-ink-200 bg-white px-3 py-2 text-left text-sm transition hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800"
        >
          {pastaEscolhida ? (
            <>
              <ColorDot color={pastaEscolhida._category?.color} size={7} />
              <span className="flex min-w-0 flex-1 items-center text-ink-800 dark:text-ink-100">
                <span className="truncate">{pastaEscolhida._category?.name}</span>
                <ChevronRight size={13} className="mx-1 shrink-0 text-ink-400" />
                <span className="truncate font-medium">{pastaEscolhida.name}</span>
              </span>
            </>
          ) : (
            <span className="flex-1 text-ink-400">{t('Escolher pasta...')}</span>
          )}
          <FolderInput size={14} className="shrink-0 text-ink-400" />
        </button>
      </Field>

      <Field label={t('Etiquetas')} hint={t('Atravessam as pastas: a mesma nota pode ser “prova” e “revisar”.')}>
        <div className="flex flex-wrap gap-1.5">
          {categories.length === 0 && <p className="text-xs text-ink-400">{t('Nenhuma categoria criada ainda.')}</p>}
          {categories.map((categoria) => {
            const marcada = form.categories.includes(categoria.id)
            return (
              <button
                key={categoria.id}
                type="button"
                aria-pressed={marcada}
                onClick={() =>
                  mudar({
                    categories: marcada
                      ? form.categories.filter((id) => id !== categoria.id)
                      : [...form.categories, categoria.id],
                  })
                }
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
                  marcada
                    ? 'border-accent-400 bg-accent-50 text-accent-800 dark:bg-accent-500/20 dark:text-accent-200'
                    : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                )}
              >
                <ColorDot color={categoria.color} size={6} />
                {categoria.name}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label={t('Status')}>
        <Select value={form.status} onChange={(e) => mudar({ status: e.target.value })}>
          {Object.entries(DOCUMENT_STATUS).map(([valor, { label }]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('Cor')}>
        <div className="flex flex-wrap gap-1.5">
          {CORES.map((cor) => (
            <button
              key={cor || 'nenhuma'}
              type="button"
              onClick={() => mudar({ color: cor })}
              style={cor ? { backgroundColor: cor } : undefined}
              aria-label={cor || t('Sem cor')}
              aria-pressed={form.color === cor}
              className={cn(
                'h-6 w-6 rounded-full border-2 text-[10px] text-ink-400 transition',
                form.color === cor ? 'border-ink-900 dark:border-white' : 'border-ink-200 dark:border-ink-700',
              )}
            >
              {!cor && '×'}
            </button>
          ))}
        </div>
      </Field>
    </div>
  )

  return (
    <>
      <Modal
        open={!!alvo && !escolhendoPasta}
        onClose={onClose}
        title={t('Propriedades')}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('Cancelar')}
            </Button>
            <Button loading={salvando} disabled={!item || !form?.nome.trim()} onClick={salvar}>
              {t('Salvar')}
            </Button>
          </>
        }
      >
        {erro && <div className="mb-3"><ErrorState message={erro} /></div>}
        {!item ? (
          !erro && <div className="flex h-40 items-center justify-center"><Spinner /></div>
        ) : (
          <>
            {ehDocumento && (
              <div className="mb-4 flex">
                <Abas
                  valor={aba}
                  onTrocar={setAba}
                  rotulo={t('Propriedades')}
                  opcoes={[
                    { id: 'geral', nome: t('Geral') },
                    { id: 'organizacao', nome: t('Organização') },
                  ]}
                />
              </div>
            )}
            {aba === 'organizacao' && ehDocumento ? organizacao : geral}
          </>
        )}
      </Modal>

      <DestinationModal
        open={escolhendoPasta}
        title={t('Mover item')}
        confirmLabel={t('Escolher')}
        currentFolderId={form?.folder}
        onClose={() => setEscolhendoPasta(false)}
        onPick={(pasta) => {
          mudar({ folder: pasta })
          setEscolhendoPasta(false)
        }}
      />
    </>
  )
}

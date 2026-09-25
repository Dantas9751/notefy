import { useNavigate } from 'react-router-dom'
import {
  Columns2,
  Copy,
  Download,
  ExternalLink,
  FolderInput,
  Paperclip,
  PenLine,
  Trash2,
} from 'lucide-react'
import { Badge, ColorDot } from '@/components/ui'
import FavoriteButton from '@/components/FavoriteButton'
import SpotlightCard from '@/components/ui/SpotlightCard'
import { DOCUMENT_STATUS, documentPath, kindMeta } from '@/lib/documents'
import { limparDragPayload, setDragPayload } from '@/lib/dnd'
import { exportDocument, FORMATS } from '@/components/ExportMenu'
import api, { extractError } from '@/lib/api'
import { cn, formatBytes, formatRelative } from '@/lib/utils'

/**
 * Card de um item — serve os cinco tipos.
 *
 * É arrastável: soltar numa pasta da sidebar move o item. O `kind` decide
 * ícone, cor de acento e destino do clique; o resto do layout é igual, que
 * é o que faz nota, planilha e PDF conviverem na mesma grade.
 */
export default function DocumentCard({
  document: doc,
  onContextMenu,
  showFolder = false,
  //: Chamado depois de favoritar. A lista que desenha o cartão
  //: decide o que fazer: numa pasta o item só muda de cor.
  onFavorited,
  //: Estilo extra aplicado no PRÓPRIO cartão. Existe para a seleção
  //: múltipla: desenhar o anel num wrapper por fora faz ele seguir o raio
  //: do wrapper, e não o do cartão — sobra nos cantos. Aqui o anel nasce
  //: na mesma caixa e no mesmo arredondamento da borda que ele acompanha.
  className,
  //: Renomear no lugar. Vem do `useRenomear` da tela que lista — sem
  //: estas duas props o cartão se comporta exatamente como antes.
  renomeando = false,
  onRename,
  camposDeRenomear,
  erroDeRenomear,
  //: Marcado pela seleção múltipla. Libera o duplo clique para renomear
  //: e dá ao F2 um alvo sem depender do foco do teclado.
  selecionado = false,
}) {
  const navigate = useNavigate()
  const meta = kindMeta(doc.kind)
  const status = DOCUMENT_STATUS[doc.status] ?? DOCUMENT_STATUS.draft
  const accent = doc.color || meta.accent
  const isFile = doc.kind === 'file'

  return (
    <SpotlightCard
      as="article"
      // Arrastar precisa sair do caminho durante a edição: o campo fica
      // dentro do cartão, e selecionar texto com o mouse iniciaria um
      // arraste em vez de marcar as letras.
      draggable={!renomeando}
      onDragStart={(event) =>
        setDragPayload(event, {
          type: 'document',
          id: doc.id,
          title: doc.title,
          folderId: doc.folder,
          // `kind` viaja junto para o canvas desenhar o ícone certo ao
          // soltar o item nele — sem isso o nó precisaria buscar o
          // documento só para saber se é nota ou planilha.
          kind: doc.kind,
        })
      }
      onDragEnd={() => limparDragPayload()}
      onClick={() => !renomeando && navigate(documentPath(doc))}
      // Duplo clique só renomeia num item JÁ selecionado — a regra do
      // Explorer e do Finder. Aqui um clique solto ABRE o item, então num
      // cartão ainda não marcado o primeiro clique já navegou e o segundo
      // nunca chega: o gesto só existe depois que algo (Ctrl+clique, o
      // botão direito) marcou o cartão sem abri-lo.
      onDoubleClick={(event) => {
        if (!onRename || !selecionado) return
        event.preventDefault()
        event.stopPropagation()
        onRename()
      }}
      // F2 NÃO mora aqui: ele agiria só no cartão com foco de teclado, e
      // depois de um clique direito o foco está no menu, não no cartão.
      // Quem escuta é a tela, sobre o item SELECIONADO — a regra do
      // Explorer, e a única que casa com o botão direito.
      onContextMenu={(event) => onContextMenu?.(event, { type: 'document', document: doc })}
      className={cn(
        'card group flex h-full cursor-pointer flex-col p-4 transition active:cursor-grabbing',
        className,
      )}
    >
      {/* Sem a tarja de 3px à esquerda: era o único sinal de tipo do
          cartão e, repetida em toda a grade, virava uma cerca colorida.
          Um ponto do lado do título diz o mesmo em menos tinta, e o
          ícone já não precisa carregar cor. */}
      <div className="flex items-start gap-2">
        <span
          title={meta.label}
          className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        {renomeando ? (
          // Campo NO LUGAR do título, na mesma caixa e no mesmo tipo:
          // um modal para trocar um nome é uma viagem de ida e volta
          // para uma palavra.
          <span className="min-w-0 flex-1">
            <input
              {...camposDeRenomear}
              aria-invalid={!!erroDeRenomear}
              className={cn(
                'titulo w-full rounded-sm px-1 text-[15px] outline-none ring-1',
                erroDeRenomear
                  ? 'bg-red-50 ring-red-400 dark:bg-red-500/10'
                  : 'bg-accent-50 ring-accent-400 dark:bg-accent-500/15',
              )}
            />
            {/* O nome é único por pasta. Sem o motivo à vista, o campo só
                voltava ao nome antigo e parecia que renomear não funciona. */}
            {erroDeRenomear && (
              <span className="mt-1 block text-[11px] text-red-500">{erroDeRenomear}</span>
            )}
          </span>
        ) : (
          <h3 className="titulo min-w-0 flex-1 truncate text-[15px] group-hover:text-accent-700 dark:group-hover:text-accent-300">
            {doc.title}
          </h3>
        )}
        <FavoriteButton
          endpoint={`/documents/${doc.id}/`}
          value={doc.is_favorite}
          onChanged={onFavorited}
          className="mt-0.5"
        />
      </div>

      {doc.excerpt && !isFile && (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
          {doc.excerpt}
        </p>
      )}

      <div className="mt-auto pt-3 flex flex-wrap items-center gap-1.5">
        <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
          {meta.label}
        </Badge>

        {isFile ? (
          <span className="text-[11px] text-ink-400">{formatBytes(doc.size)}</span>
        ) : (
          <Badge className={status.className}>{status.label}</Badge>
        )}

        {/* Fora da pasta, mostrar onde o item mora é o que dá contexto —
            em Recentes ou na busca, o título sozinho não localiza nada. */}
        {showFolder && doc.category && (
          <span className="flex items-center gap-1 text-[11px] text-ink-400">
            <ColorDot color={doc.category.color} size={6} />
            {doc.category.name}
            {doc.folder_name && ` / ${doc.folder_name}`}
          </span>
        )}

        {/* Etiquetas do item, depois da categoria de moradia. Ponto
            colorido e nome, sem caixa: já há dois selos nesta linha
            (tipo e status), e um terceiro estilo de pílula transformaria
            o rodapé do cartão numa estante de adesivos. */}
        {(doc.categories_detail ?? []).map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 text-[11px] text-ink-400"
          >
            <ColorDot color={tag.color} size={5} />
            {tag.name}
          </span>
        ))}

        {doc.attachment_count > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] text-ink-400">
            <Paperclip size={10} />
            {doc.attachment_count}
          </span>
        )}

        <span className={cn('ml-auto text-[11px] text-ink-400')}>
          {formatRelative(doc.updated_at)}
        </span>
      </div>
    </SpotlightCard>
  )
}

/** Itens do menu de contexto de um documento. */
export function documentMenuItems(
  doc,
  { navigate, onMove, onDuplicate, onDelete, onOpenAside, onRename, onError },
) {
  return [
    { label: 'Abrir', icon: ExternalLink, onClick: () => navigate(documentPath(doc)) },
    ...(onOpenAside
      ? [{
          label: 'Abrir ao lado',
          icon: Columns2,
          disabled: !doc.id || String(doc.id).length < 8,
          onClick: () => onOpenAside({ path: documentPath(doc), title: doc.title }),
        }]
      : []),
    // Renomear nasce AQUI, e não em cada tela: este é o menu que a pasta,
    // a categoria, recentes, a busca e os arquivos abrem. Faltar aqui era
    // o motivo de um PDF importado não ter como trocar de nome em lugar
    // nenhum — o editor de texto renomeia pelo título, mas arquivo abre
    // no visualizador, que não tem campo de título.
    ...(onRename
      ? [{ label: 'Renomear', icon: PenLine, atalho: 'F2', onClick: onRename }]
      : []),
    { label: 'Mover para...', icon: FolderInput, onClick: onMove },
    { label: 'Duplicar', icon: Copy, onClick: onDuplicate },
    ...((FORMATS[doc.kind] ?? []).length
      ? [{
          label: 'Exportar',
          icon: Download,
          // A lista de uma pasta/recentes não traz o `data` do documento;
          // buscar o payload completo é o que permite converter de fato.
          submenu: FORMATS[doc.kind].map((f) => ({
            label: f.label,
            onClick: async () => {
              try {
                const { data } = await api.get(`/documents/${doc.id}/`)
                await exportDocument(data, f.ext)
              } catch (err) {
                onError?.(extractError(err))
              }
            },
          })),
        }]
      : []),
    { separator: true },
    { label: 'Excluir', icon: Trash2, danger: true, onClick: onDelete },
  ]
}
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { escaparTexto, limparHtml } from '@/lib/sanitizar'
import { cn } from '@/lib/utils'
import LinkPromptModal from '@/components/modals/LinkPromptModal'
import { useMenuSuspenso } from '@/hooks/useMenuSuspenso'

/**
 * Editor de texto rico sobre `contentEditable`.
 *
 * Usa `document.execCommand`, que está marcado como deprecated mas segue
 * implementado em todos os navegadores atuais e é a única forma de editar
 * texto rico sem trazer um ProseMirror/TipTap inteiro — o frontend tem seis
 * dependências e a ideia é que continue assim.
 *
 * O conteúdo é HTML e o valor só é empurrado para dentro do DOM quando
 * vem de fora (troca de documento). Reescrever o innerHTML a cada tecla
 * destruiria a posição do cursor.
 */

const FONTS = [
  { label: 'Padrão', value: '' },
  { label: 'Serifada', value: 'Georgia, serif' },
  { label: 'Sem serifa', value: 'Inter, system-ui, sans-serif' },
  { label: 'Monoespaçada', value: 'JetBrains Mono, Consolas, monospace' },
]

const SIZES = [
  { label: 'Pequeno', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Médio', value: '4' },
  { label: 'Grande', value: '5' },
  { label: 'Enorme', value: '6' },
]

const BLOCKS = [
  { label: 'Parágrafo', value: 'p' },
  { label: 'Título 1', value: 'h1' },
  { label: 'Título 2', value: 'h2' },
  { label: 'Título 3', value: 'h3' },
  { label: 'Código', value: 'pre' },
]

const TEXT_COLORS = [
  '#1a1816', '#EF4444', '#F59E0B', '#10B981',
  '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899',
]

const HIGHLIGHTS = [
  'transparent', '#FEF08A', '#BBF7D0', '#BFDBFE',
  '#FBCFE8', '#DDD6FE', '#FED7AA', '#E5E7EB',
]

function ToolbarButton({ icon: Icon, label, active, onClick, disabled = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // onMouseDown em vez de onClick: o clique tira o foco do
      // contentEditable e a seleção some antes do comando rodar.
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'rounded p-1.5 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800',
        'dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100',
        'disabled:cursor-wait disabled:opacity-50',
        active && 'bg-ink-100 text-accent-600 dark:bg-ink-800 dark:text-accent-400',
      )}
    >
      <Icon size={15} />
    </button>
  )
}

function ColorPicker({ icon: Icon, label, colors, onPick, transparentLabel }) {
  const [open, setOpen] = useState(false)
  const { ref: menuRef, paraCima } = useMenuSuspenso(open)

  return (
    <div className="relative">
      <ToolbarButton icon={Icon} label={label} active={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onMouseDown={() => setOpen(false)} aria-hidden />
          <div
            ref={menuRef}
            className={cn(
              'absolute left-0 z-20 grid w-[132px] grid-cols-4 gap-1 rounded-md border border-ink-200 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-900',
              paraCima ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                title={color === 'transparent' ? transparentLabel : color}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(color)
                  setOpen(false)
                }}
                style={{ backgroundColor: color === 'transparent' ? undefined : color }}
                className={cn(
                  'h-6 w-6 rounded border border-ink-200 transition hover:scale-110 dark:border-ink-700',
                  color === 'transparent' &&
                    'bg-[linear-gradient(45deg,transparent_45%,#ef4444_45%,#ef4444_55%,transparent_55%)]',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-ink-200 dark:bg-ink-700" />
}

/** Sentinela de "ainda não escrevi nada no DOM".
 *
 *  Inicializar a ref com o próprio `value` faria a primeira execução do
 *  efeito concluir que o conteúdo já está sincronizado — e a nota abriria
 *  em branco, porque o innerHTML nunca chegou a ser preenchido. */
const UNSET = Symbol('unset')

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  compact = false,
  //: Nota que hospeda a imagem. Sem ele o botão de imagem não aparece —
  //: um upload sem dono viraria arquivo solto na raiz.
  documentId,
  //: Recebe o cursor ao aparecer. Vem de quem acabou de INSERIR esta
  //: seção: sem isso, clicar em "Texto" criava o bloco e deixava a
  //: pessoa clicar de novo para poder escrever nele.
  autoFocus = false,
  //: Para onde mandar a falha do upload de imagem. Sem ele o `catch`
  //: engolia o erro e a pessoa colava, via o spinner e não via imagem
  //: nenhuma — sem nada na tela explicando o porquê.
  onError,
}) {
  const editorRef = useRef(null)
  const wrapperRef = useRef(null)
  const lastValueRef = useRef(UNSET)
  const imagemRef = useRef(null)
  const [marks, setMarks] = useState({})
  const [enviandoImagem, setEnviandoImagem] = useState(false)
  // No modo compacto a barra só aparece na seção em foco: com várias
  // seções de texto numa nota, uma barra fixa por seção empilharia
  // toolbars e afogaria o texto.
  const [focused, setFocused] = useState(false)
  const [linkAberto, setLinkAberto] = useState(false)
  // Onde o link vai entrar, guardado enquanto o modal rouba o foco.
  const intervaloRef = useRef(null)

  // Uma vez, na montagem. O `focus()` de um contentEditable põe o cursor
  // no começo, que é onde ele deve estar num bloco recém-criado.
  useEffect(() => {
    if (autoFocus) editorRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Só sincroniza quando o HTML mudou por fora (abrir outro documento).
  useEffect(() => {
    if (!editorRef.current) return
    if (value === lastValueRef.current) return
    // Higienizado ANTES de entrar no DOM. Este `innerHTML` é o ponto
    // onde todo caminho de HTML de fora desemboca — backup importado,
    // resposta da IA, colar de uma página web — e o backend guarda o
    // campo sem tocar nele. Ver `lib/sanitizar.js`.
    editorRef.current.innerHTML = limparHtml(value)
    lastValueRef.current = value
  }, [value])

  const exec = useCallback(
    (command, argument = null) => {
      editorRef.current?.focus()
      document.execCommand(command, false, argument)
      const html = editorRef.current?.innerHTML ?? ''
      lastValueRef.current = html
      onChange(html)
      refreshMarks()
    },
    [onChange],
  )

  /** Estado dos botões, para refletir a formatação sob o cursor. */
  const refreshMarks = useCallback(() => {
    if (!editorRef.current) return
    try {
      setMarks({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
      })
    } catch {
      /* queryCommandState lança se não houver seleção viva */
    }
  }, [])

  const handleInput = () => {
    const html = editorRef.current?.innerHTML ?? ''
    lastValueRef.current = html
    onChange(html)
  }

  const handlePaste = (e) => {
    // Print Screen e Ctrl+V é como se põe imagem numa nota de estudo —
    // o slide, a foto do quadro, o gráfico do livro. Sem este ramo o
    // conteúdo caía no `getData('text/plain')`, que para imagem é vazio:
    // o Ctrl+V simplesmente não fazia nada.
    const imagem = [...(e.clipboardData?.items ?? [])]
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile()
    if (imagem && documentId) {
      e.preventDefault()
      enviarImagem(imagem)
      return
    }

    // Colar de outro app traria estilos e fontes de fora, que destroem a
    // consistência tipográfica da nota. Colamos como texto puro.
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const handleKeyDown = (e) => {
    // Tab dentro do editor deve indentar, não pular para o próximo campo.
    if (e.key === 'Tab') {
      e.preventDefault()
      exec(e.shiftKey ? 'outdent' : 'indent')
    }
  }

  /**
   * Abre o modal de link guardando ONDE ele deve ser aplicado.
   *
   * `createLink` age sobre a seleção viva, e abrir o modal move o foco
   * para o campo de texto dele — a seleção do editor morre no caminho. Por
   * isso o intervalo é clonado antes e recolocado na hora de inserir; sem
   * isso o link não teria onde entrar.
   */
  const insertLink = () => {
    const selecao = window.getSelection()
    intervaloRef.current =
      selecao && selecao.rangeCount > 0 && editorRef.current?.contains(selecao.anchorNode)
        ? selecao.getRangeAt(0).cloneRange()
        : null
    setLinkAberto(true)
  }

  /**
   * Envia a imagem e a insere onde o cursor está.
   *
   * Sobe como ANEXO da nota (`attached_to`), e não como arquivo solto: a
   * listagem da pasta usa `loose()`, que exclui anexo — sem isso, colar
   * cinco prints numa nota encheria a pasta de cinco itens que ninguém
   * pediu. O endpoint já herda a pasta do documento hospedeiro.
   */
  const enviarImagem = async (arquivo) => {
    // Dois envios ao mesmo tempo disputariam o mesmo ponto de inserção.
    if (!arquivo || !documentId || enviandoImagem) return

    // O intervalo é clonado ANTES do upload e recolocado depois — o mesmo
    // que `insertLink` faz. Foi o bug de "colei uma vez e na segunda não
    // foi": o `await` mata a seleção viva do contentEditable, e o
    // `execCommand` sem seleção dentro do elemento não insere nada.
    const selecao = window.getSelection()
    intervaloRef.current =
      selecao && selecao.rangeCount > 0 && editorRef.current?.contains(selecao.anchorNode)
        ? selecao.getRangeAt(0).cloneRange()
        : null

    setEnviandoImagem(true)
    try {
      const corpo = new FormData()
      corpo.append('files', arquivo)
      corpo.append('attached_to', documentId)
      const { data } = await api.post('/documents/upload/', corpo)
      const url = data?.[0]?.file_url
      if (!url) return

      editorRef.current?.focus()
      if (intervaloRef.current) {
        const viva = window.getSelection()
        viva.removeAllRanges()
        viva.addRange(intervaloRef.current)
      }
      // `alt` com o nome original: é o que a busca e um leitor de tela
      // têm para trabalhar depois.
      // `alt` com o nome original: é o que a busca e um leitor de tela
      // têm para trabalhar depois. Escapado porque é nome de ARQUIVO —
      // uma aspa nele fecharia o atributo e o resto viraria markup.
      exec('insertHTML', `<img src="${url}" alt="${escaparTexto(arquivo.name)}" />`)
    } catch (err) {
      onError?.(extractError(err))
    } finally {
      intervaloRef.current = null
      setEnviandoImagem(false)
    }
  }

  const aplicarLink = (url) => {
    const intervalo = intervaloRef.current
    editorRef.current?.focus()

    if (intervalo) {
      const selecao = window.getSelection()
      selecao.removeAllRanges()
      selecao.addRange(intervalo)
    }

    exec('createLink', url)
    intervaloRef.current = null
  }

  /**
   * Só perde o foco quem sai da SEÇÃO inteira, não só do texto.
   *
   * Clicar num `<select>` da barra tira o foco do contentEditable, e o
   * antigo `onBlur` do texto escondia a barra enquanto o menu de tamanho
   * de fonte ainda estava aberto — a opção era escolhida no vazio. Como o
   * foco novo já veio no evento (`relatedTarget`), basta perguntar se ele
   * caiu dentro desta mesma seção; o `contains` cobre barra e editor de
   * uma vez, sem precisar de listener global nem de portal.
   */
  const handleBlur = (event) => {
    const indoPara = event.relatedTarget
    if (indoPara && wrapperRef.current?.contains(indoPara)) return
    setFocused(false)
  }

  const showToolbar = !compact || focused

  return (
    <div
      ref={wrapperRef}
      onBlur={handleBlur}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        // `hidden` em vez de desmontar: remover a barra do DOM tiraria o
        // foco do editor no meio da formatação.
        className={cn(
          'z-10 flex flex-wrap items-center gap-0.5 border-b border-ink-100 bg-white/95 px-1 py-1.5 backdrop-blur dark:border-ink-800 dark:bg-ink-950/95',
          compact
            ? 'sticky top-0 rounded-t-md border border-ink-200 dark:border-ink-700'
            : 'sticky top-0',
          !showToolbar && 'hidden',
        )}
      >
        <select
          onChange={(e) => exec('formatBlock', e.target.value)}
          aria-label="Estilo do bloco"
          className="h-8 rounded border-0 bg-transparent px-1.5 text-xs text-ink-600 focus:ring-1 focus:ring-accent-400 dark:text-ink-300"
        >
          {BLOCKS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        <select
          onChange={(e) => exec('fontName', e.target.value)}
          aria-label="Fonte"
          className="h-8 rounded border-0 bg-transparent px-1.5 text-xs text-ink-600 focus:ring-1 focus:ring-accent-400 dark:text-ink-300"
        >
          {FONTS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          onChange={(e) => exec('fontSize', e.target.value)}
          defaultValue="3"
          aria-label="Tamanho"
          className="h-8 rounded border-0 bg-transparent px-1.5 text-xs text-ink-600 focus:ring-1 focus:ring-accent-400 dark:text-ink-300"
        >
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <Divider />

        <ToolbarButton icon={Bold} label="Negrito (Ctrl+B)" active={marks.bold} onClick={() => exec('bold')} />
        <ToolbarButton icon={Italic} label="Itálico (Ctrl+I)" active={marks.italic} onClick={() => exec('italic')} />
        <ToolbarButton icon={Underline} label="Sublinhado (Ctrl+U)" active={marks.underline} onClick={() => exec('underline')} />
        <ToolbarButton icon={Strikethrough} label="Tachado" active={marks.strikeThrough} onClick={() => exec('strikeThrough')} />

        <Divider />

        <ColorPicker
          icon={Type}
          label="Cor do texto"
          colors={TEXT_COLORS}
          onPick={(color) => exec('foreColor', color)}
        />
        <ColorPicker
          icon={Highlighter}
          label="Destaque"
          colors={HIGHLIGHTS}
          transparentLabel="Sem destaque"
          onPick={(color) => exec('hiliteColor', color)}
        />

        <Divider />

        <ToolbarButton icon={List} label="Lista" active={marks.insertUnorderedList} onClick={() => exec('insertUnorderedList')} />
        <ToolbarButton icon={ListOrdered} label="Lista numerada" active={marks.insertOrderedList} onClick={() => exec('insertOrderedList')} />
        <ToolbarButton icon={Quote} label="Citação" onClick={() => exec('formatBlock', 'blockquote')} />
        {documentId && (
          <ToolbarButton
            icon={ImagePlus}
            label={enviandoImagem ? 'Enviando imagem...' : 'Imagem'}
            disabled={enviandoImagem}
            onClick={() => imagemRef.current?.click()}
          />
        )}
        <ToolbarButton icon={Code} label="Código" onClick={() => exec('formatBlock', 'pre')} />

        <Divider />

        <ToolbarButton icon={AlignLeft} label="Alinhar à esquerda" active={marks.justifyLeft} onClick={() => exec('justifyLeft')} />
        <ToolbarButton icon={AlignCenter} label="Centralizar" active={marks.justifyCenter} onClick={() => exec('justifyCenter')} />
        <ToolbarButton icon={AlignRight} label="Alinhar à direita" active={marks.justifyRight} onClick={() => exec('justifyRight')} />

        <Divider />

        <ToolbarButton icon={Link2} label="Inserir link" onClick={insertLink} />
        <ToolbarButton icon={RemoveFormatting} label="Limpar formatação" onClick={() => exec('removeFormat')} />

        <Divider />

        <ToolbarButton icon={Undo2} label="Desfazer" onClick={() => exec('undo')} />
        <ToolbarButton icon={Redo2} label="Refazer" onClick={() => exec('redo')} />
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Conteúdo da nota"
        data-placeholder={placeholder}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onKeyUp={refreshMarks}
        onMouseUp={refreshMarks}
        onFocus={() => {
          setFocused(true)
          refreshMarks()
        }}
        className={cn(
          'prose-note flex-1 px-1 focus:outline-none',
          compact ? 'min-h-[3rem] py-2' : 'min-h-[55vh] py-6',
          // O placeholder é CSS puro: um :empty::before. Um nó de texto
          // real precisaria ser removido no primeiro caractere digitado e
          // acabaria salvo dentro do conteúdo.
          'empty:before:pointer-events-none empty:before:text-ink-300',
          'empty:before:content-[attr(data-placeholder)] dark:empty:before:text-ink-700',
        )}
      />

      {/* Escondido: quem abre o seletor é o botão da barra. Um
          <input type="file"> visível não combina com uma barra de
          formatação, e o nativo não é estilizável. */}
      <input
        ref={imagemRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          enviarImagem(e.target.files?.[0])
          // Zera para o mesmo arquivo poder ser escolhido de novo.
          e.target.value = ''
        }}
      />

      <LinkPromptModal
        open={linkAberto}
        onClose={() => setLinkAberto(false)}
        onConfirm={aplicarLink}
      />
    </div>
  )
}

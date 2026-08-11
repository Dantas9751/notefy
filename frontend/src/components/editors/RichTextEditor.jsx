import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
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
import { cn } from '@/lib/utils'

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

function ToolbarButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // onMouseDown em vez de onClick: o clique tira o foco do
      // contentEditable e a seleção some antes do comando rodar.
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'rounded p-1.5 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800',
        'dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100',
        active && 'bg-ink-100 text-accent-600 dark:bg-ink-800 dark:text-accent-400',
      )}
    >
      <Icon size={15} />
    </button>
  )
}

function ColorPicker({ icon: Icon, label, colors, onPick, transparentLabel }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <ToolbarButton icon={Icon} label={label} active={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onMouseDown={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full z-20 mt-1 grid w-[132px] grid-cols-4 gap-1 rounded-md border border-ink-200 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-900">
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

export default function RichTextEditor({ value, onChange, placeholder, compact = false }) {
  const editorRef = useRef(null)
  const lastValueRef = useRef(UNSET)
  const [marks, setMarks] = useState({})
  // No modo compacto a barra só aparece na seção em foco: com várias
  // seções de texto numa nota, uma barra fixa por seção empilharia
  // toolbars e afogaria o texto.
  const [focused, setFocused] = useState(false)

  // Só sincroniza quando o HTML mudou por fora (abrir outro documento).
  useEffect(() => {
    if (!editorRef.current) return
    if (value === lastValueRef.current) return
    editorRef.current.innerHTML = value || ''
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

  const insertLink = () => {
    const url = window.prompt('Endereço do link:', 'https://')
    if (url) exec('createLink', url)
  }

  const showToolbar = !compact || focused

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        // O blur é adiado: clicar num botão da barra tira o foco do
        // contentEditable por um instante, e esconder a barra nesse
        // intervalo cancelaria o próprio comando.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
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
    </div>
  )
}

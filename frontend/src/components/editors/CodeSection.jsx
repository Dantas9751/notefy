import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsDownUp, ChevronsUpDown, Copy, Trash2 } from 'lucide-react'
import { CODE_LANGUAGES, detectLanguage, highlightCode } from '@/lib/highlight'
import { cn } from '@/lib/utils'

/**
 * Bloco de código de uma nota.
 *
 * O texto editável é um <textarea> transparente sobreposto ao HTML
 * colorido. É o truque padrão para editar código realçado sem um editor
 * completo: o usuário digita num campo comum — com seleção, desfazer e
 * corretor do sistema funcionando — e enxerga as cores por baixo.
 *
 * Os dois precisam usar EXATAMENTE a mesma métrica de fonte, senão o
 * cursor desalinha do texto colorido a partir de alguns caracteres.
 */
const SHARED = 'font-mono text-[13px] leading-[1.6] p-3 whitespace-pre-wrap break-words'

export default function CodeSection({ section, onChange, onDelete, readOnly = false }) {
  const textareaRef = useRef(null)
  const preRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const code = section.code ?? ''
  const language = section.language ?? 'plaintext'
  const lineCount = code ? code.split('\n').length : 1

  // O <pre> rola junto com o textarea; sem isso o código colorido fica
  // parado enquanto o cursor desce.
  const syncScroll = () => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop
      preRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  // Cresce com o conteúdo em vez de rolar dentro de si: numa nota, um
  // bloco com barra de rolagem própria esconde o que se quer ler.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [code, collapsed])

  const handleKeyDown = (event) => {
    if (event.key === 'Tab') {
      // Tab indenta em vez de pular para o próximo campo — dentro de um
      // bloco de código é o que qualquer editor faz.
      event.preventDefault()
      const el = event.target
      const { selectionStart: start, selectionEnd: end } = el
      const next = `${code.slice(0, start)}  ${code.slice(end)}`
      onChange({ code: next })
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2
      })
    }
  }

  const handlePaste = (event) => {
    // Colar um trecho reconhecível já escolhe a linguagem, poupando o
    // passo manual no caso mais comum.
    if (language !== 'plaintext') return
    const pasted = event.clipboardData.getData('text/plain')
    const detected = detectLanguage(pasted)
    if (detected) onChange({ language: detected })
  }

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
      <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-2 py-1.5 dark:border-ink-700 dark:bg-ink-900">
        {readOnly ? (
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
            {CODE_LANGUAGES.find((l) => l.value === language)?.label ?? language}
          </span>
        ) : (
          <select
            value={language}
            onChange={(e) => onChange({ language: e.target.value })}
            aria-label="Linguagem do bloco"
            className="h-6 cursor-pointer rounded border-0 bg-transparent py-0 pl-1 pr-6 text-[11px] font-medium text-ink-600 focus:ring-1 focus:ring-accent-400 dark:text-ink-300"
          >
            {CODE_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        )}

        {!readOnly && (
          <input
            value={section.title ?? ''}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="nome do arquivo (opcional)"
            className="h-6 min-w-0 flex-1 border-0 bg-transparent px-1 text-[11px] text-ink-500 placeholder:text-ink-300 focus:ring-0 dark:text-ink-400"
          />
        )}
        {readOnly && section.title && (
          <span className="flex-1 truncate text-[11px] text-ink-500">{section.title}</span>
        )}

        <span className="shrink-0 text-[10px] tabular-nums text-ink-400">
          {lineCount} linha{lineCount === 1 ? '' : 's'}
        </span>

        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expandir' : 'Recolher'}
          className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
        >
          {collapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
        </button>
        <button
          onClick={copy}
          title="Copiar código"
          className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
        {!readOnly && (
          <button
            onClick={onDelete}
            title="Excluir bloco"
            className="shrink-0 rounded p-1 text-ink-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-red-500/10"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="relative bg-white dark:bg-ink-950">
          <pre
            ref={preRef}
            aria-hidden
            className={cn(SHARED, 'hljs pointer-events-none m-0 overflow-hidden')}
            dangerouslySetInnerHTML={{
              // A quebra de linha final some no <pre> e o realce ficaria
              // um pouco mais curto que o textarea; o espaço a preserva.
              __html: `${highlightCode(code, language)}\n`,
            }}
          />
          {!readOnly && (
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => onChange({ code: e.target.value })}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onScroll={syncScroll}
              spellCheck={false}
              placeholder="Cole ou digite o código..."
              className={cn(
                SHARED,
                'absolute inset-0 h-full w-full resize-none overflow-hidden border-0',
                // Texto transparente com cursor visível: o que se lê é o
                // <pre> colorido embaixo.
                'bg-transparent text-transparent caret-ink-900 focus:ring-0 dark:caret-ink-100',
                'placeholder:text-ink-300',
              )}
            />
          )}
        </div>
      )}
    </div>
  )
}

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Check, ChevronsDownUp, ChevronsUpDown, Copy, Play, Square, Trash2 } from 'lucide-react'
import {
  CODE_LANGUAGES,
  detectLanguage,
  highlightCode,
  renameForLanguage,
} from '@/lib/highlight'
import { copiarTexto } from '@/lib/desktop'
import { podeExecutar, useExecucao } from '@/hooks/useExecucao'
import SaidaDoCodigo from './SaidaDoCodigo'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

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

const CodeSection = forwardRef(function CodeSection(
  {
    section,
    onChange,
    onDelete,
    readOnly = false,
    onSair,
    onApagarBloco,
    //: Recém-inserido: o bloco chega depois do resto (é carregado sob
    //: demanda) e se foca sozinho ao montar.
    autoFocus = false,
  },
  ref,
) {
  const textareaRef = useRef(null)
  const preRef = useRef(null)
  const playRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const code = section.code ?? ''
  const language = section.language ?? 'plaintext'
  const lineCount = code ? code.split('\n').length : 1
  const execucao = useExecucao()
  const executavel = podeExecutar(language)
  const executando = execucao.estado !== 'parado'
  // Parar vale mesmo se a linguagem mudou no meio da execução.
  const clicavel = executavel || executando
  const alternarExecucao = () => (executando ? execucao.parar() : execucao.rodar(language, code))

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

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    focar: (onde = 'fim') => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const p = onde === 'inicio' ? 0 : el.value.length
      el.setSelectionRange(p, p)
    },
  }))

  const handleKeyDown = (event) => {
    const el = event.target
    const { selectionStart: inicio, selectionEnd: fim } = el
    // Em JavaScript e Python, Ctrl+Enter executa, como num notebook.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && clicavel) {
      event.preventDefault()
      alternarExecucao()
      return
    }
    // Saídas do bloco, para a página continuar sem o mouse: Ctrl+Enter ou
    // Esc descem para o texto, e a seta só sai quando já está na ponta —
    // no meio do código ela anda entre as linhas, como em qualquer editor.
    if ((event.key === 'Enter' && (event.ctrlKey || event.metaKey)) || event.key === 'Escape') {
      event.preventDefault()
      onSair?.('baixo')
      return
    }
    if (event.key === 'ArrowDown' && !event.shiftKey && inicio === fim && fim === code.length) {
      event.preventDefault()
      onSair?.('baixo')
      return
    }
    if (event.key === 'ArrowUp' && !event.shiftKey && inicio === fim && inicio === 0) {
      event.preventDefault()
      onSair?.('cima')
      return
    }
    if (event.key === 'Backspace' && !code && inicio === 0 && fim === 0) {
      event.preventDefault()
      onApagarBloco?.('cima')
      return
    }
    if (event.key === 'Tab') {
      // Tab indenta em vez de pular para o próximo campo — dentro de um
      // bloco de código é o que qualquer editor faz.
      event.preventDefault()
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
    if (detected) changeLanguage(detected)
  }

  /**
   * Trocar a linguagem arrasta a extensão do nome junto.
   *
   * Um bloco marcado como Python chamado `main.js` mente sobre o próprio
   * conteúdo, e era o que acontecia ao mudar o seletor depois de nomear.
   * Um `patch` só, para nome e linguagem viajarem no mesmo estado.
   */
  const changeLanguage = (next) =>
    onChange({ language: next, title: renameForLanguage(section.title, next) })

  const copy = async () => {
    // A marca de "copiado" só aparece se realmente copiou: mostrar o
    // check quando a área de transferência recusou é pior do que não
    // mostrar nada, porque a pessoa vai colar e não vem nada.
    if (!(await copiarTexto(code))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
      {/* No celular o nome do arquivo desce para uma linha própria: na mesma
          linha da linguagem e dos botões ele ficava com um caractere. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink-200 bg-ink-50 px-2 py-1.5 dark:border-ink-700 dark:bg-ink-900">
        {readOnly ? (
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
            {CODE_LANGUAGES.find((l) => l.value === language)?.label ?? language}
          </span>
        ) : (
          <select
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
            aria-label={t('Linguagem do bloco')}
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
            placeholder={t('nome do arquivo (opcional)')}
            className="order-last h-6 min-w-0 basis-full border-0 bg-transparent px-1 text-[11px] text-ink-500 placeholder:text-ink-300 focus:ring-0 dark:text-ink-400 sm:order-none sm:basis-auto sm:flex-1"
          />
        )}
        {readOnly && section.title && (
          <span className="order-last basis-full truncate text-[11px] text-ink-500 sm:order-none sm:basis-auto sm:flex-1">{section.title}</span>
        )}

        <span className="shrink-0 text-[10px] tabular-nums text-ink-400 max-sm:ml-auto">
          {lineCount === 1 ? t('1 linha') : t('{n} linhas', { n: lineCount })}
        </span>

        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? t('Expandir') : t('Recolher')}
          className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
        >
          {collapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
        </button>
        <button
          onClick={copy}
          title={t('Copiar código')}
          className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
        {!readOnly && (
          <button
            onClick={onDelete}
            aria-label={t('Excluir bloco')}
            title={t('Excluir bloco')}
            className="shrink-0 rounded p-1 text-ink-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-red-500/10"
          >
            <Trash2 size={12} />
          </button>
        )}
        {/* aria-disabled e não disabled: botão desabilitado não mostra o
            title, e é o title que explica por que ele está cinza. */}
        <button
          ref={playRef}
          onClick={() => clicavel && alternarExecucao()}
          aria-disabled={!clicavel}
          aria-label={executando ? t('Parar') : t('Executar')}
          title={
            !clicavel
              ? t('Só dá para executar JavaScript e Python')
              : executando ? t('Parar') : t('Executar (Ctrl+Enter)')
          }
          className={cn(
            'shrink-0 rounded p-1 transition',
            clicavel
              ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10'
              : 'cursor-not-allowed text-ink-300 dark:text-ink-600',
          )}
        >
          {executando ? <Square size={12} className="fill-current" /> : <Play size={12} className="fill-current" />}
        </button>
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
              placeholder={t('Cole ou digite o código...')}
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
      {(executando || execucao.saida) && (
        <SaidaDoCodigo
          estado={execucao.estado}
          saida={execucao.saida ?? []}
          // Responder desmonta o campo: o foco vai para o ▶/■, e não se
          // perde no <body>. Se o código perguntar de novo, o campo volta
          // e pega o foco outra vez.
          onResponder={(valor) => {
            execucao.responder(valor)
            playRef.current?.focus()
          }}
          onFechar={execucao.limpar}
        />
      )}
    </div>
  )
})

export default CodeSection

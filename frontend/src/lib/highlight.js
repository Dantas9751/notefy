/**
 * Destaque de sintaxe dos blocos de código.
 *
 * Importa o núcleo do highlight.js e registra só as linguagens que a nota
 * oferece. O pacote completo traz 190+ gramáticas e passa de 1 MB; assim
 * o bundle carrega apenas o que aparece no seletor.
 */

import hljs from 'highlight.js/lib/core'

import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const LANGUAGES = {
  plaintext, python, javascript, typescript, java, c, cpp, csharp,
  go, rust, php, ruby, kotlin, swift, sql, bash, powershell,
  json, yaml, xml, css, scss, markdown, dockerfile, ini,
}

Object.entries(LANGUAGES).forEach(([name, definition]) => {
  hljs.registerLanguage(name, definition)
})

// JSX e TSX não têm gramática própria: são apelidos das de JS e TS.
hljs.registerAliases(['jsx'], { languageName: 'javascript' })
hljs.registerAliases(['tsx'], { languageName: 'typescript' })
hljs.registerAliases(['html'], { languageName: 'xml' })

/** Lista do seletor de linguagem, com rótulos legíveis. */
export const CODE_LANGUAGES = [
  { value: 'plaintext', label: 'Texto simples' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'ini', label: 'INI' },
]

/**
 * HTML colorido de um trecho de código.
 *
 * Devolve o texto escapado se a linguagem for desconhecida ou o realce
 * falhar — um bloco sem cor é melhor do que um bloco sem conteúdo.
 */
export function highlightCode(code, language) {
  const source = code ?? ''
  if (!source) return ''

  if (!language || language === 'plaintext' || !hljs.getLanguage(language)) {
    return escapeHtml(source)
  }
  try {
    return hljs.highlight(source, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(source)
  }
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Detecta a linguagem de um trecho colado, para pré-selecionar no bloco. */
export function detectLanguage(code) {
  if (!code || code.length < 20) return null
  try {
    const { language, relevance } = hljs.highlightAuto(code, Object.keys(LANGUAGES))
    // Relevância baixa é chute; melhor deixar em texto simples do que
    // colorir errado e confundir quem lê.
    return relevance >= 10 ? language : null
  } catch {
    return null
  }
}

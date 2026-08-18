import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui'
import { formatBytes } from '@/lib/utils'

/**
 * Acima disto, ler o arquivo inteiro na memória da janela trava a
 * interface por segundos — e ninguém lê um log de 50 MB dentro de um
 * visualizador. Passando do teto, sobra o download, que é o caminho certo
 * para esse tamanho.
 */
const TETO_BYTES = 1024 * 1024

/** Linhas de tabela mostradas antes de cortar. */
const TETO_LINHAS_CSV = 500

/**
 * Extensão → gramática do highlight.js.
 *
 * Só nomes já registrados em `lib/highlight.js`; o que não estiver aqui
 * cai em texto simples, que continua legível.
 */
const LINGUAGEM_POR_EXTENSAO = {
  py: 'python',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx',
  java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  go: 'go', rs: 'rust', php: 'php', rb: 'ruby', kt: 'kotlin', swift: 'swift',
  sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
  json: 'json', yml: 'yaml', yaml: 'yaml',
  xml: 'xml', html: 'html', htm: 'html', svg: 'xml',
  css: 'css', scss: 'scss', sass: 'scss',
  md: 'markdown', markdown: 'markdown',
  ini: 'ini', cfg: 'ini', conf: 'ini', toml: 'ini', env: 'ini',
  dockerfile: 'dockerfile',
}

/** Extensões de texto sem gramática própria — abrem como texto simples. */
const EXTENSOES_SIMPLES = ['txt', 'log', 'csv', 'tsv', 'gitignore', 'lock']

const extensaoDe = (nome) => (nome || '').split('.').pop()?.toLowerCase() ?? ''

/**
 * O arquivo é legível como texto?
 *
 * O `file_kind` do servidor não serve para decidir: ele junta `.txt` e
 * `.docx` sob "documento", e um `.py` cai em "outro". O MIME e a extensão
 * respondem com precisão, e o MIME já vem no serializer.
 */
export function ehArquivoDeTexto(doc) {
  if (!doc?.file_url) return false
  const mime = doc.mime_type || ''
  if (mime.startsWith('text/')) return true
  if (['application/json', 'application/xml', 'application/javascript'].includes(mime)) {
    return true
  }
  const ext = extensaoDe(doc.original_name || doc.title)
  return ext in LINGUAGEM_POR_EXTENSAO || EXTENSOES_SIMPLES.includes(ext)
}

/** Divide CSV/TSV respeitando aspas — vírgula dentro de campo é conteúdo. */
function separarTabela(texto, separador) {
  const linhas = []
  let campo = ''
  let linha = []
  let entreAspas = false

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i]
    if (entreAspas) {
      if (c !== '"') campo += c
      else if (texto[i + 1] === '"') {
        campo += '"'
        i += 1
      } else entreAspas = false
    } else if (c === '"') entreAspas = true
    else if (c === separador) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n') {
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else if (c !== '\r') campo += c
  }

  if (campo || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas
}

/**
 * Pré-visualização de arquivos de texto.
 *
 * Reaproveita o mesmo `highlight.js` dos blocos de código da nota, com o
 * mesmo carregamento sob demanda: quem abre um PDF não paga o bundle das
 * gramáticas.
 */
export default function TextFilePreview({ doc }) {
  const [texto, setTexto] = useState(null)
  const [html, setHtml] = useState(null)
  const [erro, setErro] = useState(null)

  const extensao = extensaoDe(doc.original_name || doc.title)
  const linguagem = LINGUAGEM_POR_EXTENSAO[extensao] ?? 'plaintext'
  const separador = extensao === 'tsv' ? '\t' : extensao === 'csv' ? ',' : null
  const grandeDemais = doc.size > TETO_BYTES

  useEffect(() => {
    if (grandeDemais) return undefined

    let ativo = true
    setTexto(null)
    setHtml(null)
    setErro(null)

    // Só o caminho, não a URL absoluta: em desenvolvimento o servidor de
    // mídia é outra porta, e buscar lá seria requisição entre origens. O
    // mesmo caminho relativo funciona no navegador e no aplicativo.
    const caminho = new URL(doc.file_url, window.location.href).pathname

    fetch(caminho)
      .then((resposta) => {
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
        return resposta.text()
      })
      .then(async (conteudo) => {
        if (!ativo) return
        setTexto(conteudo)
        if (separador) return
        const { highlightCode } = await import('@/lib/highlight')
        if (ativo) setHtml(highlightCode(conteudo, linguagem))
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível ler o arquivo.')
      })

    return () => {
      ativo = false
    }
  }, [doc.file_url, linguagem, separador, grandeDemais])

  if (grandeDemais) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Arquivo de {formatBytes(doc.size)} — grande demais para pré-visualizar. Baixe para
        abrir no seu editor.
      </p>
    )
  }

  if (erro) return <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>

  if (texto === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }

  if (separador) {
    const linhas = separarTabela(texto, separador)
    const [cabecalho, ...corpo] = linhas
    const visiveis = corpo.slice(0, TETO_LINHAS_CSV)

    return (
      <div className="flex h-full w-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-ink-200 dark:border-ink-800">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-ink-50 dark:bg-ink-900">
              <tr>
                {(cabecalho ?? []).map((celula, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap border-b border-ink-200 px-3 py-2 font-semibold text-ink-600 dark:border-ink-800 dark:text-ink-300"
                  >
                    {celula}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((linha, i) => (
                <tr key={i} className="odd:bg-ink-50/40 dark:odd:bg-ink-900/30">
                  {linha.map((celula, j) => (
                    <td
                      key={j}
                      className="whitespace-nowrap border-b border-ink-100 px-3 py-1.5 text-ink-700 dark:border-ink-800/60 dark:text-ink-200"
                    >
                      {celula}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="shrink-0 pt-2 text-[11px] text-ink-400">
          {corpo.length} linha(s)
          {corpo.length > visiveis.length && ` — mostrando as ${TETO_LINHAS_CSV} primeiras`}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-auto rounded-lg border border-ink-200 bg-ink-50/50 dark:border-ink-800 dark:bg-ink-900/40">
      <pre className="hljs m-0 bg-transparent p-4 text-xs leading-relaxed">
        <code
          className={`language-${linguagem}`}
          // `html` sai do highlight.js, que escapa o conteúdo antes de
          // colorir; enquanto `html` não chegou, mostra o texto cru para
          // não piscar em branco.
          dangerouslySetInnerHTML={html !== null ? { __html: html } : undefined}
        >
          {html !== null ? undefined : texto}
        </code>
      </pre>
    </div>
  )
}

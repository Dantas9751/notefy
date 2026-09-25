import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { buildNoteHtml, buildNoteMarkdown } from '@/lib/exportNota'
import { salvarArquivo } from '@/lib/desktop'
import { valorDaCelula } from '@/lib/celulas'
import { buscarArquivo } from '@/lib/fileMedia'
import { useMenuSuspenso } from '@/hooks/useMenuSuspenso'
import { cn } from '@/lib/utils'

/**
 * Formatos de exportação por tipo de documento.
 *
 * `default` é o que o botão principal dispara com um clique. O menu
 * dropdown mostra as opções extras. O backend precisa suportar cada
 * format; o frontend só monta a lista e dispara o download.
 */
const FORMATS = {
  note: [
    { ext: 'md', label: 'Markdown', default: true },
    { ext: 'pdf', label: 'PDF' },
    { ext: 'html', label: 'HTML' },
  ],
  spreadsheet: [
    { ext: 'csv', label: 'CSV', default: true },
    { ext: 'xlsx', label: 'Excel' },
    { ext: 'json', label: 'JSON' },
  ],
  diagram: [
    { ext: 'svg', label: 'SVG', default: true },
    { ext: 'png', label: 'PNG' },
    { ext: 'json', label: 'JSON' },
  ],
  canvas: [
    { ext: 'svg', label: 'SVG', default: true },
    { ext: 'png', label: 'PNG' },
    { ext: 'json', label: 'JSON' },
  ],
  file: [
    { ext: null, label: 'Formato original', default: true },
  ],
}

/** Formatos por tipo — exportado para os menus de contexto reusarem. */
export { FORMATS }

/**
 * Tira do nome os caracteres que o Windows recusa em arquivo.
 *
 * Vale tanto para o nome do arquivo salvo quanto para os caminhos dentro
 * do ZIP: uma nota chamada "Antes/Depois" viraria duas pastas aninhadas
 * ao descompactar.
 */
function sanitizarNome(nome, padrao = 'documento') {
  return (nome || padrao).replace(/[/\\?%*:|"<>]/g, '_')
}

/**
 * Salva o blob perguntando onde. No desktop abre o "Salvar como" nativo;
 * no navegador, o download de sempre. Devolve `false` se cancelaram.
 */
function downloadBlob(blob, filename) {
  return salvarArquivo(blob, filename)
}

/**
 * Exporta o conteúdo de um documento como arquivo.
 *
 * Para notas, gera o markdown a partir das seções. Para planilhas, CSV.
 * Para diagramas e canvas, JSON do payload. O PDF continua passando pelo
 * backend (o renderer é pesado e não faz sentido duplicar no cliente).
 * O SVG do diagrama é o próprio `<svg>` renderizado — ainda não extraído
 * aqui, mas pronto pra ser.
 *
 * `onSaved` só é chamado quando a ação salva dentro do Notefy (ex:
 * "Salvar aqui" do PDF antigo). As demais baixam pro computador.
 */
async function exportDocument(doc, ext, onSaved, onError) {
  try {
    const title = sanitizarNome(doc.title)

    // PDF continua server-side: o renderer é complexo demais pra
    // duplicar no cliente.
    if (ext === 'pdf') {
      const response = await api.get(`/documents/${doc.id}/pdf/`, {
        responseType: 'blob',
      })
      const disposition = response.headers['content-disposition'] ?? ''
      const match = /filename="?([^"]+)"?/.exec(disposition)
      await downloadBlob(response.data, match?.[1] ?? `${title}.pdf`)
      return
    }

    // Formato original de arquivos uploadados.
    if (ext === null) {
      if (doc.file_url) {
        // `buscarArquivo` e não `api.get(doc.file_url)`: o `file_url` do
        // backend é ABSOLUTO (`http://127.0.0.1:8000/media/...`). Passar
        // uma URL absoluta ao axios faz ele ignorar a baseURL e sair da
        // origem do app — e como o interceptor anexa `Authorization`, o
        // navegador exige preflight, que a rota de mídia não responde.
        // Dava erro de CORS ao exportar pelo Início. O helper remonta o
        // caminho sobre a origem da API, que é o que o resto do app já
        // fazia para preview e download.
        const response = await buscarArquivo(doc.file_url)
        await downloadBlob(response.data, doc.original_name || doc.title || 'arquivo')
      }
      return
    }

    let blob, filename

    if (doc.kind === 'note') {
      if (ext === 'html') {
        const html = buildNoteHtml(doc)
        blob = new Blob([html], { type: 'text/html' })
        filename = `${title}.html`
      } else {
        // Markdown
        const md = buildNoteMarkdown(doc)
        blob = new Blob([md], { type: 'text/markdown' })
        filename = `${title}.md`
      }
    } else if (doc.kind === 'spreadsheet') {
      if (ext === 'csv') {
        const csv = buildSpreadsheetCsv(doc)
        // O BOM é o que faz o Excel reconhecer UTF-8 ao abrir um .csv;
        // sem ele, acento vira caractere quebrado no Windows.
        blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
        filename = `${title}.csv`
      } else if (ext === 'xlsx') {
        const { buildXlsx } = await import('@/lib/xlsx')
        blob = await buildXlsx(doc.data?.columns ?? [], doc.data?.rows ?? [], doc.title)
        filename = `${title}.xlsx`
      } else {
        blob = new Blob([JSON.stringify(doc.data, null, 2)], { type: 'application/json' })
        filename = `${title}.json`
      }
    } else if (doc.kind === 'diagram' || doc.kind === 'canvas') {
      if (ext === 'json') {
        blob = new Blob([JSON.stringify(doc.data, null, 2)], { type: 'application/json' })
        filename = `${title}.json`
      } else {
        const svg = capturarSvg()
        if (!svg) {
          // O desenho não está na tela (exportação em lote, ou o editor
          // ainda não montou). JSON preserva tudo e reabre no Notefy;
          // uma imagem vazia não serviria para nada.
          blob = new Blob([JSON.stringify(doc.data, null, 2)], { type: 'application/json' })
          filename = `${title}.json`
        } else if (ext === 'svg') {
          blob = new Blob([svg.texto], { type: 'image/svg+xml' })
          filename = `${title}.svg`
        } else {
          blob = await svgParaPng(svg)
          filename = `${title}.png`
        }
      }
    }

    // Com await: uma falha ao gravar cai no catch e vira mensagem, em vez
    // de virar rejeição não tratada e silêncio.
    if (blob) await downloadBlob(blob, filename)
  } catch (err) {
    onError?.(extractError(err))
  }
}

/* ------------------------------------------------------------------ */
/* Conversores client-side                                             */
/* ------------------------------------------------------------------ */

/**
 * Fotografa o `<svg>` do diagrama/canvas que está na tela.
 *
 * Devolve `null` quando não há desenho montado — é o caso da exportação
 * em lote, onde os documentos nunca chegam a ser renderizados.
 *
 * O clone é recortado no conteúdo, e não na janela: exportar o
 * enquadramento atual produziria uma imagem com o zoom e a rolagem do
 * momento, cortando o que estivesse fora da vista.
 */
function capturarSvg() {
  const original = document.querySelector('[data-graph-canvas="true"]')
  if (!original) return null

  const clone = original.cloneNode(true)

  // A prévia da borracha e o retângulo elástico são estado de ferramenta,
  // não desenho — não podem aparecer no arquivo.
  clone.querySelectorAll('[pointer-events="none"] circle').forEach((no) => {
    if (no.getAttribute('stroke-dasharray')) no.parentNode?.remove()
  })

  // O `<g>` interno carrega o transform do viewport (pan e zoom). Zerá-lo
  // devolve as coordenadas de mundo, que é o sistema em que a caixa do
  // conteúdo abaixo é medida.
  const grupo = clone.querySelector('g[transform]')
  if (grupo) grupo.removeAttribute('transform')

  // A grade é um padrão ancorado no viewport: sem o transform ela fica
  // deslocada, e num arquivo exportado ela é ruído de qualquer forma.
  clone.querySelector('rect[fill="url(#grid)"]')?.remove()

  // `getBBox` mede o conteúdo real, mas só funciona no DOM vivo — daí
  // medir no original e não no clone.
  let caixa
  try {
    const grupoOriginal = original.querySelector('g[transform]')
    caixa = grupoOriginal?.getBBox()
  } catch {
    caixa = null
  }

  let dimensoes
  if (caixa && caixa.width > 0 && caixa.height > 0) {
    const margem = 20
    const x = Math.floor(caixa.x - margem)
    const y = Math.floor(caixa.y - margem)
    const largura = Math.ceil(caixa.width + margem * 2)
    const altura = Math.ceil(caixa.height + margem * 2)
    clone.setAttribute('viewBox', `${x} ${y} ${largura} ${altura}`)
    clone.setAttribute('width', largura)
    clone.setAttribute('height', altura)
    clone.removeAttribute('class')

    // Fundo branco explícito: SVG sem fundo vira PNG transparente, e um
    // diagrama de traço escuro somem num visualizador de tema escuro.
    const fundo = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    fundo.setAttribute('x', x)
    fundo.setAttribute('y', y)
    fundo.setAttribute('width', largura)
    fundo.setAttribute('height', altura)
    fundo.setAttribute('fill', '#ffffff')
    clone.insertBefore(fundo, clone.firstChild)

    dimensoes = { largura, altura }
  } else {
    dimensoes = {
      largura: original.clientWidth || 800,
      altura: original.clientHeight || 600,
    }
  }

  // As cores vêm de classes do Tailwind, que não existem fora da página.
  // Sem resolvê-las para valores literais, o arquivo abre todo preto.
  fixarCoresComputadas(original, clone)

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const texto = new XMLSerializer().serializeToString(clone)
  return { texto, ...dimensoes }
}

/**
 * Copia as cores que o CSS calculou para atributos do próprio nó.
 *
 * Percorre os dois em paralelo: `cloneNode` preserva a ordem, então o
 * n-ésimo elemento de um corresponde ao n-ésimo do outro.
 */
function fixarCoresComputadas(original, clone) {
  const origem = original.querySelectorAll('*')
  const destino = clone.querySelectorAll('*')

  for (let i = 0; i < origem.length && i < destino.length; i += 1) {
    const estilo = window.getComputedStyle(origem[i])
    const no = destino[i]

    const preenchimento = estilo.fill
    const traco = estilo.stroke
    if (preenchimento && preenchimento !== 'none') no.setAttribute('fill', preenchimento)
    if (traco && traco !== 'none') no.setAttribute('stroke', traco)

    // Texto herda a cor por `color`, não por `fill`.
    if (no.tagName === 'text' || no.tagName === 'tspan') {
      no.setAttribute('fill', estilo.fill === 'none' ? estilo.color : estilo.fill)
      if (estilo.fontSize) no.setAttribute('font-size', estilo.fontSize)
      if (estilo.fontFamily) no.setAttribute('font-family', estilo.fontFamily)
      if (estilo.fontWeight) no.setAttribute('font-weight', estilo.fontWeight)
    }

    no.removeAttribute('class')
  }
}

/** Rasteriza o SVG capturado num PNG, com o dobro da resolução. */
function svgParaPng({ texto, largura, altura }) {
  return new Promise((resolve, reject) => {
    // 2x para a imagem não sair borrada em tela de alta densidade e ao
    // ser ampliada num documento.
    const escala = 2
    const canvas = document.createElement('canvas')
    canvas.width = largura * escala
    canvas.height = altura * escala

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const imagem = new Image()
    // Data URL em vez de blob URL: o canvas trata blob de SVG como
    // origem externa em parte dos navegadores e o `toBlob` falha com
    // "tainted canvas".
    const codificado = encodeURIComponent(texto)

    imagem.onload = () => {
      ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Não foi possível gerar o PNG.'))
      }, 'image/png')
    }
    imagem.onerror = () => reject(new Error('Não foi possível ler o desenho.'))
    imagem.src = `data:image/svg+xml;charset=utf-8,${codificado}`
  })
}

function buildSpreadsheetCsv(doc) {
  const columns = doc.data?.columns ?? []
  const rows = doc.data?.rows ?? []
  const sep = (v) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const header = columns.map((c) => sep(c.name)).join(',')
  const body = rows
    .map((row) => columns.map((c) => sep(valorDaCelula(row, c))).join(','))
    .join('\n')
  return `${header}\n${body}`
}

/**
 * Menu de exportação unificado.
 *
 * Substitui o PdfMenu antigo: um único botão com ícone de download que
 * abre dropdown com os formatos disponíveis pro tipo do documento. O
 * formato padrão dispara com um clique direto; os extras ficam no menu.
 */
export default function ExportMenu({ document: doc, disabled, onError }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { ref: menuRef, paraCima } = useMenuSuspenso(open)

  const formats = FORMATS[doc?.kind] ?? FORMATS.file
  const defaultFormat = formats.find((f) => f.default) ?? formats[0]

  const handleExport = async (ext) => {
    setOpen(false)
    setBusy(true)
    await exportDocument(doc, ext, null, onError)
    setBusy(false)
  }

  // Um formato só (arquivo enviado): o botão baixa direto, sem menu —
  // abrir uma lista de uma opção é um clique cobrado à toa.
  const formatoUnico = formats.length === 1

  return (
    <div className="relative">
      <button
        onClick={() => (formatoUnico ? handleExport(defaultFormat.ext) : setOpen((v) => !v))}
        disabled={disabled || busy}
        title={disabled ? 'Salve antes de exportar' : 'Baixar'}
        aria-label="Baixar"
        aria-expanded={formatoUnico ? undefined : open}
        className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      </button>

      {open && !formatoUnico && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={menuRef}
            className={cn(
              'absolute right-0 z-30 w-44 rounded-md border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900',
              paraCima ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            <p className="px-2 py-1 secao">
              Baixar como
            </p>
            {formats.map((fmt) => (
              <button
                key={fmt.ext ?? 'original'}
                onClick={() => handleExport(fmt.ext)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition',
                  'hover:bg-ink-50 dark:hover:bg-ink-800',
                  fmt.default
                    ? 'font-medium text-accent-700 dark:text-accent-400'
                    : 'text-ink-700 dark:text-ink-200',
                )}
              >
                <span className="flex-1">{fmt.label}</span>
                {fmt.ext && <span className="text-[10px] text-ink-400">.{fmt.ext}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Exporta vários documentos como um único ZIP.
 *
 * Cada documento vai no seu formato padrão. Usado pela sidebar (lote de
 * multi-select) e pelo menu de contexto de pastas.
 */
export async function exportBatchAsZip(documents, onError) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  for (const doc of documents) {
    const title = sanitizarNome(doc.title)
    try {
      if (doc.kind === 'note') {
        zip.file(`${title}.md`, buildNoteMarkdown(doc))
      } else if (doc.kind === 'spreadsheet') {
        zip.file(`${title}.csv`, buildSpreadsheetCsv(doc))
      } else if (doc.kind === 'file' && doc.file_url) {
        const response = await buscarArquivo(doc.file_url, 'arraybuffer')
        zip.file(doc.title || 'arquivo', response.data)
      } else {
        zip.file(`${title}.json`, JSON.stringify(doc.data ?? {}, null, 2))
      }
    } catch {
      // Item que falha é ignorado: melhor um zip com 9 de 10 do que
      // abortar tudo por causa de um arquivo corrompido.
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  await salvarArquivo(blob, 'export.zip')
}

/**
 * Exporta uma pasta inteira como ZIP, preservando a hierarquia.
 *
 * `tree` é a resposta de `/folders/tree/` — uma árvore de categorias,
 * pastas e documentos. Cada nó tem `children`, `documents`, etc.
 */
export async function exportFolderAsZip(tree, onError) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  async function walk(nodes, prefix = '') {
    for (const node of nodes) {
      // Sanitizar aqui também: uma pasta chamada "Antes/Depois" abriria
      // dois níveis de diretório ao descompactar.
      const nome = sanitizarNome(node.name, 'pasta')
      const folderPath = prefix ? `${prefix}/${nome}` : nome

      // Documentos desta pasta
      for (const doc of node.documents ?? []) {
        const title = sanitizarNome(doc.title)
        try {
          if (doc.kind === 'note') {
            zip.file(`${folderPath}/${title}.md`, buildNoteMarkdown(doc))
          } else if (doc.kind === 'spreadsheet') {
            zip.file(`${folderPath}/${title}.csv`, buildSpreadsheetCsv(doc))
          } else if (doc.kind === 'file' && doc.file_url) {
            const response = await buscarArquivo(doc.file_url, 'arraybuffer')
            zip.file(`${folderPath}/${doc.title || 'arquivo'}`, response.data)
          } else {
            zip.file(`${folderPath}/${title}.json`, JSON.stringify(doc.data ?? {}, null, 2))
          }
        } catch {
          // Ignora item com erro.
        }
      }

      // Subpastas recursivamente
      if (node.children?.length) {
        await walk(node.children, folderPath)
      }
    }
  }

  const raizes = Array.isArray(tree) ? tree : [tree]
  await walk(raizes)

  const blob = await zip.generateAsync({ type: 'blob' })
  await salvarArquivo(blob, nomeDoZip(raizes))
}

/**
 * Nome do arquivo ZIP a partir do que está sendo exportado.
 *
 * Uma pasta só leva o nome dela: "pasta.zip" para tudo obrigava a
 * renomear no explorador toda vez, e duas exportações seguidas viravam
 * "pasta.zip" e "pasta (1).zip", indistinguíveis depois.
 */
function nomeDoZip(raizes) {
  if (raizes.length === 1 && raizes[0]?.name) {
    return `${sanitizarNome(raizes[0].name)}.zip`
  }
  // Várias raízes não têm um nome só que sirva — aí o genérico é honesto.
  return 'pastas.zip'
}

export { exportDocument }

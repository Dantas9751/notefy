import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { buildNoteHtml, buildNoteMarkdown } from '@/lib/exportNota'
import { avisarErro } from '@/lib/avisoFlutuante'
import { baixar } from '@/lib/desktop'
import { valorParaExportar } from '@/lib/formula'
import { buscarArquivo } from '@/lib/fileMedia'
import { useMenuSuspenso } from '@/hooks/useMenuSuspenso'
import { parseKey } from '@/hooks/useMultiSelect'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Formatos de exportação por tipo de documento.
 *
 * `default` é o que o botão principal dispara com um clique. O menu
 * dropdown mostra as opções extras. O backend precisa suportar cada
 * format; o frontend só monta a lista e dispara o download.
 */
const FORMATS = {
  note: [
    { ext: 'md', get label() { return t('Markdown') }, default: true },
    { ext: 'pdf', label: 'PDF' },
    { ext: 'html', label: 'HTML' },
  ],
  spreadsheet: [
    { ext: 'csv', label: 'CSV', default: true },
    { ext: 'xlsx', get label() { return t('Excel') } },
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
    { ext: null, get label() { return t('Formato original') }, default: true },
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
function sanitizarNome(nome, padrao = t('documento')) {
  return (nome || padrao).replace(/[/\\?%*:|"<>]/g, '_')
}

/**
 * Exporta o conteúdo de um documento como arquivo, com o aviso de
 * "Exportando..." e de onde foi salvo (`baixar`). Não lança.
 *
 * Nota vira markdown ou HTML; planilha, CSV, Excel ou JSON; diagrama e
 * canvas, SVG, PNG ou JSON. O PDF continua no backend: o renderer é pesado
 * e não faz sentido duplicar no cliente.
 */
function exportDocument(doc, ext) {
  const title = sanitizarNome(doc.title)
  const nome = ext === null ? doc.original_name || doc.title || t('arquivo') : `${title}.${ext}`
  return baixar(nome, () => gerarArquivo(doc, ext, title, nome))
}

async function gerarArquivo(doc, ext, title, nome) {
  if (ext === 'pdf') {
    const response = await api.get(`/documents/${doc.id}/pdf/`, { responseType: 'blob' })
    const disposition = response.headers['content-disposition'] ?? ''
    const match = /filename="?([^"]+)"?/.exec(disposition)
    return { blob: response.data, nome: match?.[1] ?? nome }
  }

  // Formato original de arquivos importados.
  if (ext === null) {
    // `buscarArquivo` e não `api.get(doc.file_url)`: o `file_url` é
    // ABSOLUTO, e o axios sairia da origem do app com `Authorization` —
    // preflight que a rota de mídia não responde (erro de CORS).
    return (await buscarArquivo(doc.file_url, 'blob')).data
  }

  if (doc.kind === 'note') {
    return ext === 'html'
      ? new Blob([buildNoteHtml(doc)], { type: 'text/html' })
      : new Blob([buildNoteMarkdown(doc)], { type: 'text/markdown' })
  }
  if (doc.kind === 'spreadsheet') {
    // O BOM é o que faz o Excel reconhecer UTF-8 ao abrir um .csv; sem
    // ele, acento vira caractere quebrado no Windows.
    if (ext === 'csv') return new Blob(['﻿', buildSpreadsheetCsv(doc)], { type: 'text/csv;charset=utf-8' })
    if (ext === 'xlsx') {
      const { buildXlsx } = await import('@/lib/xlsx')
      return buildXlsx(doc.data?.columns ?? [], doc.data?.rows ?? [], doc.title, { congeladas: doc.data?.frozen_columns ?? 0 })
    }
  }
  if ((doc.kind === 'diagram' || doc.kind === 'canvas') && ext !== 'json') {
    const svg = await desenharFora(doc)
    return ext === 'svg' ? new Blob([svg.texto], { type: 'image/svg+xml' }) : svgParaPng(svg)
  }
  return new Blob([JSON.stringify(doc.data, null, 2)], { type: 'application/json' })
}

/* ------------------------------------------------------------------ */
/* Conversores client-side                                             */
/* ------------------------------------------------------------------ */

/**
 * Desenha o quadro fora da vista e fotografa o `<svg>`.
 *
 * Sempre a partir do `data` salvo, e não do editor na tela: pelo menu de
 * contexto o desenho nem está montado (o PNG saía como .json, calado), e
 * com dois quadros abertos lado a lado o exportador pegava o primeiro que
 * achasse. O botão de exportar do editor só funciona com tudo salvo, então
 * o `data` é o que está na tela.
 */
async function desenharFora(doc) {
  const [{ createRoot }, { flushSync }, { default: GraphEditor }] = await Promise.all([
    import('react-dom/client'),
    import('react-dom'),
    import('@/components/editors/GraphEditor'),
  ])
  const caixa = document.createElement('div')
  // Fora da tela, mas com layout: o `getBBox` que mede o desenho não
  // funciona em `display: none`.
  caixa.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:800px;pointer-events:none'
  caixa.setAttribute('aria-hidden', 'true')
  document.body.appendChild(caixa)
  const raiz = createRoot(caixa)
  try {
    const nada = () => {}
    flushSync(() =>
      raiz.render(
        <GraphEditor kind={doc.kind} data={doc.data} onChange={nada} onCommit={nada} onUndo={nada} onRedo={nada} somenteLeitura />,
      ),
    )
    const svg = capturarSvg(caixa.querySelector('[data-graph-canvas="true"]'))
    if (!svg) throw new Error(t('Não foi possível ler o desenho.'))
    return svg
  } finally {
    raiz.unmount()
    caixa.remove()
  }
}

/**
 * Fotografa um `<svg>` de quadro já montado.
 *
 * O clone é recortado no conteúdo, e não na janela: exportar o
 * enquadramento atual produziria uma imagem com o zoom e a rolagem do
 * momento, cortando o que estivesse fora da vista.
 */
function capturarSvg(original) {
  if (!original) return null

  const clone = original.cloneNode(true)
  // As cores vêm de classes do Tailwind, que não existem fora da página.
  // Resolvidas ANTES de mexer no clone: a cópia anda em paralelo pela
  // ordem dos elementos, e cada um tirado ou posto deslocava todas as
  // cores dali em diante — o PNG saía preto.
  fixarCoresComputadas(original, clone)
  // O fundo do quadro como está na tela (claro ou escuro): fixo em branco,
  // um quadro escuro saía com letra clara sobre branco.
  const corDeFundo = getComputedStyle(original).backgroundColor || '#ffffff'

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
  // `*=`: com as cores já resolvidas, o atributo virou `url("#grid")`.
  clone.querySelector('rect[fill*="#grid"]')?.remove()

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

    // Fundo explícito: SVG sem fundo vira PNG transparente, e o traço
    // some num visualizador da cor oposta.
    const fundo = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    fundo.setAttribute('x', x)
    fundo.setAttribute('y', y)
    fundo.setAttribute('width', largura)
    fundo.setAttribute('height', altura)
    fundo.setAttribute('fill', corDeFundo)
    clone.insertBefore(fundo, clone.firstChild)

    dimensoes = { largura, altura }
  } else {
    dimensoes = {
      largura: original.clientWidth || 800,
      altura: original.clientHeight || 600,
    }
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const texto = new XMLSerializer().serializeToString(clone)
  return { texto, corDeFundo, ...dimensoes }
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
function svgParaPng({ texto, corDeFundo, largura, altura }) {
  return new Promise((resolve, reject) => {
    // 2x para a imagem não sair borrada em tela de alta densidade e ao
    // ser ampliada num documento.
    const escala = 2
    const canvas = document.createElement('canvas')
    canvas.width = largura * escala
    canvas.height = altura * escala

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = corDeFundo
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
        else reject(new Error(t('Não foi possível gerar o PNG.')))
      }, 'image/png')
    }
    imagem.onerror = () => reject(new Error(t('Não foi possível ler o desenho.')))
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
    // O valor calculado, e não o texto da fórmula: `=B1*2` no .csv não
    // significa nada fora daqui.
    .map((row) => columns.map((c) => sep(valorParaExportar(c, row, columns, rows))).join(','))
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
export default function ExportMenu({ document: doc, disabled }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { ref: menuRef, paraCima } = useMenuSuspenso(open)

  const formats = FORMATS[doc?.kind] ?? FORMATS.file
  const defaultFormat = formats.find((f) => f.default) ?? formats[0]

  const handleExport = async (ext) => {
    setOpen(false)
    setBusy(true)
    await exportDocument(doc, ext)
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
        title={disabled ? t('Salve antes de exportar') : t('Baixar')}
        aria-label={t('Baixar')}
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
              {t('Baixar como')}
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

/* -------------------------------------------------------------------- */
/* .zip                                                                  */
/* -------------------------------------------------------------------- */

/** O documento inteiro: a lista traz só o resumo, sem `data` (e a busca, sem `file_url`). */
async function documentoInteiro(doc) {
  const falta = doc.kind === 'file' ? !doc.file_url : doc.data === undefined
  return falta ? (await api.get(`/documents/${doc.id}/`)).data : doc
}

/** Grava um documento no formato padrão do tipo, dentro de `pasta` ('' é a raiz). */
async function gravarNoZip(zip, pasta, resumo) {
  const doc = await documentoInteiro(resumo)
  const caminho = (nome) => (pasta ? `${pasta}/${nome}` : nome)
  const title = sanitizarNome(doc.title)
  if (doc.kind === 'note') {
    zip.file(caminho(`${title}.md`), buildNoteMarkdown(doc))
  } else if (doc.kind === 'spreadsheet') {
    zip.file(caminho(`${title}.csv`), buildSpreadsheetCsv(doc))
  } else if (doc.kind === 'file' && doc.file_url) {
    const response = await buscarArquivo(doc.file_url, 'arraybuffer')
    zip.file(caminho(doc.title || t('arquivo')), response.data)
  } else {
    zip.file(caminho(`${title}.json`), JSON.stringify(doc.data ?? {}, null, 2))
  }
}

/** Uma pasta e toda a subárvore, como o .zip espera: `{ name, documents, children }`. */
async function coletarPasta(folderId) {
  const { data } = await api.get(`/folders/${folderId}/contents/`)
  const children = []
  for (const sub of data.subfolders ?? []) children.push(await coletarPasta(sub.id))
  return { name: data.folder.name, documents: data.documents ?? [], children }
}

/** A categoria vira a pasta de cima do .zip, com as pastas raiz dentro. */
async function coletarCategoria(categoryId) {
  const { data } = await api.get(`/categories/${categoryId}/contents/`)
  const children = []
  for (const pasta of data.folders ?? []) children.push(await coletarPasta(pasta.id))
  return { name: data.category.name, documents: [], children }
}

/**
 * Nome do arquivo ZIP a partir do que está sendo exportado.
 *
 * Uma pasta só leva o nome dela: "pasta.zip" para tudo obrigava a
 * renomear no explorador toda vez, e duas exportações seguidas viravam
 * "pasta.zip" e "pasta (1).zip", indistinguíveis depois.
 */
function nomeDoZip(soltos, pastas) {
  if (!soltos.length && pastas.length === 1 && pastas[0]?.name) {
    return `${sanitizarNome(pastas[0].name)}.zip`
  }
  // Várias coisas não têm um nome só que sirva: aí o genérico é honesto.
  return 'export.zip'
}

/**
 * Exporta a seleção (chaves `"tipo:id"`) num .zip só: documento no seu
 * formato padrão, pasta e categoria com toda a subárvore. Tarefas não têm
 * arquivo e ficam de fora.
 *
 * O .zip sai com o que deu certo, que é melhor do que nenhum arquivo por
 * causa de um item quebrado; o aviso diz quantos ficaram de fora. Não
 * lança: todo resultado sai no aviso flutuante.
 */
export async function exportarSelecao(chaves) {
  let falhas = 0
  let total = 0
  const salvo = await baixar(null, async () => {
    const montado = await montarZip(chaves)
    ;({ falhas, total } = montado)
    if (total === falhas) {
      throw new Error(falhas ? t('{falhas} de {total} itens ficaram de fora do .zip.', { falhas, total }) : t('Nada para exportar.'))
    }
    return { blob: await montado.zip.generateAsync({ type: 'blob' }), nome: montado.nome }
  })
  if (salvo && falhas) avisarErro(t('{falhas} de {total} itens ficaram de fora do .zip.', { falhas, total }))
}

async function montarZip(chaves) {
  const soltos = []
  const pastas = []
  let total = 0
  let falhas = 0

  for (const chave of chaves) {
    const { type: tipo, id } = parseKey(chave)
    if (tipo === 'task' || tipo === 'board') continue
    try {
      if (tipo === 'folder') pastas.push(await coletarPasta(id))
      else if (tipo === 'category') pastas.push(await coletarCategoria(id))
      else soltos.push({ id })
    } catch {
      total += 1
      falhas += 1
    }
  }

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const gravar = async (pasta, doc) => {
    total += 1
    try {
      await gravarNoZip(zip, pasta, doc)
    } catch {
      falhas += 1
    }
  }
  const andar = async (nos, prefixo) => {
    for (const no of nos) {
      // Sanitizar o nome da pasta também: "Antes/Depois" abriria dois
      // níveis de diretório ao descompactar.
      const caminho = [prefixo, sanitizarNome(no.name, t('pasta'))].filter(Boolean).join('/')
      for (const doc of no.documents ?? []) await gravar(caminho, doc)
      await andar(no.children ?? [], caminho)
    }
  }
  for (const doc of soltos) await gravar('', doc)
  await andar(pastas, '')

  return { zip, nome: nomeDoZip(soltos, pastas), falhas, total }
}

export { exportDocument }

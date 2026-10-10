/**
 * Gerador de .xlsx sem dependência de planilha.
 *
 * Um .xlsx é um zip de XMLs seguindo o OOXML. Escrever os arquivos
 * mínimos é pouco código; a alternativa era a `xlsx` do npm, que está
 * parada na 0.18.5 com duas falhas HIGH sem correção (a SheetJS migrou a
 * distribuição para o CDN própria e abandonou o registry). Trazer um
 * problema de segurança conhecido para exportar uma tabela não se paga —
 * ainda mais com o JSZip já no projeto por causa do .zip.
 *
 * O arquivo sai como a planilha aparece no Notefy: número como número,
 * moeda, porcentagem e data com o formato do Excel (e não como texto),
 * negrito, cores, alinhamento e quebra de texto de cada célula, a largura
 * das colunas e as colunas congeladas. Fórmula sai pelo valor calculado.
 */

// Com extensão: o `node --test` roda estes módulos direto, sem passar
// pelo Vite, e o ESM do Node não completa o caminho sozinho.
import { comparableValue, displayValue, numeroOuNulo, serialDeData, valorParaExportar } from './formula.js'
import { t } from './i18n.js'

/** Escapa o que não pode entrar cru num XML. */
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Caracteres de controle são inválidos em XML 1.0 e corrompem o
    // arquivo inteiro — o Excel recusa a abrir sem dizer por quê.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/**
 * Índice de coluna para letra: 0 -> A, 25 -> Z, 26 -> AA.
 *
 * Base 26 sem zero — 'A' vale 1 na casa, não 0 — então o -1 antes de
 * cada divisão é o que faz AA vir depois de Z em vez de BA.
 */
export function colunaParaLetra(indice) {
  let letra = ''
  let n = indice + 1
  while (n > 0) {
    const resto = (n - 1) % 26
    letra = String.fromCharCode(65 + resto) + letra
    n = Math.floor((n - 1) / 26)
  }
  return letra
}

/**
 * Uma célula: número vira `<v>`, booleano vira `t="b"`, o resto vira
 * string inline. `s` é o índice do estilo (0 é o padrão); célula vazia
 * com estilo existe, porque o fundo pintado aparece no Excel mesmo sem
 * valor.
 */
function celula(ref, valor, s = 0) {
  const estilo = s ? ` s="${s}"` : ''
  if (valor === null || valor === undefined || valor === '') return s ? `<c r="${ref}"${estilo}/>` : ''

  if (typeof valor === 'boolean') return `<c r="${ref}"${estilo} t="b"><v>${valor ? 1 : 0}</v></c>`

  // `isFinite` barra NaN e Infinity, que viram `#VALUE!` na planilha.
  const numero = typeof valor === 'number' && Number.isFinite(valor)
  if (numero) return `<c r="${ref}"${estilo}><v>${valor}</v></c>`

  // `t="inlineStr"` evita a tabela de strings compartilhadas: um arquivo
  // a menos e nenhum índice para manter em sincronia.
  return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`
}

/* -------------------------------------------------------------------- */
/* Formatos de número                                                   */
/* -------------------------------------------------------------------- */

const decimais = (casas) => (casas > 0 ? `.${'0'.repeat(casas)}` : '')

//: O símbolo vai entre aspas: é texto literal no código de formato do Excel.
const PREFIXOS = { BRL: '"R$ "', USD: '"$"', EUR: '"€ "', GBP: '"£"' }
const SIMBOLOS = { 'R$': 'BRL', 'US$': 'USD', $: 'USD', '€': 'EUR', '£': 'GBP' }

const formatoDeMoeda = (moeda, casas = 2) => `${PREFIXOS[moeda] ?? PREFIXOS.BRL}#,##0${decimais(casas)}`
const formatoDePorcentagem = (casas) => `0${decimais(casas)}%`
const formatoDeNumero = (casas) => `#,##0${decimais(casas)}`

/** Casas decimais que o número mostra (até 4), para o formato automático não arredondar. */
function casasDe(numero) {
  const texto = String(Math.round(numero * 1e4) / 1e4)
  return texto.includes('.') ? texto.split('.')[1].length : 0
}

/**
 * O que vai na célula do Excel, e com que formato de número.
 *
 * `formato` é um código do Excel (`#,##0.00`, `0%`...) ou um dos
 * embutidos: 14 é a data curta e 22 a data com hora, que o Excel mostra
 * no padrão de quem abre o arquivo (dia/mês no Brasil, mês/dia nos EUA).
 */
export function conteudoDoExcel(coluna, linha, columns, rows) {
  const tipo = coluna.type
  if (tipo === 'checkbox') return { valor: displayValue(coluna, linha, columns, rows).text === '✓' }

  const bruto = comparableValue(coluna, linha, columns, rows)
  const valor = valorParaExportar(coluna, linha, columns, rows)
  const texto = typeof bruto === 'string' ? bruto.trim() : ''

  // Data: o serial do Excel, que é como ele guarda data (e faz conta com ela).
  const ehData = tipo === 'date' || tipo === 'datetime'
  const serial = ehData && typeof bruto === 'number' ? bruto : serialDeData(texto)
  if (serial !== null && (ehData || !['number', 'currency', 'percent', 'rating'].includes(tipo))) {
    return { valor: serial, formato: tipo === 'datetime' || serial % 1 ? 22 : 14 }
  }

  if (tipo === 'currency' && typeof valor === 'number') {
    return { valor, formato: formatoDeMoeda(coluna.currency || 'BRL', coluna.decimals ?? 2) }
  }
  // A coluna Porcentagem guarda pontos (15 é "15%"); o Excel guarda a
  // fração (0,15 com formato %), e é assim que as contas dele funcionam.
  if (tipo === 'percent' && typeof valor === 'number') {
    const fracao = Math.round(valor * 1e8) / 1e10
    return { valor: fracao, formato: formatoDePorcentagem(coluna.decimals ?? casasDe(valor)) }
  }
  if (typeof valor === 'number') {
    const casas = coluna.decimals
    return { valor, formato: casas === null || casas === undefined ? null : formatoDeNumero(casas) }
  }

  // No Geral, "R$ 10" e "15%" digitados viram número com o formato que
  // a pessoa escreveu: no Excel continuam somáveis e com o símbolo.
  const numero = texto ? numeroOuNulo(texto) : null
  if (numero !== null && !/^[-+]?0\d/.test(texto)) {
    const simbolo = /^-?\s*(R\$|US\$|\$|€|£)/.exec(texto)?.[1]
    if (simbolo) return { valor: numero, formato: formatoDeMoeda(SIMBOLOS[simbolo]) }
    if (texto.endsWith('%')) return { valor: numero, formato: formatoDePorcentagem(casasDe(numero * 100)) }
  }
  return { valor }
}

/* -------------------------------------------------------------------- */
/* Estilos                                                              */
/* -------------------------------------------------------------------- */

/** `#RGB` ou `#RRGGBB` no formato ARGB do OOXML; `null` se não for cor hexadecimal. */
function argb(cor) {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(cor ?? '').trim())?.[1]
  if (!hex) return null
  const cheio = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  return `FF${cheio.toUpperCase()}`
}

/**
 * Tabela de estilos do arquivo: cada combinação diferente de letra, fundo,
 * formato de número e alinhamento vira um `xf`, e a célula aponta para ele
 * pelo índice. Combinações repetidas reaproveitam o mesmo.
 */
function criarEstilos() {
  const fontes = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>']
  // Os dois primeiros fundos são obrigatórios e fixos no OOXML.
  const fundos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  const formatos = []
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
  const indices = new Map()

  const indiceEm = (lista, xml, base = 0) => {
    const achado = lista.indexOf(xml)
    if (achado !== -1) return achado + base
    lista.push(xml)
    return lista.length - 1 + base
  }

  const fonteDe = (e) => {
    const cor = argb(e.color)
    if (!e.bold && !e.italic && !e.underline && !e.strike && !cor) return 0
    return indiceEm(
      fontes,
      `<font>${e.bold ? '<b/>' : ''}${e.italic ? '<i/>' : ''}${e.strike ? '<strike/>' : ''}${e.underline ? '<u/>' : ''}<sz val="11"/>${cor ? `<color rgb="${cor}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`,
    )
  }

  const fundoDe = (cor) => {
    const rgb = argb(cor)
    if (!rgb) return 0
    return indiceEm(fundos, `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`)
  }

  // Formatos próprios começam no 164; abaixo disso são os embutidos.
  const formatoDe = (formato) => {
    if (formato === null || formato === undefined) return 0
    if (typeof formato === 'number') return formato
    return indiceEm(formatos, formato, 164)
  }

  return {
    /** Índice do estilo para a célula; 0 quando ela não tem nada de diferente. */
    indice(estilo = {}, formato = null) {
      const fonte = fonteDe(estilo)
      const fundo = fundoDe(estilo.fill)
      const numero = formatoDe(formato)
      const alinhar = ['left', 'center', 'right'].includes(estilo.align) ? estilo.align : null
      const quebrar = !!estilo.wrap
      if (!fonte && !fundo && !numero && !alinhar && !quebrar) return 0
      const chave = `${fonte}|${fundo}|${numero}|${alinhar}|${quebrar}`
      if (!indices.has(chave)) {
        const alinhamento =
          alinhar || quebrar
            ? `<alignment${alinhar ? ` horizontal="${alinhar}"` : ''}${quebrar ? ' vertical="top" wrapText="1"' : ''}/>`
            : ''
        xfs.push(
          `<xf numFmtId="${numero}" fontId="${fonte}" fillId="${fundo}" borderId="0" xfId="0"` +
            `${numero ? ' applyNumberFormat="1"' : ''}${fonte ? ' applyFont="1"' : ''}${fundo ? ' applyFill="1"' : ''}` +
            `${alinhamento ? ' applyAlignment="1">' + alinhamento + '</xf>' : '/>'}`,
        )
        indices.set(chave, xfs.length - 1)
      }
      return indices.get(chave)
    },

    xml() {
      const numFmts = formatos.length
        ? `<numFmts count="${formatos.length}">${formatos.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>`
        : ''
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${numFmts}<fonts count="${fontes.length}">${fontes.join('')}</fonts>
<fills count="${fundos.length}">${fundos.join('')}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
    },
  }
}

/* -------------------------------------------------------------------- */
/* A planilha                                                           */
/* -------------------------------------------------------------------- */

/**
 * Os dois XMLs que mudam de planilha para planilha: a folha e os estilos.
 *
 * Separado do zip para dar para testar sem o JSZip. O cabeçalho é a linha
 * 1, em negrito e congelado; o corpo começa na 2. As colunas congeladas
 * no Notefy saem congeladas no Excel, e cada coluna sai com a largura que
 * tem na tela (o Excel mede em caracteres de ~7px).
 */
export function montarXlsx(columns, rows, { congeladas = 0 } = {}) {
  const estilos = criarEstilos()
  const cabecalho = estilos.indice({ bold: true, fill: '#F2F2F2' })

  const linhas = [
    `<row r="1">${columns.map((c, i) => celula(`${colunaParaLetra(i)}1`, c.name, cabecalho)).join('')}</row>`,
  ]
  rows.forEach((linha, indiceLinha) => {
    const celulas = columns
      .map((coluna, indiceColuna) => {
        const { valor, formato } = conteudoDoExcel(coluna, linha, columns, rows)
        const s = estilos.indice(linha.styles?.[coluna.id], formato)
        return celula(`${colunaParaLetra(indiceColuna)}${indiceLinha + 2}`, valor, s)
      })
      .join('')
    linhas.push(`<row r="${indiceLinha + 2}">${celulas}</row>`)
  })

  const larguras = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.round(((c.width ?? 160) / 7) * 100) / 100}" customWidth="1"/>`)
    .join('')

  const x = Math.min(Math.max(0, congeladas), columns.length)
  const painel = `<pane${x ? ` xSplit="${x}"` : ''} ySplit="1" topLeftCell="${colunaParaLetra(x)}2" activePane="${x ? 'bottomRight' : 'bottomLeft'}" state="frozen"/>`

  return {
    folha: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">${painel}</sheetView></sheetViews>
${larguras ? `<cols>${larguras}</cols>` : ''}<sheetData>${linhas.join('')}</sheetData>
</worksheet>`,
    estilos: estilos.xml(),
  }
}

/**
 * Monta o .xlsx e devolve um Blob.
 *
 * `columns`: `[{ id, name, type, width... }]` — a ordem define as colunas.
 * `rows`: `[{ id, cells: { [idDaColuna]: valor }, styles }]`, o formato que
 * a planilha do Notefy guarda. A assinatura antiga dizia `[{ [id]: valor }]`
 * e o chamador passava as linhas de verdade: toda célula saía vazia e o
 * arquivo exportado tinha só o cabeçalho.
 */
export async function buildXlsx(columns, rows, nomeAba = t('Planilha'), { tipo = 'blob', ...opcoes } = {}) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const { folha, estilos } = montarXlsx(columns, rows, opcoes)

  // O Excel usa o nome da aba na interface e recusa estes caracteres,
  // além de um limite de 31. Truncar aqui evita um arquivo que abre
  // "reparado".
  const aba = String(nomeAba).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || t('Planilha')

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  )

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  )

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(aba)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  )

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  )

  zip.file('xl/worksheets/sheet1.xml', folha)
  zip.file('xl/styles.xml', estilos)

  // `tipo` existe para o teste (o Node gera `uint8array`); o app pede Blob.
  return zip.generateAsync({
    type: tipo,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export { esc as escaparXml, celula as celulaXml }

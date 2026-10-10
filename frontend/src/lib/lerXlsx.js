/**
 * Leitor de .xlsx para a pré-visualização de arquivos.
 *
 * Substitui a `xlsx` do npm (SheetJS 0.18.5), que tem duas falhas HIGH
 * sem correção no registry — poluição de protótipo e ReDoS AO LER um
 * arquivo preparado, que é justamente o que a pré-visualização faz com o
 * que a pessoa recebe e envia. Um .xlsx é um zip de XMLs; o JSZip já está
 * no projeto, e ler a primeira aba é pouco código.
 *
 * Lê o que uma prévia precisa: os valores da primeira aba, com número,
 * moeda, porcentagem e data no formato que a célula pede. Fórmula vem
 * pelo valor que o Excel gravou. O arquivo binário antigo (.xls) não é zip
 * e fica de fora — esse a pessoa baixa e abre.
 */

import { idioma, t } from './i18n.js'

//: Quanto um XML de dentro do .xlsx pode ter depois de descompactado.
const TETO_DESCOMPACTADO = 60 * 1024 * 1024

const ENTIDADES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** Texto de um nó XML, sem as entidades. */
export function desescapar(texto) {
  return String(texto ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, nome) => {
    if (nome[0] === '#') {
      const codigo = nome[1] === 'x' || nome[1] === 'X' ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10)
      return Number.isFinite(codigo) && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : inteiro
    }
    return ENTIDADES[nome.toLowerCase()] ?? inteiro
  })
}

/** Atributos de uma tag (`r="A1" t="s"`) num objeto. O prefixo (`r:id`) cai. */
function atributos(tag) {
  const saida = {}
  for (const [, nome, valor] of tag.matchAll(/([\w:]+)="([^"]*)"/g)) saida[nome.replace(/^.*:/, '')] = desescapar(valor)
  return saida
}

/**
 * Cada `<tag ...>conteúdo</tag>` (ou `<tag .../>`) do trecho, em ordem:
 * `[atributos, conteúdo]`.
 *
 * Com `indexOf`, e não com regex preguiçosa: num arquivo malformado de
 * propósito (milhares de `<row>` sem fechar) a regex voltaria a varrer o
 * resto do texto a cada tentativa e travaria a aba. Aqui cada caractere é
 * visto uma vez, e o primeiro bloco sem fim encerra a leitura.
 */
export function* blocos(xml, tag) {
  const abre = `<${tag}`
  const fecha = `</${tag}>`
  let i = 0
  while ((i = xml.indexOf(abre, i)) !== -1) {
    // `<row` não pode casar com `<rowBreaks`: depois do nome vem espaço, `>` ou `/`.
    const depois = xml[i + abre.length] ?? ''
    if (!(depois === '>' || depois === '/' || depois.trim() === '')) {
      i += abre.length
      continue
    }
    const fimDaTag = xml.indexOf('>', i)
    if (fimDaTag === -1) return
    const attrs = xml.slice(i + abre.length, fimDaTag)
    if (attrs.endsWith('/')) {
      yield [attrs.slice(0, -1), '']
      i = fimDaTag + 1
      continue
    }
    const fim = xml.indexOf(fecha, fimDaTag)
    if (fim === -1) return
    yield [attrs, xml.slice(fimDaTag + 1, fim)]
    i = fim + fecha.length
  }
}

const primeiro = (xml, tag) => blocos(xml, tag).next().value ?? null

/** Todo o texto dentro das `<t>` de um trecho (texto rico vem em vários pedaços). */
const textoDosT = (xml) => [...blocos(xml, 't')].map(([, texto]) => desescapar(texto)).join('')

function letraParaIndice(letras) {
  return letras.toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
}

/* -------------------------------------------------------------------- */
/* Formato de número                                                    */
/* -------------------------------------------------------------------- */

//: Formatos embutidos do Excel que são data (14-22) e hora (45-47).
const DATAS_EMBUTIDAS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

/** Código de formato sem o que está entre aspas e colchetes ("R$ " e [Red] não são d, m, y). */
const semLiterais = (codigo) => String(codigo ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')

function casasDoCodigo(codigo) {
  const decimais = /\.(0+)/.exec(semLiterais(codigo))
  return decimais ? decimais[1].length : 0
}

/** O número como a célula o mostra: data, porcentagem, moeda ou número. */
export function formatarNumero(numero, numFmtId = 0, codigo = '') {
  const limpo = semLiterais(codigo)
  const ehData = DATAS_EMBUTIDAS.has(numFmtId) || (/[dmyh]/i.test(limpo) && !/general/i.test(limpo))
  if (ehData) {
    const data = new Date(Date.UTC(1899, 11, 30) + Math.round(numero * 86400000))
    const comHora = numero % 1 !== 0 || numFmtId === 22 || /h/i.test(limpo)
    return comHora
      ? data.toLocaleString(idioma, { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' })
      : data.toLocaleDateString(idioma, { timeZone: 'UTC' })
  }
  if (numFmtId === 9 || numFmtId === 10 || limpo.includes('%')) {
    const casas = numFmtId === 10 ? 2 : casasDoCodigo(codigo)
    return `${(numero * 100).toLocaleString(idioma, { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
  }
  const simbolo = /"([^"]*[$€£][^"]*)"|\[\$([^\]-]+)/.exec(String(codigo ?? ''))
  const casas = codigo ? casasDoCodigo(codigo) : null
  const texto = numero.toLocaleString(
    idioma,
    casas === null ? { maximumFractionDigits: 10 } : { minimumFractionDigits: casas, maximumFractionDigits: casas },
  )
  return simbolo ? `${(simbolo[1] ?? simbolo[2]).trim()} ${texto}` : texto
}

/* -------------------------------------------------------------------- */
/* Leitura                                                              */
/* -------------------------------------------------------------------- */

/**
 * A primeira aba do arquivo como `{ nome, linhas, truncado }`, onde cada
 * linha é uma lista de `{ texto, numero }` (`null` onde não há célula).
 * Os limites cortam planilhas enormes: a prévia é para olhar, não para
 * desenhar cem mil linhas no navegador.
 */
export async function lerXlsx(dados, { limiteDeLinhas = 500, limiteDeColunas = 60 } = {}) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(dados)
  const ler = async (caminho) => {
    const arquivo = zip.file(caminho)
    if (!arquivo) return ''
    // Zip-bomba: poucos KB que viram gigabytes ao abrir. O tamanho
    // descompactado vem no índice do zip, antes de abrir qualquer coisa.
    if ((arquivo._data?.uncompressedSize ?? 0) > TETO_DESCOMPACTADO) throw new Error('xlsx grande demais')
    return arquivo.async('string')
  }

  const aba = primeiro(await ler('xl/workbook.xml'), 'sheet')
  if (!aba) throw new Error('xlsx sem abas')
  const { name: nome, id } = atributos(aba[0])

  const relacao = [...blocos(await ler('xl/_rels/workbook.xml.rels'), 'Relationship')]
    .map(([attrs]) => atributos(attrs))
    .find((r) => r.Id === id)
  const alvo = relacao?.Target ?? 'worksheets/sheet1.xml'
  const folha = await ler(alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`)

  const compartilhados = [...blocos(await ler('xl/sharedStrings.xml'), 'si')].map(([, si]) => textoDosT(si))

  const estilos = await ler('xl/styles.xml')
  const codigos = new Map(
    [...blocos(estilos, 'numFmt')].map(([attrs]) => {
      const a = atributos(attrs)
      return [Number(a.numFmtId), a.formatCode ?? '']
    }),
  )
  const formatoDoEstilo = [...blocos(primeiro(estilos, 'cellXfs')?.[1] ?? '', 'xf')].map(([attrs]) =>
    Number(atributos(attrs).numFmtId ?? 0),
  )

  const linhas = []
  let truncado = false
  for (const [atributosDaLinha, corpo] of blocos(folha, 'row')) {
    const numeroDaLinha = Number(atributos(atributosDaLinha).r ?? linhas.length + 1) - 1
    if (!(numeroDaLinha >= 0)) continue
    if (numeroDaLinha >= limiteDeLinhas) {
      truncado = true
      break
    }
    const linha = []
    let proxima = 0
    for (const [atributosDaCelula, conteudo] of blocos(corpo, 'c')) {
      const a = atributos(atributosDaCelula)
      const letras = /^[A-Z]+/i.exec(a.r ?? '')?.[0]
      const coluna = letras ? letraParaIndice(letras) : proxima
      proxima = coluna + 1
      if (coluna >= limiteDeColunas) {
        truncado = true
        continue
      }
      const v = primeiro(conteudo, 'v')?.[1]
      let celula = null
      if (a.t === 's') celula = { texto: compartilhados[Number(v)] ?? '' }
      else if (a.t === 'inlineStr') celula = { texto: textoDosT(conteudo) }
      else if (a.t === 'b') celula = { texto: v === '1' ? t('VERDADEIRO') : t('FALSO') }
      else if (a.t === 'str' || a.t === 'e') celula = { texto: desescapar(v ?? '') }
      else if (v !== undefined && v !== '') {
        const numero = Number(v)
        const formato = formatoDoEstilo[Number(a.s ?? 0)] ?? 0
        celula = Number.isFinite(numero)
          ? { texto: formatarNumero(numero, formato, codigos.get(formato)), numero: true }
          : { texto: desescapar(v) }
      }
      if (celula) linha[coluna] = celula
    }
    linhas[numeroDaLinha] = linha
  }

  const largura = Math.max(0, ...linhas.map((l) => l?.length ?? 0))
  return {
    nome,
    truncado,
    linhas: Array.from({ length: linhas.length }, (_, i) => Array.from({ length: largura }, (_, c) => linhas[i]?.[c] ?? null)),
  }
}

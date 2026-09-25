/**
 * Gerador de .xlsx sem dependência de planilha.
 *
 * Um .xlsx é um zip de XMLs seguindo o OOXML. Escrever os quatro
 * arquivos mínimos é ~80 linhas; a alternativa era a `xlsx` do npm, que
 * está parada na 0.18.5 com duas falhas HIGH sem correção (a SheetJS
 * migrou a distribuição para o CDN própria e abandonou o registry).
 * Trazer um problema de segurança conhecido para exportar uma tabela não
 * se paga — ainda mais com o JSZip já no projeto por causa do .zip.
 *
 * Cobre o que a planilha do Notefy produz: texto, número e data como
 * texto. Fórmula sai pelo valor calculado, que é o que se espera de uma
 * exportação.
 */

// Com extensão: o `node --test` roda estes módulos direto, sem passar
// pelo Vite, e o ESM do Node não completa o caminho sozinho.
import { valorDaCelula } from './celulas.js'

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

/** Uma célula: número vira `<v>`, o resto vira string inline. */
function celula(ref, valor) {
  if (valor === null || valor === undefined || valor === '') return ''

  // `isFinite` barra NaN e Infinity, que viram `#VALUE!` na planilha —
  // e booleano, que em JS passa por número e sairia como 1/0.
  const numero = typeof valor === 'number' && Number.isFinite(valor)
  if (numero) return `<c r="${ref}"><v>${valor}</v></c>`

  // `t="inlineStr"` evita a tabela de strings compartilhadas: um arquivo
  // a menos e nenhum índice para manter em sincronia.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`
}

/**
 * Monta o .xlsx e devolve um Blob.
 *
 * `columns`: `[{ id, name }]` — a ordem define as colunas da planilha.
 * `rows`: `[{ id, cells: { [idDaColuna]: valor } }]`, o formato que a
 * planilha do Notefy guarda. A assinatura antiga dizia `[{ [id]: valor }]`
 * e o chamador passava as linhas de verdade: toda célula saía vazia e o
 * arquivo exportado tinha só o cabeçalho.
 */
export async function buildXlsx(columns, rows, nomeAba = 'Planilha') {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  const linhas = []

  // Cabeçalho é a linha 1; o corpo começa na 2, e é por isso que o
  // índice das linhas soma 2 e não 1.
  linhas.push(
    `<row r="1">${columns.map((c, i) => celula(`${colunaParaLetra(i)}1`, c.name)).join('')}</row>`,
  )

  rows.forEach((linha, indiceLinha) => {
    const celulas = columns
      .map((coluna, indiceColuna) =>
        celula(`${colunaParaLetra(indiceColuna)}${indiceLinha + 2}`, valorDaCelula(linha, coluna)),
      )
      .join('')
    linhas.push(`<row r="${indiceLinha + 2}">${celulas}</row>`)
  })

  // O Excel usa o nome da aba na interface e recusa estes caracteres,
  // além de um limite de 31. Truncar aqui evita um arquivo que abre
  // "reparado".
  const aba = String(nomeAba).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Planilha'

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
</Relationships>`,
  )

  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${linhas.join('')}</sheetData>
</worksheet>`,
  )

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export { esc as escaparXml, celula as celulaXml }

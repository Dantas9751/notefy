/**
 * Seleção retangular e área de transferência da planilha.
 *
 * Lógica pura, fora do React: é onde moram os erros de índice, e testar
 * um retângulo é bem mais barato do que testar uma grade renderizada.
 *
 * O formato de troca é TSV — é o que Excel, Google Sheets e LibreOffice
 * colocam no clipboard. Sem isso, copiar daqui para lá vira uma linha só.
 */

/**
 * Valor de uma célula, dado a linha e a coluna.
 *
 * A linha guarda os valores em `cells`, indexados pelo id da COLUNA —
 * não por posição, para que reordenar ou renomear coluna não embaralhe os
 * dados. Ler `linha[coluna.id]` direto devolve `undefined` sempre, e foi
 * assim que a exportação para CSV e para .xlsx saía só com o cabeçalho:
 * as linhas existiam, mas todas as células vinham vazias.
 *
 * Existe aqui, e não dentro de cada exportador, porque era exatamente a
 * duplicação dessa leitura que deixou os dois errados do mesmo jeito.
 */
export function valorDaCelula(linha, coluna) {
  if (!linha || !coluna) return undefined
  return linha.cells?.[coluna.id]
}

/** Normaliza duas pontas num retângulo com cantos ordenados. */
export function retangulo(a, b) {
  if (!a) return null
  const outra = b ?? a
  return {
    linhaInicio: Math.min(a.linha, outra.linha),
    linhaFim: Math.max(a.linha, outra.linha),
    colunaInicio: Math.min(a.coluna, outra.coluna),
    colunaFim: Math.max(a.coluna, outra.coluna),
  }
}

/** A célula está dentro do retângulo? */
export function dentro(area, linha, coluna) {
  if (!area) return false
  return (
    linha >= area.linhaInicio &&
    linha <= area.linhaFim &&
    coluna >= area.colunaInicio &&
    coluna <= area.colunaFim
  )
}

/** A célula está em ALGUM dos retângulos? (Ctrl+clique soma blocos.) */
export function dentroDeAlguma(areas, linha, coluna) {
  return (areas ?? []).some((a) => dentro(a, linha, coluna))
}

/**
 * Quais lados da célula são a BORDA EXTERNA da seleção.
 *
 * A seleção é desenhada como contorno, não como preenchimento: pintar a
 * célula inteira esconde o conteúdo e deixa a grade pesada. Para o
 * contorno sair contínuo em volta do bloco (e não uma caixinha por
 * célula), cada célula só desenha o lado que faz divisa com quem está
 * FORA da seleção.
 *
 * Devolve `null` quando a célula não está selecionada.
 */
export function bordasDaSelecao(areas, linha, coluna) {
  if (!dentroDeAlguma(areas, linha, coluna)) return null
  return {
    topo: !dentroDeAlguma(areas, linha - 1, coluna),
    base: !dentroDeAlguma(areas, linha + 1, coluna),
    esquerda: !dentroDeAlguma(areas, linha, coluna - 1),
    direita: !dentroDeAlguma(areas, linha, coluna + 1),
  }
}

/**
 * Retângulo que embrulha todos os outros.
 *
 * Copiar blocos soltos como TSV não tem representação honesta — o Excel
 * recusa. Aqui a cópia usa a caixa que contém tudo, que é previsível e
 * cola em qualquer lugar.
 */
export function uniao(areas) {
  const lista = (areas ?? []).filter(Boolean)
  if (!lista.length) return null
  return {
    linhaInicio: Math.min(...lista.map((a) => a.linhaInicio)),
    linhaFim: Math.max(...lista.map((a) => a.linhaFim)),
    colunaInicio: Math.min(...lista.map((a) => a.colunaInicio)),
    colunaFim: Math.max(...lista.map((a) => a.colunaFim)),
  }
}

/**
 * Texto TSV do trecho selecionado.
 *
 * Valores com tab ou quebra de linha vão entre aspas (convenção do
 * Excel), senão uma célula multilinha viraria várias linhas na colagem.
 */
export function paraTSV(area, rows, columns) {
  if (!area) return ''
  const linhas = []
  for (let l = area.linhaInicio; l <= area.linhaFim; l += 1) {
    const celulas = []
    for (let c = area.colunaInicio; c <= area.colunaFim; c += 1) {
      const coluna = columns[c]
      const bruto = coluna ? rows[l]?.cells?.[coluna.id] : ''
      const valor = bruto === undefined || bruto === null ? '' : String(bruto)
      celulas.push(/[\t\n"]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor)
    }
    linhas.push(celulas.join('\t'))
  }
  return linhas.join('\n')
}

/**
 * Lê TSV (inclusive vindo do Excel) numa matriz de strings.
 *
 * O parser é caractere a caractere por causa das aspas: um `split('\t')`
 * quebraria no meio de uma célula que contém tabulação.
 */
export function deTSV(texto) {
  const matriz = []
  let linha = []
  let atual = ''
  let entreAspas = false

  const fecharCelula = () => {
    linha.push(atual)
    atual = ''
  }
  const fecharLinha = () => {
    fecharCelula()
    matriz.push(linha)
    linha = []
  }

  const conteudo = String(texto ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < conteudo.length; i += 1) {
    const ch = conteudo[i]
    if (entreAspas) {
      if (ch === '"') {
        if (conteudo[i + 1] === '"') {
          atual += '"'
          i += 1
        } else {
          entreAspas = false
        }
      } else {
        atual += ch
      }
      continue
    }
    if (ch === '"' && atual === '') entreAspas = true
    else if (ch === '\t') fecharCelula()
    else if (ch === '\n') fecharLinha()
    else atual += ch
  }
  fecharLinha()

  // Última linha vazia por causa do \n final não é dado.
  if (matriz.length > 1 && matriz[matriz.length - 1].every((c) => c === '')) matriz.pop()
  return matriz
}

/**
 * Cola a matriz a partir de uma célula, devolvendo as linhas novas.
 *
 * O que passa da borda da grade é DESCARTADO: criar linhas e colunas
 * sozinha seria uma surpresa maior do que perder o excedente, e a pessoa
 * ainda tem o conteúdo original no clipboard.
 */
export function colar(matriz, rows, columns, alvo) {
  const novas = rows.map((r) => ({ ...r, cells: { ...(r.cells ?? {}) } }))
  for (let dl = 0; dl < matriz.length; dl += 1) {
    const linha = alvo.linha + dl
    if (linha >= novas.length) break
    for (let dc = 0; dc < matriz[dl].length; dc += 1) {
      const coluna = columns[alvo.coluna + dc]
      if (!coluna) break
      novas[linha].cells[coluna.id] = matriz[dl][dc]
    }
  }
  return novas
}

/** Esvazia as células do retângulo (Delete/Backspace). */
export function limpar(area, rows, columns) {
  if (!area) return rows
  const novas = rows.map((r) => ({ ...r, cells: { ...(r.cells ?? {}) } }))
  for (let l = area.linhaInicio; l <= area.linhaFim; l += 1) {
    if (!novas[l]) continue
    for (let c = area.colunaInicio; c <= area.colunaFim; c += 1) {
      const coluna = columns[c]
      if (coluna) novas[l].cells[coluna.id] = ''
    }
  }
  return novas
}

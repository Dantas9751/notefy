/**
 * Seleção retangular e área de transferência da planilha.
 *
 * Lógica pura, fora do React: é onde moram os erros de índice, e testar
 * um retângulo é bem mais barato do que testar uma grade renderizada.
 *
 * O formato de troca é TSV — é o que Excel, Google Sheets e LibreOffice
 * colocam no clipboard. Sem isso, copiar daqui para lá vira uma linha só.
 */

import { celulaComFormula, deslocarFormula, numeroOuNulo } from './formula.js'

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
 * Escreve só nas linhas e colunas que recebe: quem cola (a planilha)
 * estende a grade antes quando a matriz passa da borda, como o Excel faz.
 *
 * `transformar(valor, dl, dc)` deixa quem cola ajustar cada valor — é por
 * onde a fórmula copiada daqui anda junto com a célula (`=A1` colado uma
 * linha abaixo vira `=A2`).
 */
export function colar(matriz, rows, columns, alvo, transformar = (valor) => valor) {
  const novas = rows.map((r) => ({ ...r, cells: { ...(r.cells ?? {}) } }))
  for (let dl = 0; dl < matriz.length; dl += 1) {
    const linha = alvo.linha + dl
    if (linha >= novas.length) break
    for (let dc = 0; dc < matriz[dl].length; dc += 1) {
      const coluna = columns[alvo.coluna + dc]
      if (!coluna) break
      novas[linha].cells[coluna.id] = transformar(matriz[dl][dc], dl, dc)
    }
  }
  return novas
}

/** Resto que não fica negativo: -1 mod 3 é 2, que é o que o ciclo para cima precisa. */
const modulo = (a, n) => ((a % n) + n) % n

/**
 * Preenchimento pela alça (o quadradinho no canto da seleção), como no Excel.
 *
 * `origem` é a seleção; `alvo`, o retângulo até onde a alça foi puxada (que
 * contém a origem e cresce num eixo só). Cada célula nova copia a da origem
 * na mesma posição do ciclo, e:
 *
 * - fórmula anda junto (`=A1*2` uma linha abaixo vira `=A2*2`);
 * - dois ou mais números formam uma série (1, 2 → 3, 4, 5);
 * - texto terminado em número conta (Aula 1 → Aula 2, Aula 3).
 *
 * `rows` está na ordem da TELA; `indiceReal(i)` diz a posição gravada da
 * linha `i`, que é o que as referências das fórmulas endereçam.
 */
export function preencher(origem, alvo, rows, columns, indiceReal = (i) => i) {
  const novas = rows.map((r) => ({ ...r, cells: { ...(r.cells ?? {}) } }))
  const vertical = alvo.linhaInicio !== origem.linhaInicio || alvo.linhaFim !== origem.linhaFim

  // Uma "faixa" é uma coluna (preenchendo para baixo/cima) ou uma linha (para os lados).
  const faixas = vertical
    ? range(origem.colunaInicio, origem.colunaFim)
    : range(origem.linhaInicio, origem.linhaFim)
  const [deO, ateO] = vertical ? [origem.linhaInicio, origem.linhaFim] : [origem.colunaInicio, origem.colunaFim]
  const [deA, ateA] = vertical ? [alvo.linhaInicio, alvo.linhaFim] : [alvo.colunaInicio, alvo.colunaFim]
  const tamanho = ateO - deO + 1

  for (const faixa of faixas) {
    const posicao = (p) => (vertical ? { linha: p, coluna: faixa } : { linha: faixa, coluna: p })
    const ler = (p) => {
      const { linha, coluna } = posicao(p)
      return novas[linha]?.cells[columns[coluna]?.id]
    }
    const fonte = range(deO, ateO).map(ler)
    // "10%" e "R$ 10" ficam fora da série: ela escreve número puro, e o
    // símbolo sumiria. Esses se repetem, como texto.
    const numeros = fonte.map((v) => (typeof v === 'string' && /^=|[%$€£]/.test(v) ? null : numeroOuNulo(v)))
    const serie = tamanho >= 2 && numeros.every((n) => n !== null)
    const passo = serie ? (numeros[tamanho - 1] - numeros[0]) / (tamanho - 1) : 0

    for (let p = deA; p <= ateA; p += 1) {
      if (p >= deO && p <= ateO) continue
      const { linha, coluna } = posicao(p)
      const column = columns[coluna]
      if (!novas[linha] || !column) continue
      const k = p - deO
      const de = deO + modulo(k, tamanho)
      const valor = fonte[de - deO]
      let novo = valor

      if (serie) {
        novo = Math.round((numeros[0] + passo * k) * 1e10) / 1e10
      } else if (celulaComFormula(column, valor)) {
        const origemDaCelula = posicao(de)
        novo = deslocarFormula(
          String(valor),
          indiceReal(linha) - indiceReal(origemDaCelula.linha),
          coluna - origemDaCelula.coluna,
        )
      } else if (tamanho === 1 && typeof valor === 'string') {
        const contado = /^(.*\D)(\d+)$/.exec(valor)
        if (contado) novo = `${contado[1]}${Number(contado[2]) + k}`
      }
      novas[linha].cells[column.id] = novo
    }
  }
  return novas
}

function range(de, ate) {
  return Array.from({ length: ate - de + 1 }, (_, i) => de + i)
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

/**
 * Formatação das células marcadas (negrito, cores, alinhamento...).
 *
 * O estilo mora na LINHA, em `styles[idDaColuna]`, ao lado de `cells`: anda
 * com a linha ao inserir, excluir e ordenar, sem reescrita nenhuma.
 * `alvos` leva o id de cada linha ao conjunto de ids de coluna marcados;
 * `mudar(estilo)` devolve o estilo novo. Chave vazia (`null`, `false`) sai
 * do payload, e a linha sem estilo nenhum perde o `styles`.
 */
export function estilizar(rows, alvos, mudar) {
  return rows.map((row) => {
    const colunas = alvos.get(row.id)
    if (!colunas) return row
    const estilos = { ...(row.styles ?? {}) }
    for (const id of colunas) {
      const novo = Object.fromEntries(
        Object.entries(mudar(estilos[id] ?? {})).filter(([, v]) => v !== undefined && v !== null && v !== false),
      )
      if (Object.keys(novo).length) estilos[id] = novo
      else delete estilos[id]
    }
    const { styles: _antes, ...resto } = row
    return Object.keys(estilos).length ? { ...resto, styles: estilos } : resto
  })
}

/**
 * Texto comprido passando por cima das vizinhas vazias, como no Excel —
 * em vez de cortado com "..." na largura da própria coluna.
 *
 * Por célula da linha: `larguras[c]` em px, `vazias[c]` (nada escrito, nada
 * em edição) e `precisa[c]`, a largura que o texto pede (0 quando não
 * transborda: número, alinhado ao centro, com quebra de linha). Devolve
 * quanto cada célula se estende para a direita e quais divisórias somem
 * embaixo do texto. Coluna congelada não transborda: ela fica por cima
 * das outras ao rolar, e a vizinha congelada pintaria por cima do texto.
 */
export function transbordos(larguras, vazias, precisa, congeladas = 0) {
  const estende = larguras.map(() => 0)
  const semBorda = larguras.map(() => false)
  for (let c = 0; c < larguras.length; c += 1) {
    const falta = precisa[c] - larguras[c]
    if (vazias[c] || falta <= 0 || c < congeladas) continue
    let coberto = 0
    for (let k = c + 1; k < larguras.length && vazias[k] && coberto < falta; k += 1) {
      semBorda[k - 1] = true
      coberto += larguras[k]
    }
    estende[c] = Math.min(coberto, falta)
  }
  return { estende, semBorda }
}

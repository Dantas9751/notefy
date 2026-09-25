/**
 * Detecção de pedidos de criação/edição de documentos no chat.
 *
 * Quando o pedido casa com um padrão e há item aberto do tipo certo,
 * o chat não responde texto — ele gera direto no documento e mostra
 * "Quadro criado" / "Texto adicionado" etc.
 *
 * Robustez de escrita: o texto é NORMALIZADO SEM ACENTOS antes de casar
 * ("faca um mapa" = "faça um mapa", "paes" = "pães"). Quem digita sem
 * cedilha não pode ficar sem ação — foi exatamente o caso de "faca um
 * mapa mental" que só conversava.
 */

/** Remove acentos mantendo o resto minúsculo. */
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Verbos de criação/modificação, infinitivo e imperativos (cria/crie),
// já sem acentos porque o texto chega normalizado.
//
// A família `coloc` estava faltando: o padrão só tinha `coloqu`, então
// "coloca no texto um resumo" não virava ação — c e q são radicais
// diferentes do mesmo verbo.
const VERBOS =
  'cri(?:ar|e|a)|ger(?:ar|e)|mont(?:ar|e)|fa(?:zer|z|ca|co)|desenh(?:ar|e)|' +
  'escrev(?:er|e|a)|adicion(?:ar|e|a)|insir(?:ir|a)|inser(?:ir|e)|' +
  'coloc(?:ar|a|o)|coloqu(?:e|em)|b(?:otar|ota|ote)|po(?:r|e|nha)|' +
  'popul(?:ar|e|a)|preench(?:er|a|e)|complet(?:ar|e|a)|resum(?:ir|e|a)'

/**
 * Formas canônicas usadas pelo corretor de digitação.
 *
 * Só o VERBO é corrigido. Aplicar distância de edição na frase inteira
 * transformaria "compare com a nota" em "crie uma nota" — o resto tem de
 * casar exato.
 */
const VERBOS_CANONICOS = [
  'criar', 'crie', 'cria', 'gerar', 'gere', 'montar', 'monte', 'fazer', 'faca',
  'faz', 'desenhar', 'desenhe', 'escrever', 'escreve', 'escreva', 'adicionar',
  'adicione', 'adiciona', 'inserir', 'insira', 'colocar', 'coloca', 'coloque',
  'botar', 'bota', 'ponha', 'poe', 'popular', 'popule', 'preencher', 'preencha',
  'completar', 'complete', 'resumir', 'resuma', 'continuar', 'continue',
  'corrigir', 'corrija',
]

/**
 * Distância de Damerau-Levenshtein com teto.
 *
 * A transposição contando 1 é o que faz "colouqe" virar "coloque" — o
 * erro de digitação mais comum é justamente trocar duas letras de lugar.
 * O teto corta o cálculo cedo: palavras muito diferentes não interessam.
 */
function distancia(a, b, teto) {
  if (Math.abs(a.length - b.length) > teto) return teto + 1
  const linhas = []
  for (let i = 0; i <= a.length; i += 1) linhas.push([i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j += 1) linhas[0][j] = j

  for (let i = 1; i <= a.length; i += 1) {
    let melhorNaLinha = Infinity
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      let valor = Math.min(
        linhas[i - 1][j] + 1,
        linhas[i][j - 1] + 1,
        linhas[i - 1][j - 1] + custo,
      )
      // Transposição (ab -> ba).
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        valor = Math.min(valor, linhas[i - 2][j - 2] + 1)
      }
      linhas[i][j] = valor
      melhorNaLinha = Math.min(melhorNaLinha, valor)
    }
    if (melhorNaLinha > teto) return teto + 1
  }
  return linhas[a.length][b.length]
}

/**
 * Palavras que o corretor NUNCA toca.
 *
 * São os substantivos que os próprios padrões procuram e os que ficam a
 * uma letra de um verbo. Sem esta lista, "um resumo de X" viraria "um
 * resuma de X" (distância 1) e o tópico chegaria corrompido na IA.
 */
const PROTEGIDAS = new Set([
  'resumo', 'resumos', 'texto', 'textos', 'nota', 'notas', 'planilha',
  'planilhas', 'mapa', 'mental', 'quadro', 'cartoes', 'sticky', 'stickies',
  'diagrama', 'diagramas', 'fluxograma', 'fluxo', 'classe', 'classes',
  'tabela', 'coluna', 'colunas', 'linha', 'linhas', 'secao', 'topicos',
  'sobre', 'minha', 'nova', 'novo', 'conteudo', 'material',
])

/**
 * Corrige erros de digitação nos verbos.
 *
 * Só a REGIÃO DO VERBO é corrigida (as três primeiras palavras): o
 * tópico vem depois e precisa chegar intacto na IA. A primeira palavra
 * aceita distância 2 porque é quase sempre o verbo ("colouqe", "geraer");
 * as seguintes só 1, para não arrastar substantivo para verbo.
 */
export function corrigirVerbos(texto) {
  const palavras = texto.split(/(\s+)/)
  let indicePalavra = 0
  return palavras
    .map((pedaco) => {
      if (/^\s+$/.test(pedaco) || !pedaco) return pedaco
      const posicao = indicePalavra
      indicePalavra += 1
      if (posicao > 2) return pedaco
      if (pedaco.length < 4) return pedaco
      if (PROTEGIDAS.has(pedaco) || VERBOS_CANONICOS.includes(pedaco)) return pedaco

      const teto = posicao === 0 ? 2 : 1
      let melhor = null
      let melhorDistancia = teto + 1
      for (const verbo of VERBOS_CANONICOS) {
        const d = distancia(pedaco, verbo, teto)
        if (d < melhorDistancia) {
          melhorDistancia = d
          melhor = verbo
        }
      }
      return melhor && melhorDistancia <= teto ? melhor : pedaco
    })
    .join('')
}

// Partículas opcionais entre verbo e substantivo (dentro de padrao()).
const UM = '(?:um\\s+|uma\\s+|os\\s+|as\\s+)?'

/**
 * Padrão para "verbo + objeto [+ separador + tópico]".
 * "crie um der basico" captura tópico "basico escolha o tema";
 * "criar mapa mental" captura vazio (usa o conteúdo do documento).
 */
function padrao(expr) {
  // \b no fim: "planilha" não pode casar dentro de "planilhas".
  const base = `(?:${VERBOS})\\s+${UM}(?:${expr})\\b`
  const comSep = new RegExp(`${base}\\s+(?:sobre|de|para|do|da|dos|das|com)\\s+(.+)`)
  const semSep = new RegExp(`${base}(?:\\s+(.+))?`)
  return (texto) => texto.match(comSep) || texto.match(semSep)
}

const SEM_TOPICO = 'o conteudo do documento'

export function detectarAcao(textoBruto, kind) {
  const t = corrigirVerbos(normalizar(textoBruto))

  // ----------------------------------------------------------------
  // NOTA: escrever/adicionar texto dentro da nota aberta
  // ----------------------------------------------------------------
  if (kind === 'note') {
    // "crie UMA NOTA sobre X" pede um item novo, não texto nesta aqui.
    if (/\b(?:cri|ger|fa)\w*\s+(?:uma?\s+)?nota\b/.test(t)) {
      // cai no bloco genérico de criação lá embaixo
    } else {
      // Tópico explícito em "sobre X" sempre vence: "um texto na nota
      // que estamos SOBRE Nápoles" — o assunto é Nápoles, não "um texto".
      const sobre = t.match(/\bsobre\s+(.+)$/)
      const falaDeTexto =
        /texto|resumo|secao|topic|anotac|escrev|adicione|insira|coloque|poe|ponha|botar|bota/.test(t)
      if (new RegExp(`(?:${VERBOS})`).test(t) && sobre && falaDeTexto) {
        return { task: 'nota.texto', input: sobre[1] }
      }

      // "adicione X na nota" sem "sobre": tópico vem antes do alvo.
      const alvoNota = t.match(
        new RegExp(`(?:${VERBOS})\\s+(.+?)\\s+(?:na|no|minha|meu)\\s+(?:nota|texto|caderno)`),
      )
      if (alvoNota) return { task: 'nota.texto', input: alvoNota[1] }

      // Ordem inversa, que é como o usuário realmente fala: "faça NA NOTA
      // um resumo da primeira guerra", "coloca no texto um resumo de X".
      // O alvo aparece ANTES do objeto e o padrão anterior não pegava.
      const alvoAntes = t.match(
        new RegExp(
          `(?:${VERBOS})\\s+(?:na|no|em|dentro d[ao])\\s+(?:minha\\s+|meu\\s+|essa\\s+|esse\\s+|este\\s+|esta\\s+)?(?:nota|texto|caderno)\\s+(?:que\\s+estamos\\s+)?(.+)`,
        ),
      )
      if (alvoAntes) {
        const topico = alvoAntes[1].match(/\bsobre\s+(.+)$/) ?? alvoAntes[1].match(/\bd[aeo]s?\s+(.+)$/)
        return { task: 'nota.texto', input: topico ? topico[1] : alvoAntes[1] }
      }
    }

    // continuar/resumir/corrigir falados, não só com barra. Quando vem
    // "continua sobre X", o assunto viaja junto: sem ele o modelo não
    // tem como continuar uma nota que ainda está vazia.
    const assunto = t.match(/\bsobre\s+(.+)$/)?.[1]
    if (/^(continua|continuar|continue)\b/.test(t)) {
      return { task: 'nota.continuar', input: assunto }
    }
    if (/^(resume|resumir|resuma)\b/.test(t)) return { task: 'nota.resumir' }
    if (/^(corrige|corrigir|corrija)\b/.test(t)) return { task: 'nota.corrigir' }
  }

  // ----------------------------------------------------------------
  // CANVAS: mapa mental, quadro, stickies
  // ----------------------------------------------------------------
  if (kind === 'canvas') {
    const mapa = padrao('mapa\\s+mental')(t)
    if (mapa) return { task: 'canvas.gerar', input: `Mapa mental sobre ${mapa[1] || SEM_TOPICO}` }

    const quadro = padrao('quadro branco|quadro')(t)
    if (quadro) return { task: 'canvas.gerar', input: `Quadro branco sobre ${quadro[1] || SEM_TOPICO}` }

    const stickies = padrao('cartoes|stickies|sticky')(t)
    if (stickies) return { task: 'canvas.gerar', input: `Stickies sobre ${stickies[1] || SEM_TOPICO}` }

    if (/regenerar|recriar|refazer/.test(t) && /canvas|quadro|desenho/.test(t)) {
      return { task: 'canvas.gerar', apply: 'replace' }
    }
  }

  // ----------------------------------------------------------------
  // DIAGRAMA: DER, fluxograma, UML
  // ----------------------------------------------------------------
  if (kind === 'diagram') {
    const der = padrao('der|diagrama entidade relacionamento|modelo entidade relacionamento')(t)
    if (der) return { task: 'diagrama.gerar', input: `DER de ${der[1] || SEM_TOPICO}` }

    const fluxo = padrao('fluxograma|fluxo')(t)
    if (fluxo) return { task: 'diagrama.gerar', input: `Fluxograma de ${fluxo[1] || SEM_TOPICO}` }

    const uml = padrao('diagrama de classes|diagrama de sequencia|diagrama de caso de uso|diagrama de atividade|diagrama de estados')(t)
    if (uml) return { task: 'diagrama.gerar', input: `Diagrama UML ${uml[1] ? `- ${uml[1]}` : ''}`.trim() }

    const classes = padrao('classes|classe')(t)
    if (classes) return { task: 'diagrama.gerar', input: `Diagrama de classes ${classes[1] ? `sobre ${classes[1]}` : ''}`.trim() }

    const diagrama = padrao('diagrama')(t)
    if (diagrama) return { task: 'diagrama.gerar', input: `Diagrama sobre ${diagrama[1] || SEM_TOPICO}` }

    if (/regenerar|recriar|refazer/.test(t) && /diagrama|der|fluxo/.test(t)) {
      return { task: 'diagrama.gerar', apply: 'replace' }
    }
  }

  // ----------------------------------------------------------------
  // PLANILHA: preencher / colocar dados / colunas
  // ----------------------------------------------------------------
  if (kind === 'spreadsheet') {
    // "coloque a tabuada de 10 na planilha" — tópico vem ANTES do alvo
    const naPlanilha = t.match(
      new RegExp(`(?:${VERBOS})\\s+(?:o\\s+|a\\s+|os\\s+|as\\s+)?(.+?)\\s+(?:na|na|minha)\\s+planilha`),
    )
    if (naPlanilha) return { task: 'planilha.preencher', input: naPlanilha[1] }

    // "preencha a planilha com X" / "preencher a planilha"
    const preenchaCom = t.match(/preenc\w+\s+(?:a\s+)?planilha\s+com\s+(.+)/)
    if (preenchaCom) return { task: 'planilha.preencher', input: preenchaCom[1] }

    if (/preenc\w+|popular|completar/.test(t) && /planilha/.test(t)) {
      return { task: 'planilha.preencher' }
    }

    const criarPlanilhaAqui = padrao('planilha')(t)
    if (criarPlanilhaAqui) {
      return {
        task: 'planilha.preencher',
        input: criarPlanilhaAqui[1] || 'dados de exemplo',
      }
    }
  }

  // ----------------------------------------------------------------
  // Qualquer tipo: criar OUTRO item (nota/planilha novas)
  // ----------------------------------------------------------------
  const novaNota = padrao('nova nota|nota nova|nova planilha|planilha nova')(t)
  if (novaNota) {
    return {
      task: novaNota[0].includes('planilha') ? 'criar.planilha' : 'criar.nota',
      input: novaNota[1] || '',
    }
  }

  // "crie uma nota sobre X" / "crie uma planilha com X" a partir de
  // qualquer item — cria um NOVO documento, não mexe no atual.
  const gPlanilha = padrao('planilha')(t)
  if (gPlanilha && kind !== 'spreadsheet') {
    return { task: 'criar.planilha', input: gPlanilha[1] || '' }
  }
  const gNota = padrao('nota')(t)
  if (gNota) {
    return { task: 'criar.nota', input: gNota[1] || '' }
  }

  return null
}

/**
 * Rótulo curto da ação para exibir no chat.
 */
export function rotuloAcao(task) {
  const mapa = {
    'canvas.gerar': 'Quadro criado',
    'diagrama.gerar': 'Diagrama criado',
    'planilha.preencher': 'Planilha atualizada',
    'nota.texto': 'Texto adicionado à nota',
    'nota.resumir': 'Resumo adicionado',
    'nota.corrigir': 'Texto corrigido',
    'nota.continuar': 'Continuação adicionada',
    'criar.nota': 'Nota criada',
    'criar.planilha': 'Planilha criada',
    'criar.diagrama': 'Diagrama criado',
    'criar.canvas': 'Quadro criado',
  }
  return mapa[task] || 'Item atualizado'
}

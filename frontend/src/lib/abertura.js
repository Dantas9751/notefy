/**
 * A animação de abertura, como função do tempo: "Note" aparece composto,
 * uma caneta escreve "fy" e a tela abre para o app.
 *
 * Módulo puro: dado o milissegundo, devolve o quadro (opacidades, quanto do
 * traço já foi escrito, onde a caneta está). Um relógio só para tudo é o que
 * mantém a ponta da caneta presa à ponta do traço; com uma animação CSS para
 * cada peça, as duas escorregavam uma da outra.
 */

/** Os tempos de cada parte, em ms, na ordem em que acontecem. */
export const TEMPOS = {
  nota: [100, 800], // "Note" surge
  entrada: [800, 1150], // a caneta desce até o papel
  escrita: [1150, 2530], // "fy"
  saidaDaCaneta: [2530, 2880], // a caneta volta por onde veio
  saida: [3080, 3480], // a tela abre para o app
}

/** Com movimento reduzido: o nome inteiro, parado, só aparece e some. */
export const TEMPOS_REDUZIDOS = {
  // Fade de meio segundo: com 200 ms o nome parecia brotar na tela de uma vez.
  nota: [100, 600],
  saida: [1300, 1700],
}

export const DURACAO = TEMPOS.saida[1]
export const DURACAO_REDUZIDA = TEMPOS_REDUZIDOS.saida[1]

/**
 * Onde a abertura espera o app ficar pronto: logo antes de a tela abrir. Sem
 * esperar, ela acabava antes do backend e deixava um vazio escuro no meio.
 */
export const inicioDaSaida = (reduzido) => (reduzido ? TEMPOS_REDUZIDOS : TEMPOS).saida[0]

/** Pular: quanto dura a saída a partir de onde estiver. */
export const SAIDA_AO_PULAR = 220

const CHAVE_VISTA = 'notefy.aberturaVista'
const CHAVE_MODO = 'notefy.abertura'

/** Configurações → Aparência: seguir o "movimento reduzido" do sistema, animar sempre ou não abrir com nada. */
export const MODOS_DA_ABERTURA = ['sistema', 'sempre', 'nunca']

export function modoDaAbertura() {
  try {
    const modo = localStorage.getItem(CHAVE_MODO)
    return MODOS_DA_ABERTURA.includes(modo) ? modo : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function definirModoDaAbertura(modo) {
  try {
    localStorage.setItem(CHAVE_MODO, modo)
  } catch {
    // Sem armazenamento: vale só até fechar.
  }
}

/**
 * Como a abertura passa: `'completa'` (a caneta escrevendo), `'reduzida'` (o
 * nome parado, que só aparece e some) ou `null` (não passa).
 *
 * "Sempre" existe porque o movimento reduzido do Windows vem dos "Efeitos de
 * animação", que muita gente desliga por desempenho, e não por enjoo: aí a
 * abertura era só o nome parado, sem a pessoa saber por quê.
 */
export function comoAbrir(modo, sistemaReduz) {
  if (modo === 'nunca') return null
  if (modo === 'sempre') return 'completa'
  return sistemaReduz ? 'reduzida' : 'completa'
}

/** Já passou nesta abertura do app? Sem `sessionStorage` (bloqueado, ou fora do navegador) conta como vista. */
export function aberturaJaVista() {
  try {
    return !!sessionStorage.getItem(CHAVE_VISTA)
  } catch {
    return true
  }
}

export function marcarAberturaVista() {
  try {
    sessionStorage.setItem(CHAVE_VISTA, '1')
  } catch {
    // Sem armazenamento: nada a guardar.
  }
}

const entre = (t, [inicio, fim]) => Math.min(1, Math.max(0, (t - inicio) / (fim - inicio)))
const saiDevagar = (x) => 1 - (1 - x) ** 3
const entraDevagar = (x) => x ** 3
const suave = (x) => (1 - Math.cos(Math.PI * x)) / 2

/**
 * O quadro no instante `t` (ms desde o começo).
 *
 * - `nota`: opacidade de "Note"; `subida`: quanto ele ainda está abaixo do lugar (px).
 * - `escrita`: fração do "fy" já escrita (0 a 1).
 * - `caneta`: opacidade da caneta; `afastamento`: 0 encostada no papel, 1 longe dele.
 * - `cena`: opacidade da tela inteira (1 cobre o app, 0 já mostra o app).
 * - `fim`: acabou, pode desmontar.
 */
export function quadroDaAbertura(t, { reduzido = false } = {}) {
  if (reduzido) {
    return {
      nota: entre(t, TEMPOS_REDUZIDOS.nota),
      subida: 0,
      escrita: 1,
      caneta: 0,
      afastamento: 1,
      cena: 1 - entre(t, TEMPOS_REDUZIDOS.saida),
      fim: t >= DURACAO_REDUZIDA,
    }
  }
  const nota = saiDevagar(entre(t, TEMPOS.nota))
  const descendo = saiDevagar(entre(t, TEMPOS.entrada))
  const subindo = entraDevagar(entre(t, TEMPOS.saidaDaCaneta))
  return {
    nota,
    subida: 8 * (1 - nota),
    // Linear aqui: o ritmo da mão (acelerar, frear, voar entre traços) é de `planejarEscrita`.
    escrita: entre(t, TEMPOS.escrita),
    caneta: t < TEMPOS.saidaDaCaneta[0] ? descendo : 1 - subindo,
    afastamento: t < TEMPOS.saidaDaCaneta[0] ? 1 - descendo : subindo,
    cena: 1 - suave(entre(t, TEMPOS.saida)),
    fim: t >= DURACAO,
  }
}

/**
 * A escrita inteira como UMA trajetória: os traços com tinta e, entre eles, o
 * caminho da caneta no ar. `tracos`: os pontos de cada traço, na ordem em que
 * se escreve, espaçados por igual ao longo dele.
 *
 * O que faz parecer mão, e não máquina:
 * - a velocidade nunca chega a zero entre um traço e outro: cai no fim do
 *   traço e o ar começa nessa mesma velocidade (sem o "para e recomeça" de
 *   uma animação por traço);
 * - o ar é um arco que sai na direção em que o traço terminou e chega na
 *   direção em que o próximo começa;
 * - traço longo é feito mais depressa que o curto (a mão não gasta o dobro do
 *   tempo num traço com o dobro do tamanho).
 *
 * Devolve `em(p)`, com `p` de 0 a 1 no tempo: onde está a ponta, quanto de
 * cada traço já foi escrito (`revelados`) e, no ar, que fração do caminho
 * aérea já foi feita (`noAr`, para a caneta subir e descer).
 */
export function planejarEscrita(tracos, { curvaNoAr = 0.35, maisRapidoNoAr = 1.6 } = {}) {
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
  const direcao = (de, para) => {
    const d = dist(de, para) || 1
    return { x: (para.x - de.x) / d, y: (para.y - de.y) / d }
  }
  // Direção na saída e na entrada de um traço, olhando alguns pontos para não pegar o tremido da ponta.
  const saida = (pts) => direcao(pts[Math.max(0, pts.length - 4)], pts.at(-1))
  const entrada = (pts) => direcao(pts[0], pts[Math.min(pts.length - 1, 3)])

  const segmentos = []
  tracos.forEach((pontos, i) => {
    segmentos.push({ tinta: i, pontos })
    if (i === tracos.length - 1) return
    const [p0, p3] = [pontos.at(-1), tracos[i + 1][0]]
    const d = dist(p0, p3) * curvaNoAr
    const [s, e] = [saida(pontos), entrada(tracos[i + 1])]
    const p1 = { x: p0.x + s.x * d, y: p0.y + s.y * d }
    const p2 = { x: p3.x - e.x * d, y: p3.y - e.y * d }
    const bezier = (t) => {
      const u = 1 - t
      return {
        x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
        y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
      }
    }
    segmentos.push({ ar: i, pontos: Array.from({ length: 41 }, (_, k) => bezier(k / 40)) })
  })

  // Comprimento acumulado de cada segmento, e o tempo de cada trechinho pela velocidade naquele ponto.
  for (const seg of segmentos) {
    seg.acumulado = [0]
    for (let k = 1; k < seg.pontos.length; k += 1) seg.acumulado.push(seg.acumulado[k - 1] + dist(seg.pontos[k - 1], seg.pontos[k]))
    seg.comprimento = seg.acumulado.at(-1) || 1
  }
  const tintas = segmentos.filter((seg) => 'tinta' in seg)
  const media = tintas.reduce((soma, seg) => soma + seg.comprimento, 0) / tintas.length
  const nasPontas = 0.35
  let relogio = 0
  segmentos.forEach((seg, i) => {
    const pico = Math.max(nasPontas * 1.6, (seg.comprimento / media) ** 0.4 * ('ar' in seg ? maisRapidoNoAr : 1))
    // No começo e no fim da escrita a caneta parte e chega quase parada.
    const inicio = i === 0 ? 0.12 : nasPontas
    const fim = i === segmentos.length - 1 ? 0.12 : nasPontas
    const velocidade = (s) => inicio + (fim - inicio) * s + (pico - (inicio + (fim - inicio) * s)) * Math.sin(Math.PI * s)
    seg.tempos = [relogio]
    for (let k = 1; k < seg.pontos.length; k += 1) {
      const passo = seg.acumulado[k] - seg.acumulado[k - 1]
      const s = (seg.acumulado[k] + seg.acumulado[k - 1]) / 2 / seg.comprimento
      relogio += passo / velocidade(s)
      seg.tempos.push(relogio)
    }
  })
  const total = relogio || 1

  const em = (progresso) => {
    const t = Math.min(1, Math.max(0, progresso)) * total
    const atual = segmentos.findIndex((seg) => t <= seg.tempos.at(-1))
    const seg = segmentos[atual === -1 ? segmentos.length - 1 : atual]
    let k = 1
    while (k < seg.tempos.length - 1 && seg.tempos[k] < t) k += 1
    const intervalo = seg.tempos[k] - seg.tempos[k - 1] || 1
    const f = Math.min(1, Math.max(0, (t - seg.tempos[k - 1]) / intervalo))
    const [a, b] = [seg.pontos[k - 1], seg.pontos[k]]
    const percorrido = (seg.acumulado[k - 1] + (seg.acumulado[k] - seg.acumulado[k - 1]) * f) / seg.comprimento
    const revelados = tracos.map((_, i) => {
      if ('tinta' in seg) return i < seg.tinta ? 1 : i === seg.tinta ? percorrido : 0
      return i <= seg.ar ? 1 : 0
    })
    const duracao = seg.tempos.at(-1) - seg.tempos[0] || 1
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      revelados,
      noAr: 'ar' in seg ? (t - seg.tempos[0]) / duracao : null,
    }
  }
  return { em, segmentos }
}

/** Uma curva lisa passando pelos pontos (Catmull-Rom em Bézier), para o caminho medido na letra não sair tremido. */
export function caminhoSuave(pontos) {
  if (pontos.length < 2) return ''
  const p = (i) => pontos[Math.min(pontos.length - 1, Math.max(0, i))]
  let d = `M ${p(0).x} ${p(0).y}`
  for (let i = 0; i < pontos.length - 1; i += 1) {
    const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
    d += ` C ${b.x + (c.x - a.x) / 6} ${b.y + (c.y - a.y) / 6} ${c.x - (e.x - b.x) / 6} ${c.y - (e.y - b.y) / 6} ${c.x} ${c.y}`
  }
  return d
}

/**
 * Os dois braços do "y" da fonte em uso, medidos na letra desenhada (mesma
 * entrada de `geometriaDoF`): o curto, do topo esquerdo até onde encontra o
 * longo, e o longo, do topo direito até o fim da cauda. Cada braço é a linha
 * do meio da tinta, linha a linha, de cima para baixo.
 *
 * `null` se a letra não tem dois braços em cima (aí vale o desenho por proporção).
 */
export function geometriaDoY({ tinta, largura, altura, origemX, linhaDeBase, escala }) {
  const trechos = []
  for (let y = 0; y < altura; y += 1) {
    const linha = []
    let comeco = -1
    for (let x = 0; x <= largura; x += 1) {
      const cheio = x < largura && tinta[y * largura + x]
      if (cheio && comeco < 0) comeco = x
      if (!cheio && comeco >= 0) {
        linha.push([comeco, x - 1])
        comeco = -1
      }
    }
    trechos.push(linha)
  }
  const topo = trechos.findIndex((l) => l.length)
  const fundo = trechos.findLastIndex((l) => l.length)
  if (topo < 0) return null
  const inicio = topo + 1
  if (trechos[inicio].length < 2) return null
  // Os braços se juntam na primeira linha (abaixo do topo) com um trecho só.
  let juncao = inicio
  while (juncao < fundo && trechos[juncao].length >= 2) juncao += 1
  if (juncao >= fundo) return null

  const passo = Math.max(1, Math.round((fundo - topo) / 24))
  const meio = ([a, b]) => (a + b + 1) / 2
  const ponto = (x, y) => ({ x: (x - origemX) / escala, y: (y + 0.5 - linhaDeBase) / escala })
  const espessura = trechos[inicio][0][1] - trechos[inicio][0][0] + 1
  // O curto para uma espessura antes do encontro: a ponta redonda da máscara, ali, já
  // revelava o braço longo. O encontro aparece quando a caneta passa pelo longo.
  const fimDoCurto = Math.max(inicio + 1, juncao - Math.round(espessura))
  const curto = []
  for (let y = inicio; y < fimDoCurto; y += passo) curto.push(ponto(meio(trechos[y][0]), y))
  curto.push(ponto(meio(trechos[fimDoCurto][0]), fimDoCurto))
  const longo = []
  for (let y = inicio; y <= fundo; y += passo) longo.push(ponto(meio(trechos[y].at(-1)), y))
  // A cauda termina na ponta esquerda da última linha, não no meio dela.
  longo.push(ponto(trechos[fundo][0][0] + espessura / 2, fundo))
  return { curto, longo, espessura: espessura / escala }
}

/**
 * Onde estão as partes do "f" da fonte em uso, medidas na própria letra
 * desenhada (`tinta`: 1 onde há tinta, linha a linha, `largura` × `altura` px).
 *
 * Por que medir: cada sistema tem a sua fonte, e o "f" da Segoe UI não é o da
 * Inter nem o do Roboto. Com proporções fixas, a caneta passava ao lado da
 * haste e a máscara (larga para compensar) revelava pedaços da barra fora de
 * hora. Medindo, a caneta passa no meio de cada traço e a máscara tem a
 * espessura dele.
 *
 * A haste é a coluna com mais tinta; a barra, a linha mais larga do miolo da
 * letra; o gancho, a tinta mais à direita acima da barra. Devolve tudo em
 * unidades do SVG (`escala` px por unidade), com x a partir de `origemX` e y a
 * partir da `linhaDeBase` (negativo para cima), ou `null` se a letra não tem a
 * forma esperada (aí vale o desenho por proporção).
 */
export function geometriaDoF({ tinta, largura, altura, origemX, linhaDeBase, escala }) {
  const linhas = []
  const colunas = new Array(largura).fill(0)
  for (let y = 0; y < altura; y += 1) {
    let min = Infinity
    let max = -1
    for (let x = 0; x < largura; x += 1) {
      if (!tinta[y * largura + x]) continue
      colunas[x] += 1
      if (x < min) min = x
      max = x
    }
    linhas.push(max < 0 ? null : { min, max })
  }
  const topo = linhas.findIndex(Boolean)
  const fundo = linhas.findLastIndex(Boolean)
  if (topo < 0) return null

  // Haste: as colunas com quase tanta tinta quanto a mais cheia, em volta dela.
  const cheia = colunas.indexOf(Math.max(...colunas))
  let hasteDe = cheia
  let hasteAte = cheia
  while (hasteDe > 0 && colunas[hasteDe - 1] >= colunas[cheia] * 0.8) hasteDe -= 1
  while (hasteAte < largura - 1 && colunas[hasteAte + 1] >= colunas[cheia] * 0.8) hasteAte += 1
  const espessuraDaHaste = hasteAte - hasteDe + 1

  // Barra: no miolo da letra, as linhas quase tão largas quanto a mais larga.
  const miolo = [Math.round(topo + (fundo - topo) * 0.25), Math.round(topo + (fundo - topo) * 0.75)]
  const largura_ = (y) => (linhas[y] ? linhas[y].max - linhas[y].min + 1 : 0)
  let larga = miolo[0]
  for (let y = miolo[0]; y <= miolo[1]; y += 1) if (largura_(y) > largura_(larga)) larga = y
  if (largura_(larga) < espessuraDaHaste * 1.8) return null
  let barraDe = larga
  let barraAte = larga
  while (barraDe > miolo[0] && largura_(barraDe - 1) >= largura_(larga) * 0.85) barraDe -= 1
  while (barraAte < miolo[1] && largura_(barraAte + 1) >= largura_(larga) * 0.85) barraAte += 1
  const barra = linhas.slice(barraDe, barraAte + 1)

  // Gancho: a tinta mais à direita entre o topo e a barra; a ponta é o meio das linhas que chegam lá.
  const acima = linhas.slice(topo, barraDe).map((l, i) => ({ y: topo + i, max: l?.max ?? -1 }))
  const direita = Math.max(...acima.map((l) => l.max))
  const naPonta = acima.filter((l) => l.max >= direita - 1)
  const gancho = naPonta.reduce((soma, l) => soma + l.y, 0) / naPonta.length

  const ux = (px) => (px - origemX) / escala
  const uy = (px) => (px - linhaDeBase) / escala
  return {
    haste: { x: ux((hasteDe + hasteAte + 1) / 2), espessura: espessuraDaHaste / escala },
    topo: uy(topo + espessuraDaHaste / 2),
    gancho: { x: ux(direita + 1 - espessuraDaHaste / 2), y: uy(gancho + 0.5) },
    barra: {
      y: uy((barraDe + barraAte + 1) / 2),
      espessura: (barraAte - barraDe + 1) / escala,
      de: ux(Math.min(...barra.map((l) => l.min))),
      ate: ux(Math.max(...barra.map((l) => l.max)) + 1),
    },
  }
}

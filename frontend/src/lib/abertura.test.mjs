import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DURACAO, DURACAO_REDUZIDA, TEMPOS, caminhoSuave, geometriaDoF, geometriaDoY, planejarEscrita, quadroDaAbertura } from './abertura.js'

test('começa sem nada à vista e termina com a tela aberta', () => {
  const zero = quadroDaAbertura(0)
  assert.equal(zero.nota, 0)
  assert.equal(zero.escrita, 0)
  assert.equal(zero.caneta, 0)
  assert.equal(zero.cena, 1)
  const fim = quadroDaAbertura(DURACAO)
  assert.equal(fim.cena, 0)
  assert.equal(fim.escrita, 1)
  assert.ok(fim.fim)
  assert.ok(!quadroDaAbertura(DURACAO - 1).fim)
})

test('a caneta está encostada no papel durante toda a escrita, e some antes de a tela abrir', () => {
  for (let t = TEMPOS.escrita[0]; t <= TEMPOS.escrita[1]; t += 50) {
    const q = quadroDaAbertura(t)
    assert.equal(q.caneta, 1, `t=${t}`)
    assert.equal(q.afastamento, 0, `t=${t}`)
  }
  assert.equal(quadroDaAbertura(TEMPOS.saida[0]).caneta, 0)
})

test('a escrita só anda para a frente', () => {
  let antes = -1
  for (let t = 0; t <= DURACAO; t += 10) {
    const { escrita } = quadroDaAbertura(t)
    assert.ok(escrita >= antes, `t=${t}`)
    antes = escrita
  }
})

test('movimento reduzido: o nome inteiro, sem caneta, e mais curto', () => {
  const meio = quadroDaAbertura(500, { reduzido: true })
  assert.equal(meio.escrita, 1)
  assert.equal(meio.caneta, 0)
  assert.equal(meio.nota, 1)
  assert.ok(quadroDaAbertura(DURACAO_REDUZIDA, { reduzido: true }).fim)
  assert.ok(DURACAO_REDUZIDA < DURACAO / 2)
})

/** Um traço reto de `de` até `ate`, com pontos a cada unidade, como o componente amostra. */
function reta(de, ate) {
  const n = Math.max(2, Math.round(Math.hypot(ate.x - de.x, ate.y - de.y)))
  return Array.from({ length: n + 1 }, (_, k) => ({ x: de.x + ((ate.x - de.x) * k) / n, y: de.y + ((ate.y - de.y) * k) / n }))
}
// O "fy" de cima para baixo: haste, barra, braço curto, braço longo.
const FY = [reta({ x: 10, y: -70 }, { x: 10, y: 0 }), reta({ x: 0, y: -45 }, { x: 25, y: -45 }), reta({ x: 35, y: -45 }, { x: 50, y: 0 }), reta({ x: 65, y: -45 }, { x: 40, y: 25 })]

test('a escrita revela os traços na ordem, um de cada vez, e termina com tudo escrito', () => {
  const { em } = planejarEscrita(FY)
  assert.deepEqual(em(0).revelados, [0, 0, 0, 0])
  assert.deepEqual(em(1).revelados, [1, 1, 1, 1])
  let antes = [0, 0, 0, 0]
  for (let p = 0; p <= 1; p += 0.005) {
    const { revelados } = em(p)
    revelados.forEach((r, i) => assert.ok(r >= antes[i] - 1e-9, `traço ${i} voltou atrás em p=${p}`))
    // Um traço só começa depois de o anterior terminar.
    revelados.forEach((r, i) => i > 0 && r > 0 && assert.equal(revelados[i - 1], 1))
    antes = revelados
  }
})

test('a caneta não salta: entre dois instantes vizinhos ela anda pouco, inclusive na troca de traço', () => {
  const { em } = planejarEscrita(FY)
  let anterior = em(0)
  for (let p = 0.002; p <= 1; p += 0.002) {
    const agora = em(p)
    assert.ok(Math.hypot(agora.x - anterior.x, agora.y - anterior.y) < 3, `salto em p=${p.toFixed(3)}`)
    anterior = agora
  }
})

test('a velocidade não zera entre traços (não para e recomeça), e no ar ela vai mais depressa', () => {
  const { em, segmentos } = planejarEscrita(FY)
  const total = segmentos.at(-1).tempos.at(-1)
  // Velocidade em volta do fim de cada traço: comparável à média, nunca perto de zero.
  for (const seg of segmentos.filter((s) => 'tinta' in s).slice(0, -1)) {
    const t = seg.tempos.at(-1) / total
    const [a, b] = [em(t - 0.004), em(t + 0.004)]
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) > 0.3, `quase parada no fim do traço ${seg.tinta}`)
  }
  const ritmo = (seg) => seg.comprimento / (seg.tempos.at(-1) - seg.tempos[0])
  const tintas = segmentos.filter((s) => 'tinta' in s)
  const ares = segmentos.filter((s) => 'ar' in s)
  const media = (lista) => lista.reduce((soma, seg) => soma + ritmo(seg), 0) / lista.length
  assert.ok(media(ares) > media(tintas))
})

test('o ar sai na direção em que o traço terminou e chega na direção do próximo', () => {
  const { segmentos } = planejarEscrita(FY)
  const ar = segmentos.find((s) => s.ar === 0) // do pé da haste ao começo da barra
  // A haste termina descendo: o primeiro passo no ar ainda desce.
  assert.ok(ar.pontos[1].y > ar.pontos[0].y)
  // A barra começa indo para a direita: o último passo no ar já vai para a direita.
  assert.ok(ar.pontos.at(-1).x > ar.pontos.at(-2).x)
})

test('traço longo é feito mais depressa que o curto', () => {
  const { segmentos } = planejarEscrita([reta({ x: 0, y: 0 }, { x: 0, y: 20 }), reta({ x: 10, y: 0 }, { x: 10, y: 80 })])
  const [curto, longo] = segmentos.filter((s) => 'tinta' in s)
  const duracao = (seg) => seg.tempos.at(-1) - seg.tempos[0]
  assert.ok(duracao(longo) < duracao(curto) * 4, 'quatro vezes o tamanho, menos que quatro vezes o tempo')
  assert.ok(duracao(longo) > duracao(curto))
})

test('caminhoSuave passa por todos os pontos', () => {
  const d = caminhoSuave([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])
  assert.match(d, /^M 0 0 C .* 10 5 C .* 20 0$/)
  assert.equal(caminhoSuave([{ x: 1, y: 1 }]), '')
})

/** Um "f" de pixels: haste nas colunas 10–15, barra nas linhas 25–28, gancho saindo do topo para a direita. */
function fDePixels() {
  const largura = 40
  const altura = 60
  const tinta = new Uint8Array(largura * altura)
  const pintar = (x0, x1, y0, y1) => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) tinta[y * largura + x] = 1
  }
  pintar(10, 15, 10, 49) // haste, até a linha de base (50)
  pintar(4, 26, 25, 28) // barra
  pintar(12, 30, 6, 10) // gancho no topo
  pintar(26, 30, 11, 13) // ponta do gancho, descendo um pouco
  return { tinta, largura, altura, origemX: 2, linhaDeBase: 50, escala: 2 }
}

test('geometriaDoF acha a haste, a barra e o gancho na letra desenhada', () => {
  const g = geometriaDoF(fDePixels())
  // Haste: colunas 10–15 → centro em 13 px, (13 - 2) / 2 = 5,5 unidades; 6 px de espessura = 3.
  assert.equal(g.haste.x, 5.5)
  assert.equal(g.haste.espessura, 3)
  // Barra: linhas 25–28 → centro em 27 px, (27 - 50) / 2 = -11,5; de 4 a 26 px → 1 a 12,5.
  assert.equal(g.barra.y, -11.5)
  assert.equal(g.barra.espessura, 2)
  assert.equal(g.barra.de, 1)
  assert.equal(g.barra.ate, 12.5)
  // Gancho: à direita da haste e acima da barra.
  assert.ok(g.gancho.x > g.haste.x + 4)
  assert.ok(g.gancho.y < g.barra.y)
  assert.ok(g.topo < g.gancho.y)
})

test('geometriaDoF devolve null quando não há letra ou não há barra', () => {
  const vazio = { tinta: new Uint8Array(100), largura: 10, altura: 10, origemX: 0, linhaDeBase: 9, escala: 1 }
  assert.equal(geometriaDoF(vazio), null)
  const l = fDePixels()
  const semBarra = { ...l, tinta: l.tinta.map((v, i) => (Math.floor(i / l.largura) >= 25 && Math.floor(i / l.largura) <= 28 && (i % l.largura < 10 || i % l.largura > 15) ? 0 : v)) }
  assert.equal(geometriaDoF(semBarra), null)
})

/** Um "y" de pixels: braço curto de (8,10) descendo até (20,40), braço longo de (32,10) até a cauda em (10,58). */
function yDePixels() {
  const largura = 44
  const altura = 64
  const tinta = new Uint8Array(largura * altura)
  const disco = (cx, cy) => {
    for (let y = cy - 2; y <= cy + 2; y += 1) for (let x = cx - 2; x <= cx + 2; x += 1) if (x >= 0 && y >= 0 && x < largura && y < altura) tinta[y * largura + x] = 1
  }
  for (let k = 0; k <= 60; k += 1) disco(Math.round(8 + (12 * k) / 60), Math.round(10 + (30 * k) / 60))
  for (let k = 0; k <= 60; k += 1) disco(Math.round(32 - (16 * k) / 60), Math.round(10 + (40 * k) / 60))
  for (let k = 0; k <= 20; k += 1) disco(Math.round(16 - (6 * k) / 20), Math.round(50 + (6 * k) / 20))
  return { tinta, largura, altura, origemX: 4, linhaDeBase: 44, escala: 2 }
}

test('geometriaDoY: o braço curto termina no encontro, o longo desce até a cauda, ambos de cima para baixo', () => {
  const g = geometriaDoY(yDePixels())
  assert.ok(g)
  const desce = (pts) => pts.every((p, i) => i === 0 || p.y >= pts[i - 1].y)
  assert.ok(desce(g.curto), 'o curto vai de cima para baixo')
  assert.ok(desce(g.longo), 'o longo vai de cima para baixo')
  // Começam no topo, um à esquerda do outro.
  assert.ok(g.curto[0].x < g.longo[0].x)
  // O curto acaba bem acima de onde o longo acaba (a cauda).
  assert.ok(g.curto.at(-1).y < g.longo.at(-1).y - 5)
  // A cauda termina à esquerda de onde o longo começou.
  assert.ok(g.longo.at(-1).x < g.longo[0].x - 5)
})

test('geometriaDoY: o braço curto para antes de encostar no longo', () => {
  const g = geometriaDoY(yDePixels())
  const fim = g.curto.at(-1)
  // Na altura em que o curto acaba, o longo ainda está à direita, a mais de uma espessura.
  const longoNaAltura = g.longo.find((p) => p.y >= fim.y)
  assert.ok(longoNaAltura.x - fim.x > g.espessura, `${longoNaAltura.x - fim.x} <= ${g.espessura}`)
})

test('geometriaDoY devolve null para uma letra sem dois braços', () => {
  const l = { tinta: new Uint8Array(40 * 40), largura: 40, altura: 40, origemX: 0, linhaDeBase: 30, escala: 1 }
  for (let y = 5; y < 35; y += 1) for (let x = 10; x < 15; x += 1) l.tinta[y * 40 + x] = 1
  assert.equal(geometriaDoY(l), null)
})

/**
 * O layout do Início: o salvo completado com os blocos de hoje, a
 * arrumação de partida e o encaixe ao alinhar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCOS, CAPA_PADRAO, VAO, alinhar, blocosParaSalvar, layoutDoInicio, posicionar, tituloDoRascunho } from './inicio.js'

test('sem nada salvo, todos os blocos na ordem padrão', () => {
  const layout = layoutDoInicio(null)
  assert.deepEqual(layout.blocos.map((b) => b.id), BLOCOS.map((b) => b.id))
  assert.ok(layout.blocos.every((b) => b.visivel))
  assert.deepEqual(layout.capa, CAPA_PADRAO)
})

test('a ordem salva vale, e bloco novo entra no fim e visível', () => {
  const layout = layoutDoInicio({
    blocos: [
      { id: 'agenda', visivel: false, largura: 'inteira' },
      { id: 'notas', visivel: true, largura: 'metade', altura: 333 },
    ],
  })
  // A `largura` de antes vira colunas (inteira é 12, metade é 6) para a arrumação de partida.
  assert.deepEqual(layout.blocos.slice(0, 2), [
    { id: 'agenda', visivel: false, colunas: 12, altura: 360 },
    { id: 'notas', visivel: true, colunas: 6, altura: 333 },
  ])
  assert.equal(layout.blocos.length, BLOCOS.length)
  assert.ok(layout.blocos.slice(2).every((b) => b.visivel))
})

test('bloco que não existe mais e repetido caem fora', () => {
  const layout = layoutDoInicio({ blocos: [{ id: 'clima' }, { id: 'notas' }, { id: 'notas' }] })
  assert.equal(layout.blocos.filter((b) => b.id === 'notas').length, 1)
  assert.ok(!layout.blocos.some((b) => b.id === 'clima'))
})

test('posição livre salva é presa à faixa', () => {
  const [notas] = layoutDoInicio({ blocos: [{ id: 'notas', x: 120, y: -5, w: 2, h: 99999 }] }).blocos
  assert.deepEqual([notas.x, notas.y, notas.w, notas.h], [85, 0, 15, 2000])
})

test('o Início de antes vira posição livre sem buraco nem sobreposição', () => {
  const blocos = posicionar(layoutDoInicio(null).blocos, 1000)
  const px = blocos.map((b) => ({ id: b.id, x: (b.x / 100) * 1000, y: b.y, w: (b.w / 100) * 1000, h: b.h }))
  // Resumo e itens ocupam a linha toda; tarefas e agenda dividem a de baixo.
  assert.deepEqual(px.slice(0, 2).map((b) => [Math.round(b.x), b.y, Math.round(b.w)]), [[0, 0, 1000], [0, 150 + VAO, 1000]])
  const [tarefas, agenda] = px.slice(2, 4)
  assert.equal(tarefas.y, agenda.y)
  assert.equal(Math.round(agenda.x - (tarefas.x + tarefas.w)), VAO)
  for (const a of px) {
    for (const b of px) {
      if (a === b) continue
      const cruza = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h && b.y < a.y + a.h
      assert.ok(!cruza, `${a.id} cruza ${b.id}`)
    }
  }
})

test('bloco que volta aparece embaixo de tudo', () => {
  const salvo = layoutDoInicio({ blocos: [{ id: 'notas', x: 10, y: 50, w: 40, h: 200 }] }).blocos
  const agenda = posicionar(salvo, 1000).find((b) => b.id === 'agenda')
  assert.ok(agenda.y >= 50 + 200 + VAO)
})

test('alinhar gruda bordas, centros e o vão entre blocos', () => {
  const outro = { x: 100, y: 100, w: 200, h: 100 }
  // Borda esquerda 4px ao lado da do outro: gruda nela.
  let { ret, guias } = alinhar({ x: 104, y: 400, w: 150, h: 80 }, [outro], 1000)
  assert.equal(ret.x, 100)
  assert.ok(guias.some((g) => g.eixo === 'x' && g.pos === 100))
  // Logo à direita do outro: fica a um VAO de distância.
  ;({ ret } = alinhar({ x: 300 + VAO + 3, y: 100, w: 150, h: 100 }, [outro], 1000))
  assert.equal(ret.x, 300 + VAO)
  assert.equal(ret.y, 100)
  // Centro da página.
  ;({ ret } = alinhar({ x: 427, y: 600, w: 150, h: 80 }, [], 1000))
  assert.equal(ret.x + ret.w / 2, 500)
  // Longe de tudo: não mexe.
  ;({ ret, guias } = alinhar({ x: 640, y: 700, w: 120, h: 80 }, [outro], 1000))
  assert.deepEqual([ret.x, ret.y, guias.length], [640, 700, 0])
  // Redimensionando, a borda direita gruda e a esquerda fica.
  ;({ ret } = alinhar({ x: 100, y: 300, w: 196, h: 80 }, [outro], 1000, { modo: 'tamanho' }))
  assert.deepEqual([ret.x, ret.w], [100, 200])
})

test('para salvar, vai a posição e a largura antiga junto', () => {
  assert.deepEqual(blocosParaSalvar([{ id: 'notas', visivel: true, colunas: 6, altura: 300, x: 10.123, y: 40.6, w: 49.999, h: 300.4 }]), [
    { id: 'notas', visivel: true, largura: 'metade', colunas: 6, x: 10.12, y: 41, w: 50, h: 300 },
  ])
  assert.equal(blocosParaSalvar([{ id: 'notas', visivel: true, colunas: 12, x: 0, y: 0, w: 100, h: 200 }])[0].largura, 'inteira')
})

test('título do rascunho é a primeira linha com texto', () => {
  assert.equal(tituloDoRascunho('\n  comprar pão  \nleite'), 'comprar pão')
  assert.equal(tituloDoRascunho(''), '')
  assert.equal(tituloDoRascunho('x'.repeat(100)).length, 80)
})

test('papel de parede e foto do relógio: nada até escolher, e a foto só aceita imagem', () => {
  const vazio = layoutDoInicio(null)
  assert.deepEqual([vazio.fundo, vazio.foto], [{ tipo: 'nenhuma' }, { tipo: 'nenhuma' }])
  const foto = { tipo: 'imagem', url: '/media/capas/1/a.png' }
  const salvo = layoutDoInicio({ fundo: { tipo: 'gradiente', id: 'lousa' }, foto })
  assert.deepEqual(salvo.fundo, { tipo: 'gradiente', id: 'lousa' })
  assert.deepEqual(salvo.foto, foto)
  assert.deepEqual(layoutDoInicio({ foto: { tipo: 'gradiente', id: 'lousa' } }).foto, { tipo: 'nenhuma' })
  assert.ok(vazio.blocos.some((b) => b.id === 'relogio' && b.visivel))
})

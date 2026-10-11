/**
 * O layout do Início: o salvo completado com os blocos de hoje, a
 * arrumação de partida e o encaixe ao alinhar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCOS, CAPA_PADRAO, VAO, alinhar, blocosParaSalvar, layoutDoInicio, posicionar, restaurado, tituloDoRascunho, alternarBlocos, recorteAoMover, recorteParaSalvar, recorteDa, prenderNaTela, RELOGIO_FLUTUANTE } from './inicio.js'

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
  // O resumo ocupa a linha toda; relógio e tarefas dividem a de baixo.
  assert.deepEqual([Math.round(px[0].x), px[0].y, Math.round(px[0].w)], [0, 0, 1000])
  const [relogio, tarefas] = px.slice(1, 3)
  assert.equal(relogio.y, 150 + VAO)
  assert.equal(tarefas.y, relogio.y)
  assert.equal(Math.round(tarefas.x - (relogio.x + relogio.w)), VAO)
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

test('papel de parede vazio até escolher; o relógio nasce na cor do app e guarda o que for escolhido', () => {
  const vazio = layoutDoInicio(null)
  assert.deepEqual([vazio.fundo, vazio.foto], [{ tipo: 'nenhuma' }, { tipo: 'gradiente', id: 'acento' }])
  const foto = { tipo: 'imagem', url: '/media/capas/1/a.png' }
  const salvo = layoutDoInicio({ fundo: { tipo: 'gradiente', id: 'lousa' }, foto })
  assert.deepEqual(salvo.fundo, { tipo: 'gradiente', id: 'lousa' })
  assert.deepEqual(salvo.foto, foto)
  // "Sem fundo" no relógio é escolha, e não ausência: não volta para a cor do app.
  assert.deepEqual(layoutDoInicio({ foto: { tipo: 'nenhuma' } }).foto, { tipo: 'nenhuma' })
  assert.deepEqual(layoutDoInicio({ foto: { tipo: 'gradiente', id: 'lousa' } }).foto, { tipo: 'gradiente', id: 'lousa' })
  assert.ok(vazio.blocos.some((b) => b.id === 'relogio' && b.visivel))
})

test('opacidade dos blocos: a do tema até escolher, e presa entre 0 e 100', () => {
  assert.equal(layoutDoInicio(null).opacidade, null)
  assert.equal(layoutDoInicio({ opacidade: 42.4 }).opacidade, 42)
  assert.equal(layoutDoInicio({ opacidade: 150 }).opacidade, 100)
  assert.equal(layoutDoInicio({ opacidade: '50' }).opacidade, null)
})

test('no padrão, o relógio vem logo depois do resumo', () => {
  assert.deepEqual(BLOCOS.slice(0, 3).map((b) => b.id), ['resumo', 'relogio', 'tarefas'])
})

test('títulos dos blocos: à mostra até a pessoa esconder', () => {
  assert.equal(layoutDoInicio(null).titulos, true)
  assert.equal(layoutDoInicio({ titulos: false }).titulos, false)
  assert.equal(layoutDoInicio({ titulos: 'nao' }).titulos, true)
})

test('restaurar só os blocos, só as imagens ou tudo', () => {
  const mexido = layoutDoInicio({
    capa: { tipo: 'gradiente', id: 'lousa' },
    fundo: { tipo: 'gradiente', id: 'kraft' },
    foto: { tipo: 'nenhuma' },
    opacidade: 30,
    titulos: false,
    aba_notas: 'favoritos',
    blocos: [{ id: 'notas', visivel: false, x: 10, y: 20, w: 40, h: 300 }],
  })
  const padrao = layoutDoInicio(null)

  const blocos = restaurado(mexido, 'blocos')
  assert.deepEqual([blocos.blocos, blocos.opacidade, blocos.titulos], [padrao.blocos, null, true])
  assert.deepEqual([blocos.capa, blocos.fundo, blocos.foto, blocos.aba_notas], [mexido.capa, mexido.fundo, mexido.foto, 'favoritos'])

  const imagens = restaurado(mexido, 'imagens')
  assert.deepEqual([imagens.capa, imagens.fundo, imagens.foto], [CAPA_PADRAO, { tipo: 'nenhuma' }, CAPA_PADRAO])
  assert.deepEqual([imagens.blocos, imagens.opacidade, imagens.titulos], [mexido.blocos, 30, false])

  assert.deepEqual(restaurado(mexido, 'tudo'), padrao)
})

test('esconder guarda a posição; mostrar devolve o bloco sem posição, para o app recolocá-lo embaixo', () => {
  const blocos = [
    { id: 'notas', visivel: true, colunas: 6, altura: 300, x: 10, y: 20, w: 40, h: 300 },
    { id: 'agenda', visivel: true, colunas: 6, altura: 300, x: 50, y: 20, w: 40, h: 300 },
  ]
  const escondido = alternarBlocos(blocos, ['notas'], false)
  assert.deepEqual(escondido[0], { ...blocos[0], visivel: false })
  assert.equal(escondido[1], blocos[1])
  const devolvido = alternarBlocos(escondido, ['notas'], true)[0]
  assert.equal(devolvido.visivel, true)
  assert.equal('x' in devolvido, false)
  // Mostrar quem já está à mostra não mexe na posição.
  assert.equal(alternarBlocos(blocos, ['agenda'], true)[1], blocos[1])
})

test('recorte: arrastar leva o ponto da foto junto com o cursor, até a borda', () => {
  // Foto 2000x1000 numa caixa 1000x250: coberta pela largura, sobra 250 px na altura.
  const imagem = { w: 2000, h: 1000 }
  const caixa = { w: 1000, h: 250 }
  const r = recorteDa(null)
  assert.deepEqual(r, { x: 50, y: 50, zoom: 1 })
  // Sem sobra na largura, x não se mexe; puxar 25 px para baixo sobe 10% (25 de 250).
  assert.deepEqual(recorteAoMover(r, 100, 25, imagem, caixa), { x: 50, y: 40, zoom: 1 })
  // Com zoom 2 sobra mais: 1000 px na largura e 750 na altura.
  assert.deepEqual(recorteAoMover({ ...r, zoom: 2 }, -100, 0, imagem, caixa), { x: 60, y: 50, zoom: 2 })
  // Não passa da borda da foto.
  assert.equal(recorteAoMover(r, 0, 10000, imagem, caixa).y, 0)
  assert.equal(recorteAoMover(r, 0, -10000, imagem, caixa).y, 100)
  // Imagem ainda sem medida: fica como está.
  assert.equal(recorteAoMover(r, 10, 10, { w: 0, h: 0 }, caixa), r)
  assert.deepEqual(recorteParaSalvar({ x: 12.345, y: 99.99, zoom: 4 }), { x: 12.3, y: 100, zoom: 3 })
})

test('relógio flutuante: nunca sai da janela, nem quando ela encolhe', () => {
  const tela = { w: 1280, h: 800 }
  assert.deepEqual(prenderNaTela({ x: 100, y: 100, w: 320, h: 200 }, tela), { x: 100, y: 100, w: 320, h: 200 })
  // Arrastado para fora, volta para a borda (com 8 px de margem).
  assert.deepEqual(prenderNaTela({ x: 5000, y: -50, w: 320, h: 200 }, tela), { x: 1280 - 320 - 8, y: 8, w: 320, h: 200 })
  // Tamanho dentro dos limites.
  const grande = prenderNaTela({ x: 0, y: 0, w: 5000, h: 10 }, tela)
  assert.deepEqual([grande.w, grande.h], [RELOGIO_FLUTUANTE.wMax, RELOGIO_FLUTUANTE.hMin])
  // Janela menor que o relógio: encolhe até o mínimo e fica no canto.
  assert.deepEqual(prenderNaTela({ x: 300, y: 300, w: 320, h: 200 }, { w: 230, h: 160 }), { x: 8, y: 8, w: 220, h: 150 })
})

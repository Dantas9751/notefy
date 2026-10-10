import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agrupar,
  alvoDoClique,
  aplicarRestricoes,
  atualizar,
  caixaAbsoluta,
  caminhoAte,
  cssDaCamada,
  desagrupar,
  deslocamentosDeAlinhamento,
  deslocamentosDeDistribuicao,
  duplicar,
  emoldurar,
  estiloDaCamada,
  fundoCss,
  inferirLayout,
  moverPara,
  nomeLivre,
  redimensionar,
  redimensionarFilhos,
  remover,
  reordenar,
} from './design.js'

const ret = (id, x, y, w = 10, h = 10, extra = {}) => ({ id, type: 'rect', x, y, w, h, ...extra })

function pagina() {
  return [
    {
      id: 'f', type: 'frame', name: 'Tela', x: 100, y: 100, w: 400, h: 800, children: [
        ret('a', 10, 10),
        { id: 'g', type: 'group', x: 50, y: 50, w: 30, h: 30, children: [ret('b', 0, 0), ret('c', 20, 20)] },
      ],
    },
    ret('solto', 1000, 0),
  ]
}

test('caixa absoluta soma as posições dos ancestrais', () => {
  assert.deepEqual(caixaAbsoluta(pagina(), 'c'), { x: 170, y: 170, w: 10, h: 10, rotation: 0 })
  assert.deepEqual(caminhoAte(pagina(), 'c').map((c) => c.id), ['f', 'g', 'c'])
})

test('atualizar copia só o caminho e devolve a mesma árvore sem mudança', () => {
  const antes = pagina()
  const depois = atualizar(antes, 'a', (c) => ({ ...c, x: 20 }))
  assert.equal(depois[1], antes[1])
  assert.equal(depois[0].children[1], antes[0].children[1])
  assert.equal(depois[0].children[0].x, 20)
  assert.equal(atualizar(antes, 'a', (c) => c), antes)
})

test('o grupo acompanha os filhos: a caixa é sempre a união deles', () => {
  const depois = atualizar(pagina(), 'b', (c) => ({ ...c, x: -10, y: -5 }))
  const grupo = depois[0].children[1]
  assert.deepEqual([grupo.x, grupo.y, grupo.w, grupo.h], [40, 45, 40, 35])
  // Na tela nada saiu do lugar.
  assert.deepEqual(caixaAbsoluta(depois, 'c'), { x: 170, y: 170, w: 10, h: 10, rotation: 0 })
  assert.deepEqual(caixaAbsoluta(depois, 'b'), { x: 140, y: 145, w: 10, h: 10, rotation: 0 })
})

test('remover leva junto o grupo que fica vazio', () => {
  const depois = remover(pagina(), ['b', 'c'])
  assert.deepEqual(depois[0].children.map((c) => c.id), ['a'])
})

test('mover para outro pai mantém a camada no mesmo lugar da tela', () => {
  const depois = moverPara(pagina(), ['solto'], 'f')
  assert.deepEqual(caixaAbsoluta(depois, 'solto'), { x: 1000, y: 0, w: 10, h: 10, rotation: 0 })
  assert.equal(depois[0].children.at(-1).x, 900)
  // Não entra dentro de si mesma.
  const p = pagina()
  assert.equal(moverPara(p, ['f'], 'g'), p)
})

test('agrupar envolve as camadas sem mexer nelas na tela, e desagrupar desfaz', () => {
  const { children, id } = agrupar(pagina(), ['a', 'g'])
  const grupo = children[0].children[0]
  assert.equal(grupo.id, id)
  assert.equal(grupo.type, 'group')
  assert.deepEqual([grupo.x, grupo.y, grupo.w, grupo.h], [10, 10, 70, 70])
  assert.deepEqual(caixaAbsoluta(children, 'c'), { x: 170, y: 170, w: 10, h: 10, rotation: 0 })

  const solto = desagrupar(children, [id])
  assert.deepEqual(solto.children[0].children.map((c) => c.id), ['a', 'g'])
  assert.deepEqual(caixaAbsoluta(solto.children, 'a'), { x: 110, y: 110, w: 10, h: 10, rotation: 0 })
})

test('emoldurar cria um frame sem fundo no lugar da seleção', () => {
  const { children, id } = emoldurar(pagina(), ['a'])
  const frame = children[0].children[0]
  assert.equal(frame.id, id)
  assert.equal(frame.type, 'frame')
  assert.deepEqual(frame.fills, [])
})

test('duplicar põe a cópia logo acima, com ids novos; frame do topo vai para o lado', () => {
  const { children, ids } = duplicar(pagina(), ['g', 'f'])
  const grupos = children[0].children.filter((c) => c.type === 'group')
  assert.equal(grupos.length, 2)
  assert.notEqual(grupos[1].children[0].id, 'b')
  assert.equal(ids.length, 2)
  assert.equal(children[1].x, 100 + 400 + 40)
})

test('reordenar sobe, desce e vai para o topo e o fundo', () => {
  const lista = [ret('1', 0, 0), ret('2', 0, 0), ret('3', 0, 0)]
  const ids = (l) => l.map((c) => c.id).join('')
  assert.equal(ids(reordenar(lista, ['1'], 'frente')), '213')
  assert.equal(ids(reordenar(lista, ['3'], 'tras')), '132')
  assert.equal(ids(reordenar(lista, ['1'], 'topo')), '231')
  assert.equal(ids(reordenar(lista, ['3'], 'fundo')), '312')
  assert.equal(reordenar(lista, ['3'], 'frente'), lista)
})

test('redimensionar ancora o lado oposto, inclusive girado', () => {
  const caixa = { x: 0, y: 0, w: 100, h: 50, rotation: 0 }
  assert.deepEqual(redimensionar(caixa, 'se', 10, 20), { x: 0, y: 0, w: 110, h: 70 })
  assert.deepEqual(redimensionar(caixa, 'nw', 10, 20), { x: 10, y: 20, w: 90, h: 30 })
  assert.deepEqual(redimensionar(caixa, 'e', 50, 0, { proporcional: true }), { x: 0, y: -12, w: 150, h: 75 })
  assert.deepEqual(redimensionar(caixa, 'e', 10, 0, { doCentro: true }), { x: -10, y: 0, w: 120, h: 50 })
  // Puxar além do lado oposto não inverte: fica com 1 px.
  assert.equal(redimensionar(caixa, 'e', -500, 0).w, 1)

  // Girada 90°: puxar a alça "e" para baixo na tela aumenta a largura.
  const girada = { x: 0, y: 0, w: 100, h: 50, rotation: 90 }
  const r = redimensionar(girada, 'e', 0, 20)
  assert.equal(r.w, 120)
  assert.equal(r.h, 50)
  // O lado "w" (que na tela está em cima) ficou no lugar: o centro desceu 10.
  assert.equal(r.y + r.h / 2, 25 + 10)
})

test('restrições: o filho acompanha o pai do jeito pedido', () => {
  const antes = { w: 400, h: 800 }
  const depois = { w: 500, h: 900 }
  const filho = ret('x', 10, 10, 100, 50)
  assert.equal(aplicarRestricoes(filho, antes, depois), filho)
  assert.equal(aplicarRestricoes({ ...filho, constraints: { h: 'right', v: 'bottom' } }, antes, depois).x, 110)
  assert.equal(aplicarRestricoes({ ...filho, constraints: { h: 'leftright' } }, antes, depois).w, 200)
  assert.equal(aplicarRestricoes({ ...filho, constraints: { h: 'center' } }, antes, depois).x, 60)
  const escala = aplicarRestricoes({ ...filho, constraints: { h: 'scale', v: 'scale' } }, antes, depois)
  assert.deepEqual([escala.x, escala.w], [12.5, 125])
})

test('frame com auto layout não aplica restrições; grupo escala os filhos', () => {
  const frame = { id: 'f', type: 'frame', x: 0, y: 0, w: 100, h: 100, layout: { mode: 'row' }, children: [ret('a', 0, 0)] }
  assert.equal(redimensionarFilhos({ ...frame, w: 200 }, frame).children, frame.children)
  const grupo = { id: 'g', type: 'group', x: 0, y: 0, w: 100, h: 100, children: [ret('a', 50, 50, 50, 50)] }
  const g = redimensionarFilhos({ ...grupo, w: 200 }, grupo)
  assert.deepEqual([g.children[0].x, g.children[0].w], [100, 100])
})

test('alinhar e distribuir', () => {
  const rects = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 50, y: 30, w: 20, h: 10 }]
  assert.deepEqual(deslocamentosDeAlinhamento(rects, 'direita'), [{ id: 'a', dx: 60, dy: 0 }, { id: 'b', dx: 0, dy: 0 }])
  // Uma camada só alinha com o pai.
  assert.deepEqual(deslocamentosDeAlinhamento([rects[0]], 'centroH', { x: 0, y: 0, w: 100, h: 100 }), [{ id: 'a', dx: 45, dy: 0 }])
  const tres = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 15, y: 0, w: 10, h: 10 }, { id: 'c', x: 90, y: 0, w: 10, h: 10 }]
  assert.deepEqual(deslocamentosDeDistribuicao(tres, 'x').map((d) => d.dx), [0, 30, 0])
})

test('clique segue a regra do Figma', () => {
  const p = pagina()
  const caminho = (id) => caminhoAte(p, id)
  // Filho de frame do topo: direto.
  assert.equal(alvoDoClique(caminho('a')), 'a')
  // Dentro de grupo: pega o grupo; com o grupo aberto (irmão selecionado), o filho.
  assert.equal(alvoDoClique(caminho('c')), 'g')
  assert.equal(alvoDoClique(caminho('c'), ['b']), 'c')
  // Com o frame do topo selecionado, clicar num filho seleciona o filho.
  assert.equal(alvoDoClique(caminho('a'), ['f']), 'a')
  // Ctrl+clique: o mais fundo.
  assert.equal(alvoDoClique(caminho('c'), [], { profundo: true }), 'c')
  // Fundo de frame com filhos não seleciona; frame vazio, sim.
  assert.equal(alvoDoClique(caminho('f')), null)
  assert.equal(alvoDoClique([{ id: 'v', type: 'frame', children: [] }]), 'v')
  // Travada não seleciona.
  assert.equal(alvoDoClique([{ ...p[1], locked: true }]), null)
})

test('nome livre conta a partir do maior número usado', () => {
  assert.equal(nomeLivre([{ id: '1', name: 'Frame 1' }, { id: '2', name: 'Frame 7', children: [] }], 'Frame'), 'Frame 8')
  assert.equal(nomeLivre([], 'Texto'), 'Texto 1')
})

test('CSS: preenchimentos, borda, sombra e auto layout', () => {
  assert.equal(fundoCss([{ type: 'solid', color: '#ff0000', opacity: 1 }]), '#FF0000')
  assert.equal(fundoCss([{ type: 'solid', color: '#ff0000', opacity: 0.5 }]), 'rgba(255, 0, 0, 0.5)')
  // O primeiro preenchimento fica por baixo: no CSS ele é a última camada.
  assert.match(fundoCss([{ type: 'solid', color: '#000' }, { type: 'image', src: '/m/a.png', fit: 'fit' }]), /^url\("\/m\/a.png"\) center \/ contain no-repeat, linear-gradient/)
  assert.equal(fundoCss([{ type: 'solid', color: '#000', visible: false }]), undefined)

  const frame = {
    id: 'f', type: 'frame', x: 10, y: 20, w: 300, h: 100, radius: 8, clip: true,
    strokes: [{ type: 'solid', color: '#000000' }], strokeWidth: 2,
    effects: [{ type: 'drop', x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 0.25 }],
    layout: { mode: 'column', gap: 8, padding: [16, 16, 16, 16], align: 'center', justify: 'between' },
    children: [],
  }
  const css = cssDaCamada(frame, { id: 'p', type: 'frame', w: 400, h: 400 })
  assert.match(css, /left: 10px;/)
  assert.match(css, /box-shadow: inset 0 0 0 2px #000000, 0px 4px 12px 0px rgba\(0, 0, 0, 0.25\);/)
  assert.match(css, /flex-direction: column;/)
  assert.match(css, /justify-content: space-between;/)
  assert.match(css, /padding: 16px 16px 16px 16px;/)
  assert.match(css, /overflow: hidden;/)

  // No fluxo do auto layout não há left/top, e "preencher" vira flex.
  const filho = estiloDaCamada({ ...ret('a', 5, 5), sizing: { h: 'fill' } }, { ...frame, layout: { mode: 'row' } })
  assert.equal(filho.position, 'relative')
  assert.equal(filho.left, undefined)
  assert.equal(filho.flex, '1 1 0')
  // Texto de largura automática não quebra linha.
  const texto = estiloDaCamada({ id: 't', type: 'text', x: 0, y: 0, w: 0, h: 0, text: 'oi', autoSize: 'width', font: { family: 'Segoe UI', size: 20 } }, null)
  assert.equal(texto.width, 'max-content')
  assert.equal(texto.whiteSpace, 'pre')
  assert.equal(texto.fontFamily, '"Segoe UI", system-ui, sans-serif')
})

test('Shift+A deduz direção, espaço e margem da arrumação atual', () => {
  const filhos = [ret('b', 16, 70, 100, 40), ret('a', 16, 16, 100, 40)]
  const { layout, ordem } = inferirLayout(filhos, { w: 132, h: 126 })
  assert.equal(layout.mode, 'column')
  assert.equal(layout.gap, 14)
  assert.deepEqual(layout.padding, [16, 16, 16, 16])
  assert.deepEqual(ordem, ['a', 'b'])
  assert.equal(inferirLayout([ret('a', 0, 0, 40, 40), ret('b', 60, 0, 40, 40)]).layout.mode, 'row')
})

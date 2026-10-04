/**
 * O layout do Início: o salvo completado com os blocos de hoje.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCOS, CAPA_PADRAO, layoutDoInicio, moverBlocoDoInicio, tituloDoRascunho } from './inicio.js'

test('sem nada salvo, todos os blocos na ordem padrão', () => {
  const layout = layoutDoInicio(null)
  assert.deepEqual(layout.blocos.map((b) => b.id), BLOCOS.map((b) => b.id))
  assert.ok(layout.blocos.every((b) => b.visivel))
  assert.deepEqual(layout.capa, CAPA_PADRAO)
  assert.equal(layout.itens, 'cartoes')
})

test('a ordem salva vale, e bloco novo entra no fim e visível', () => {
  const layout = layoutDoInicio({
    blocos: [
      { id: 'agenda', visivel: false, largura: 'inteira' },
      { id: 'notas', visivel: true, largura: 'metade' },
    ],
  })
  assert.deepEqual(layout.blocos.slice(0, 2), [
    { id: 'agenda', visivel: false, largura: 'inteira' },
    { id: 'notas', visivel: true, largura: 'metade' },
  ])
  assert.equal(layout.blocos.length, BLOCOS.length)
  assert.ok(layout.blocos.slice(2).every((b) => b.visivel))
})

test('bloco que não existe mais e repetido caem fora', () => {
  const layout = layoutDoInicio({ blocos: [{ id: 'clima' }, { id: 'notas' }, { id: 'notas' }] })
  assert.equal(layout.blocos.filter((b) => b.id === 'notas').length, 1)
  assert.ok(!layout.blocos.some((b) => b.id === 'clima'))
})

test('valores desconhecidos voltam ao padrão', () => {
  const layout = layoutDoInicio({ itens: 'carrossel', aba_notas: 'x', aba_arquivos: 'y' })
  assert.equal(layout.itens, 'cartoes')
  assert.equal(layout.aba_notas, 'recentes')
  assert.equal(layout.aba_arquivos, 'imagens')
})

test('mover sobe e desce, e para nas pontas', () => {
  const blocos = layoutDoInicio(null).blocos
  const subiu = moverBlocoDoInicio(blocos, 'notas', -1)
  assert.equal(subiu[0].id, 'notas')
  assert.equal(moverBlocoDoInicio(subiu, 'notas', -1), subiu)
  const ultimo = blocos[blocos.length - 1].id
  assert.equal(moverBlocoDoInicio(blocos, ultimo, 1), blocos)
})

test('título do rascunho é a primeira linha com texto', () => {
  assert.equal(tituloDoRascunho('\n  comprar pão  \nleite'), 'comprar pão')
  assert.equal(tituloDoRascunho(''), '')
  assert.equal(tituloDoRascunho('x'.repeat(100)).length, 80)
})

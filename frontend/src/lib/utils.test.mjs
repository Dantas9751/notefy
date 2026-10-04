import test from 'node:test'
import assert from 'node:assert/strict'

import { agruparPorData, grupoDaData, limparMarkdown } from '../lib/utils.js'

// Negrito
test('remove **negrito**', () => {
  assert.equal(limparMarkdown('é **importante** ler'), 'é importante ler')
})

test('remove __negrito__', () => {
  assert.equal(limparMarkdown('é __importante__ ler'), 'é importante ler')
})

// Itálico
test('remove *itálico*', () => {
  assert.equal(limparMarkdown('o *resultado* é'), 'o resultado é')
})

test('remove _itálico_', () => {
  assert.equal(limparMarkdown('o _resultado_ é'), 'o resultado é')
})

// Títulos
test('remove # título', () => {
  assert.equal(limparMarkdown('# Resumo\nTexto.'), 'Resumo\nTexto.')
})

test('remove ### subtítulo', () => {
  assert.equal(limparMarkdown('### Conceito\nDefinição.'), 'Conceito\nDefinição.')
})

// Código
test('remove `código` inline', () => {
  assert.equal(limparMarkdown('use `print()`'), 'use print()')
})

test('remove bloco de código', () => {
  const entrada = '```python\nprint("oi")\n```'
  assert.equal(limparMarkdown(entrada), 'print("oi")')
})

// Links e imagens
test('extrai texto do link', () => {
  assert.equal(limparMarkdown('[ver aqui](url)'), 'ver aqui')
})

test('remove imagem', () => {
  assert.equal(limparMarkdown('antes ![alt](url) depois'), 'antes  depois')
})

// Citação
test('remove > citação', () => {
  assert.equal(limparMarkdown('> importante'), 'importante')
})

// Tachado
test('remove ~~tachado~~', () => {
  assert.equal(limparMarkdown('~~errado~~ certo'), 'errado certo')
})

// Horizontal rule
test('remove ---', () => {
  const saida = limparMarkdown('antes\n---\ndepois')
  assert.ok(!saida.includes('---'), 'não deveria ter ---')
  assert.ok(saida.includes('antes'), 'deveria manter antes')
  assert.ok(saida.includes('depois'), 'deveria manter depois')
})

// Lista marcada
test('remove - da lista marcada', () => {
  const entrada = '- item 1\n- item 2'
  assert.equal(limparMarkdown(entrada), 'item 1\nitem 2')
})

// Caso real: resposta típica de IA
test('limpa resposta completa de IA', () => {
  const entrada = [
    '## Resumo — "pizza marguerita"',
    '',
    '**Conteúdo do material:** apenas uma saudação bilíngue.',
    '',
    '- **Autor:** Lucas',
    '- **Apresentação:** em português e espanhol',
    '',
    '### Observação',
    '',
    '> A nota não traz conteúdo sobre pizza em si.',
  ].join('\n')

  const saida = limparMarkdown(entrada)

  assert.ok(!saida.includes('##'), 'não deveria ter ##')
  assert.ok(!saida.includes('**'), 'não deveria ter **')
  assert.ok(!saida.includes('- '), 'não deveria ter - ')
  assert.ok(!saida.includes('> '), 'não deveria ter > ')
  assert.ok(!saida.includes('###'), 'não deveria ter ###')
  assert.ok(saida.includes('Resumo'), 'deveria manter o texto')
  assert.ok(saida.includes('Autor'), 'deveria manter o conteúdo')
})

// Texto sem markdown passa limpo
test('texto puro não é alterado', () => {
  const entrada = 'O resumo mantém os fatos principais do material.'
  assert.equal(limparMarkdown(entrada), entrada)
})

// Strings vazias
test('strings vazias retornam vazio', () => {
  assert.equal(limparMarkdown(''), '')
  assert.equal(limparMarkdown(null), null)
  assert.equal(limparMarkdown(undefined), undefined)
})

// Caracteres de outros alfabetos
test('remove caracteres chineses soltos', () => {
  assert.equal(limparMarkdown('pizza悬浮 é um meme'), 'pizza é um meme')
})

test('mantém caracteres latinos com acento', () => {
  assert.equal(limparMarkdown('café ñoño'), 'café ñoño')
})

test('remove caracteres arabes soltos', () => {
  assert.equal(limparMarkdown('texto عربي mais texto'), 'texto  mais texto')
})

/* ------------------------------------------------------------------ */
/* Raciocínio interno dos modelos "thinking"                          */
/* ------------------------------------------------------------------ */

test('remove bloco <think> fechado', () => {
  assert.equal(limparMarkdown('<think>vou pensar</think>Resposta.'), 'Resposta.')
})

test('remove <think></think> vazio, que era o caso visto no chat', () => {
  assert.equal(limparMarkdown('<think></think>A nota está vazia.'), 'A nota está vazia.')
})

test('remove bloco <think> multilinha', () => {
  const entrada = '<think>\nlinha 1\nlinha 2\n</think>\nTexto final.'
  assert.equal(limparMarkdown(entrada), 'Texto final.')
})

test('durante o streaming, a tag aberta esconde o rascunho', () => {
  // Chega "<think>rascunho..." antes do fechamento: mostrar o raciocínio
  // pela metade é pior do que mostrar nada.
  assert.equal(limparMarkdown('<think>ainda pensando'), '')
})

test('texto sem think passa intacto', () => {
  assert.equal(limparMarkdown('Resposta direta.'), 'Resposta direta.')
})

// Grupos por data (Recentes). "Agora" fixo: terça, 20 de outubro de 2026.
const AGORA = new Date(2026, 9, 20, 15, 0)

test('grupos por data, do mais novo ao mais velho', () => {
  const casos = [
    [new Date(2026, 9, 20, 22, 0), 'Hoje'], // relógio adiantado também é hoje
    [new Date(2026, 9, 20, 0, 5), 'Hoje'],
    [new Date(2026, 9, 19, 23, 59), 'Ontem'],
    [new Date(2026, 9, 18, 10, 0), 'Esta semana'], // domingo: a semana começa nele
    [new Date(2026, 9, 17, 23, 0), 'Semana passada'],
    [new Date(2026, 9, 11, 0, 0), 'Semana passada'],
    [new Date(2026, 9, 5, 12, 0), 'Este mês'],
    [new Date(2026, 8, 30, 12, 0), 'Setembro'],
    [new Date(2025, 6, 2, 12, 0), 'Julho de 2025'],
  ]
  for (const [data, grupo] of casos) assert.equal(grupoDaData(data.toISOString(), AGORA), grupo, data.toString())
})

test('semana passada que começou no mês anterior fica inteira em "Semana passada"', () => {
  const domingo = new Date(2026, 9, 4, 9, 0) // 4/10: a semana passada foi de 27/9 a 3/10
  assert.equal(grupoDaData(new Date(2026, 8, 28), domingo), 'Semana passada')
  assert.equal(grupoDaData(new Date(2026, 9, 1), domingo), 'Semana passada')
  assert.equal(grupoDaData(new Date(2026, 8, 26), domingo), 'Setembro')
})

test('agrupa itens seguidos com o mesmo grupo', () => {
  const itens = [
    { id: 1, updated_at: new Date(2026, 9, 20, 9) },
    { id: 2, updated_at: new Date(2026, 9, 20, 8) },
    { id: 3, updated_at: new Date(2026, 9, 19, 8) },
    { id: 4, updated_at: new Date(2026, 7, 1) },
  ]
  assert.deepEqual(
    agruparPorData(itens, 'updated_at', AGORA).map((g) => [g.rotulo, g.itens.map((i) => i.id)]),
    [['Hoje', [1, 2]], ['Ontem', [3]], ['Agosto', [4]]],
  )
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { detectarAcao, rotuloAcao } from './acoes.js'

/* ------------------------------------------------------------------ */
/* Canvas                                                             */
/* ------------------------------------------------------------------ */

test('detecta "criar mapa mental sobre ecosistema"', () => {
  const r = detectarAcao('criar mapa mental sobre ecosistema', 'canvas')
  assert.ok(r)
  assert.equal(r.task, 'canvas.gerar')
  assert.match(r.input, /ecosistema/)
})

test('detecta "crie um mapa mental sobre pizza" (imperativo)', () => {
  const r = detectarAcao('crie um mapa mental sobre pizza', 'canvas')
  assert.ok(r)
  assert.equal(r.task, 'canvas.gerar')
})

test('SEM ACENTO: "faca um mapa mental sobre paes"', () => {
  // O caso real do usuário: digitou sem cedilha e o chat só conversava.
  const r = detectarAcao('faca um mapa mental sobre paes agora no mesmo estilo', 'canvas')
  assert.ok(r)
  assert.equal(r.task, 'canvas.gerar')
  assert.match(r.input, /paes/)
})

test('detecta "monte um quadro sobre estudo"', () => {
  const r = detectarAcao('monte um quadro sobre estudo', 'canvas')
  assert.ok(r)
  assert.equal(r.task, 'canvas.gerar')
})

test('detecta "faça cartões sobre vocabulario"', () => {
  const r = detectarAcao('faça cartões sobre vocabulario', 'canvas')
  assert.ok(r)
  assert.equal(r.task, 'canvas.gerar')
})

test('detecta "regenerar o canvas" como replace', () => {
  const r = detectarAcao('regenerar o canvas', 'canvas')
  assert.ok(r)
  assert.equal(r.apply, 'replace')
})

test('ignora conversa comum no canvas', () => {
  assert.equal(detectarAcao('me explica isso', 'canvas'), null)
  assert.equal(detectarAcao('limpar o canvas', 'canvas'), null)
})

/* ------------------------------------------------------------------ */
/* Diagrama                                                           */
/* ------------------------------------------------------------------ */

test('detecta "criar DER de blog"', () => {
  const r = detectarAcao('criar DER de blog', 'diagram')
  assert.ok(r)
  assert.equal(r.task, 'diagrama.gerar')
})

test('detecta "crie um der basico escolha o tema" (sem acento, sem separador)', () => {
  const r = detectarAcao('crie um der basico escolha o tema', 'diagram')
  assert.ok(r)
  assert.equal(r.task, 'diagrama.gerar')
  assert.match(r.input, /basico/)
})

test('detecta "desenhe um fluxograma de cadastro"', () => {
  const r = detectarAcao('desenhe um fluxograma de cadastro', 'diagram')
  assert.ok(r)
  assert.equal(r.task, 'diagrama.gerar')
})

test('detecta "insira fluxograma de login" (verbo novo)', () => {
  const r = detectarAcao('insira fluxograma de login', 'diagram')
  assert.ok(r)
  assert.equal(r.task, 'diagrama.gerar')
})

test('"regenerar o DER" dispara replace (regex antes era case-sensitive)', () => {
  const r = detectarAcao('regenerar o DER', 'diagram')
  assert.ok(r)
  assert.equal(r.apply, 'replace')
})

test('ignora pergunta sobre conceito', () => {
  assert.equal(detectarAcao('o que é um fluxograma?', 'diagram'), null)
})

/* ------------------------------------------------------------------ */
/* Planilha                                                           */
/* ------------------------------------------------------------------ */

test('detecta "coloque a tabuada de 10 na planilha" (o caso do log)', () => {
  const r = detectarAcao('coloque a tabuada de 10 na planilha', 'spreadsheet')
  assert.ok(r)
  assert.equal(r.task, 'planilha.preencher')
  assert.match(r.input, /tabuada de 10/)
})

test('detecta "poe o resumo na planilha"', () => {
  const r = detectarAcao('poe o resumo na planilha', 'spreadsheet')
  assert.ok(r)
  assert.equal(r.task, 'planilha.preencher')
})

test('detecta "preencha a planilha com notas de provas"', () => {
  const r = detectarAcao('preencha a planilha com notas de provas', 'spreadsheet')
  assert.ok(r)
  assert.match(r.input, /notas de provas/)
})

test('detecta "preencher a planilha" sem complemento', () => {
  const r = detectarAcao('preencher a planilha', 'spreadsheet')
  assert.ok(r)
  assert.equal(r.task, 'planilha.preencher')
})

test('ignora "abrir a planilha"', () => {
  assert.equal(detectarAcao('abrir a planilha', 'spreadsheet'), null)
})

/* ------------------------------------------------------------------ */
/* NOTA: ações dentro da nota aberta                                  */
/* ------------------------------------------------------------------ */

test('"escreve sobre fotossintese" escreve na nota aberta', () => {
  const r = detectarAcao('escreve sobre fotossintese', 'note')
  assert.ok(r)
  assert.equal(r.task, 'nota.texto')
  assert.equal(r.input, 'fotossintese')
})

test('"crie um texto sobre napole" escreve na nota aberta', () => {
  const r = detectarAcao('crie um texto sobre napole', 'note')
  assert.ok(r)
  assert.equal(r.task, 'nota.texto')
  assert.equal(r.input, 'napole')
})

test('topico em "sobre X" vence mesmo com frase longa (caso do log)', () => {
  const r = detectarAcao('crie um texto na nota que estamos sobre napoles', 'note')
  assert.ok(r)
  assert.equal(r.task, 'nota.texto')
  assert.equal(r.input, 'napoles')
})

test('"adicione resumo da aula na nota" captura o assunto inteiro', () => {
  const r = detectarAcao('adicione resumo da aula na nota', 'note')
  assert.ok(r)
  assert.equal(r.task, 'nota.texto')
  assert.equal(r.input, 'resumo da aula')
})

test('"continua essa nota" aciona continuar', () => {
  const r = detectarAcao('continua essa nota', 'note')
  assert.ok(r)
  assert.equal(r.task, 'nota.continuar')
})

test('"corrige o texto" aciona corrigir', () => {
  const r = detectarAcao('corrige o texto', 'note')
  assert.ok(r)
  assert.equal(r.task, 'nota.corrigir')
})

test('"crie uma NOTA sobre egito" cria item novo, não escreve nesta', () => {
  const r = detectarAcao('crie uma nota sobre egito', 'note')
  assert.ok(r)
  assert.equal(r.task, 'criar.nota')
})

/* ------------------------------------------------------------------ */
/* Fora de contexto                                                   */
/* ------------------------------------------------------------------ */

test('fora de um item não reconhece ações de documento', () => {
  assert.equal(detectarAcao('criar mapa mental sobre x', null), null)
  assert.equal(detectarAcao('crie um der de blog', 'canvas'), null)
})

test('pergunta normal passa direto', () => {
  assert.equal(detectarAcao('o que é um fluxograma?', 'diagram'), null)
  assert.equal(detectarAcao('me explica isso', 'canvas'), null)
})

/* ------------------------------------------------------------------ */
/* Rotulos                                                             */
/* ------------------------------------------------------------------ */

test('rotulos sao amigaveis e cobrem as novas tarefas', () => {
  assert.equal(rotuloAcao('canvas.gerar'), 'Quadro criado')
  assert.equal(rotuloAcao('diagrama.gerar'), 'Diagrama criado')
  assert.equal(rotuloAcao('planilha.preencher'), 'Planilha atualizada')
  assert.equal(rotuloAcao('nota.texto'), 'Texto adicionado à nota')
  assert.equal(rotuloAcao('nota.continuar'), 'Continuação adicionada')
})

/* ------------------------------------------------------------------ */
/* Frases reais do log: ordem invertida e erro de digitação           */
/* ------------------------------------------------------------------ */

test('LOG: "coloca no texto um resumo de primeira guerra mundial"', () => {
  // A família `coloc` faltava no dicionário: só existia `coloqu`, então
  // este pedido virava conversa e nada era gravado na nota.
  const r = detectarAcao('coloca no texto um resumo de primeira guerra mundial', 'note')
  assert.ok(r)
  assert.equal(r.task, 'nota.texto')
  assert.match(r.input, /primeira guerra mundial/)
})

test('LOG: "faça na nota um resumo da primeira guerra" (alvo antes do objeto)', () => {
  const r = detectarAcao('faça na nota um resumo da primeira guerra mundial', 'note')
  assert.ok(r)
  assert.equal(r.task, 'nota.texto')
  assert.match(r.input, /primeira guerra/)
})

test('TYPO: "colouqe a tabuada de 10 na planilha"', () => {
  const r = detectarAcao('colouqe a tabuada de 10 na planilha', 'spreadsheet')
  assert.ok(r)
  assert.equal(r.task, 'planilha.preencher')
  assert.match(r.input, /tabuada de 10/)
})

test('TYPO: "geraer um mapa mental sobre pizza"', () => {
  const r = detectarAcao('geraer um mapa mental sobre pizza', 'canvas')
  assert.ok(r)
  assert.equal(r.task, 'canvas.gerar')
  assert.match(r.input, /pizza/)
})

test('"continua sobre X" leva o assunto junto', () => {
  // Sem o assunto, continuar uma nota vazia devolvia recusa em vez de texto.
  const r = detectarAcao('continua sobre a segunda guerra', 'note')
  assert.deepEqual(r, { task: 'nota.continuar', input: 'a segunda guerra' })
})

test('o corretor NÃO estraga o tópico do pedido', () => {
  // "resumo" está a uma letra de "resuma": sem proteção, o assunto
  // chegaria corrompido na IA.
  const r = detectarAcao('escreve na nota um resumo sobre bolo de cenoura', 'note')
  assert.ok(r)
  assert.match(r.input, /bolo de cenoura/)
})

test('pergunta comum continua sendo conversa, não ação', () => {
  assert.equal(detectarAcao('compare isso com a nota anterior', 'note'), null)
  assert.equal(detectarAcao('o que é um DER?', 'diagram'), null)
})

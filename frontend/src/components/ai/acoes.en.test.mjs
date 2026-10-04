import test from 'node:test'
import assert from 'node:assert/strict'

import { detectarAcaoEn as detectar } from './acoes.en.js'

/* Canvas */

test('"create a mind map about the ecosystem" gera no canvas', () => {
  const r = detectar('create a mind map about the ecosystem', 'canvas')
  assert.equal(r.task, 'canvas.gerar')
  assert.match(r.input, /the ecosystem/)
})

test('"make me a mind map about pizza" (com o "me")', () => {
  const r = detectar('make me a mind map about pizza', 'canvas')
  assert.equal(r.task, 'canvas.gerar')
  assert.match(r.input, /pizza/)
})

test('"build a whiteboard about studying"', () => {
  assert.equal(detectar('build a whiteboard about studying', 'canvas').task, 'canvas.gerar')
})

test('"make sticky notes about vocabulary"', () => {
  const r = detectar('make sticky notes about vocabulary', 'canvas')
  assert.equal(r.task, 'canvas.gerar')
  assert.match(r.input, /vocabulary/)
})

test('"regenerate the canvas" refaz do zero', () => {
  assert.equal(detectar('regenerate the canvas', 'canvas').apply, 'replace')
})

test('conversa comum no canvas não vira ação', () => {
  assert.equal(detectar('explain this to me', 'canvas'), null)
  assert.equal(detectar('clear the canvas', 'canvas'), null)
})

/* Diagrama */

test('"create an ER diagram of a blog"', () => {
  const r = detectar('create an ER diagram of a blog', 'diagram')
  assert.equal(r.task, 'diagrama.gerar')
  assert.match(r.input, /blog/)
})

test('"draw a flowchart of the signup"', () => {
  const r = detectar('draw a flowchart of the signup', 'diagram')
  assert.equal(r.task, 'diagrama.gerar')
  assert.match(r.input, /Flowchart/)
})

test('"generate a class diagram for a shop"', () => {
  const r = detectar('generate a class diagram for a shop', 'diagram')
  assert.equal(r.task, 'diagrama.gerar')
  assert.match(r.input, /UML/)
})

test('"regenerate the ERD" refaz do zero', () => {
  assert.equal(detectar('regenerate the ERD', 'diagram').apply, 'replace')
})

test('pergunta sobre conceito não vira ação', () => {
  assert.equal(detectar('what is a foreign key', 'diagram'), null)
})

/* Planilha */

test('"put the times table of 10 in the spreadsheet"', () => {
  const r = detectar('put the times table of 10 in the spreadsheet', 'spreadsheet')
  assert.equal(r.task, 'planilha.preencher')
  assert.match(r.input, /times table of 10/)
})

test('"fill the spreadsheet with exam grades"', () => {
  const r = detectar('fill the spreadsheet with exam grades', 'spreadsheet')
  assert.equal(r.task, 'planilha.preencher')
  assert.match(r.input, /exam grades/)
})

test('"fill the spreadsheet" sem complemento', () => {
  const r = detectar('fill the spreadsheet', 'spreadsheet')
  assert.equal(r.task, 'planilha.preencher')
  assert.equal(r.input, undefined)
})

test('"open the spreadsheet" não é ação', () => {
  assert.equal(detectar('open the spreadsheet', 'spreadsheet'), null)
})

/* Nota */

test('"write about photosynthesis" escreve na nota aberta', () => {
  const r = detectar('write about photosynthesis', 'note')
  assert.equal(r.task, 'nota.texto')
  assert.equal(r.input, 'photosynthesis')
})

test('"add a summary of the lesson to the note" captura o assunto todo', () => {
  const r = detectar('add a summary of the lesson to the note', 'note')
  assert.equal(r.task, 'nota.texto')
  assert.match(r.input, /summary of the lesson/)
})

test('"write in the note a summary of world war one"', () => {
  const r = detectar('write in the note a summary of world war one', 'note')
  assert.equal(r.task, 'nota.texto')
  assert.equal(r.input, 'world war one')
})

test('"continue about Egypt" leva o assunto junto', () => {
  const r = detectar('continue about egypt', 'note')
  assert.equal(r.task, 'nota.continuar')
  assert.equal(r.input, 'egypt')
})

test('"summarize" e "fix" agem sobre a nota', () => {
  assert.equal(detectar('summarize', 'note').task, 'nota.resumir')
  assert.equal(detectar('fix the text', 'note').task, 'nota.corrigir')
})

test('"create a note about Egypt" cria um item novo, não escreve nesta', () => {
  const r = detectar('create a note about egypt', 'note')
  assert.equal(r.task, 'criar.nota')
  assert.match(r.input, /egypt/)
})

test('"create a new spreadsheet with grades" cria uma planilha', () => {
  const r = detectar('create a new spreadsheet with grades', 'note')
  assert.equal(r.task, 'criar.planilha')
  assert.match(r.input, /grades/)
})

test('pergunta normal passa direto', () => {
  assert.equal(detectar('what does this note say?', 'note'), null)
  assert.equal(detectar('how do I study better', 'note'), null)
})

test('nada é ação quando não há item do tipo certo', () => {
  assert.equal(detectar('create a mind map about pizza', 'diagram')?.task, undefined)
})

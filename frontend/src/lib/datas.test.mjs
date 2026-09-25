import test from 'node:test'
import assert from 'node:assert/strict'

import { ANO_MAX, ANO_MIN, erroDeData, erroDoPeriodo } from './datas.js'

test('data vazia não é erro: o campo é opcional', () => {
  assert.equal(erroDeData(''), null)
  assert.equal(erroDeData(null), null)
})

test('data normal passa', () => {
  assert.equal(erroDeData('2026-08-22T14:30'), null)
})

test('dia que não existe no mês é recusado', () => {
  // O seletor nativo deixa digitar 31/02: o Date vira Invalid Date e o
  // toISOString() lançava o erro que virava "não foi possível salvar".
  const erro = erroDeData('2026-02-31T10:00')
  assert.ok(erro)
  assert.match(erro, /não existe no calendário|não é válida/)
})

test('ano 0000 é recusado com mensagem que diz a faixa', () => {
  const erro = erroDeData('0000-01-01T00:00')
  assert.ok(erro)
  assert.match(erro, new RegExp(String(ANO_MIN)))
  assert.match(erro, new RegExp(String(ANO_MAX)))
})

test('ano longe demais no futuro é recusado', () => {
  assert.ok(erroDeData('9999-12-31T23:59'))
})

test('as bordas da faixa são aceitas', () => {
  assert.equal(erroDeData(`${ANO_MIN}-01-01T00:00`), null)
  assert.equal(erroDeData(`${ANO_MAX}-12-31T23:59`), null)
})

test('o rótulo diz QUAL campo falhou', () => {
  assert.match(erroDeData('0000-01-01T00:00', 'A data de fim'), /A data de fim/)
})

test('período válido passa', () => {
  assert.equal(erroDoPeriodo('2026-08-22T10:00', '2026-08-22T12:00'), null)
})

test('fim antes do início é recusado', () => {
  assert.match(
    erroDoPeriodo('2026-08-22T12:00', '2026-08-22T10:00'),
    /fim não pode ser antes/,
  )
})

test('o erro do início vem antes do erro do fim', () => {
  // A mensagem segue a ordem de leitura do formulário.
  assert.match(erroDoPeriodo('0000-01-01T00:00', '2026-02-31T10:00'), /início/)
})

test('só o início preenchido é um período válido', () => {
  assert.equal(erroDoPeriodo('2026-08-22T10:00', ''), null)
})


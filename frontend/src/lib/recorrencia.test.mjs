import test from 'node:test'
import assert from 'node:assert/strict'

import { OPCOES, descrever } from './recorrencia.js'

test('toda opção da lista tem descrição — o select e o cartão não divergem', () => {
  // Se uma opção nova entrar sem rótulo, o cartão mostraria a RRULE crua.
  for (const opcao of OPCOES.filter((o) => o.valor)) {
    assert.equal(descrever(opcao.valor), opcao.rotulo, opcao.valor)
  }
})

test('sem recorrência, sem texto', () => {
  assert.equal(descrever(''), '')
  assert.equal(descrever(null), '')
  assert.equal(descrever(undefined), '')
})

test('regra fora da lista ainda é descrita pelo FREQ', () => {
  // Vinda de um backup ou escrita à mão: melhor "A cada 3 dias" do que
  // despejar a RRULE no cartão.
  assert.equal(descrever('FREQ=DAILY;INTERVAL=3'), 'A cada 3 dias')
  assert.equal(descrever('FREQ=MONTHLY;INTERVAL=6'), 'A cada 6 meses')
})

test('regra ilegível volta como veio, e não em branco', () => {
  assert.equal(descrever('FREQ=HOURLY'), 'FREQ=HOURLY')
})

test('os valores do select são as RRULE que o backend grava', () => {
  // É isto que faz uma tarefa já existente reencontrar a própria opção
  // ao abrir o formulário. Um apelido ("semanal") deixaria o campo vazio.
  const valores = OPCOES.map((o) => o.valor)
  assert.ok(valores.includes('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'))
  assert.ok(valores.includes('FREQ=WEEKLY;INTERVAL=2'))
  assert.equal(valores[0], '')
})

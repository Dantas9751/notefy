/**
 * O toque longo vira o `contextmenu`, e todo o resto do dedo não vira.
 *
 * Os menus do celular inteiro dependem disto: renomear, mover, excluir,
 * exportar. O relógio é o do teste, então os 550 ms passam na hora.
 */
import { afterEach, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { ligarToqueLongo } from './toqueLongo.js'

class MouseEventFalso extends Event {
  constructor(tipo, opcoes = {}) {
    super(tipo, opcoes)
    this.clientX = opcoes.clientX
    this.clientY = opcoes.clientY
  }
}

let janela
let desligar
let menus

const ponteiro = (tipo, props = {}) =>
  Object.assign(new Event(tipo, { cancelable: true }), { pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 200, ...props })

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] })
  janela = new EventTarget()
  janela.MouseEvent = MouseEventFalso
  menus = []
  janela.addEventListener('contextmenu', (e) => menus.push([e.clientX, e.clientY]))
  desligar = ligarToqueLongo(janela)
})

afterEach(() => {
  desligar()
  mock.timers.reset()
})

test('dedo parado por 550 ms abre o menu onde ele está', () => {
  janela.dispatchEvent(ponteiro('pointerdown'))
  mock.timers.tick(549)
  assert.deepEqual(menus, [])
  mock.timers.tick(1)
  assert.deepEqual(menus, [[100, 200]])
})

test('soltar antes é um toque comum, sem menu', () => {
  janela.dispatchEvent(ponteiro('pointerdown'))
  mock.timers.tick(300)
  janela.dispatchEvent(ponteiro('pointerup'))
  mock.timers.tick(1000)
  assert.deepEqual(menus, [])
})

test('dedo que anda é rolagem, sem menu', () => {
  janela.dispatchEvent(ponteiro('pointerdown'))
  janela.dispatchEvent(ponteiro('pointermove', { clientX: 100, clientY: 215 }))
  mock.timers.tick(1000)
  assert.deepEqual(menus, [])
})

test('tremor pequeno do dedo não cancela', () => {
  janela.dispatchEvent(ponteiro('pointerdown'))
  janela.dispatchEvent(ponteiro('pointermove', { clientX: 104, clientY: 205 }))
  mock.timers.tick(600)
  assert.equal(menus.length, 1)
})

test('mouse e segundo dedo não abrem menu por tempo', () => {
  janela.dispatchEvent(ponteiro('pointerdown', { pointerType: 'mouse' }))
  mock.timers.tick(1000)
  janela.dispatchEvent(ponteiro('pointerdown', { isPrimary: false }))
  mock.timers.tick(1000)
  assert.deepEqual(menus, [])
})

test('depois do menu, soltar o dedo não vira clique', () => {
  janela.dispatchEvent(ponteiro('pointerdown'))
  mock.timers.tick(600)
  janela.dispatchEvent(ponteiro('pointerup'))
  const fim = new Event('touchend', { cancelable: true })
  janela.dispatchEvent(fim)
  assert.equal(fim.defaultPrevented, true)
})

test('toque comum não cancela o touchend (o clique precisa sair)', () => {
  janela.dispatchEvent(ponteiro('pointerdown'))
  janela.dispatchEvent(ponteiro('pointerup'))
  const fim = new Event('touchend', { cancelable: true })
  janela.dispatchEvent(fim)
  assert.equal(fim.defaultPrevented, false)
})

test('desligar remove tudo', () => {
  desligar()
  janela.dispatchEvent(ponteiro('pointerdown'))
  mock.timers.tick(1000)
  assert.deepEqual(menus, [])
  desligar = () => {}
})

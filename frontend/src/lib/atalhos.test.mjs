/**
 * Os atalhos: do evento do teclado ao id da ação, com as teclas trocáveis.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  GRUPOS,
  bindsDe,
  casa,
  comboDoEvento,
  conflitoCom,
  itensDoGrupo,
  numeroDaSerie,
  salvarBinds,
  teclasDoCombo,
  validar,
} from './atalhos.js'

const ev = (extra) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra })
const tecla = (letra, extra = {}) => ev({ key: letra, code: `Key${letra.toUpperCase()}`, ...extra })

beforeEach(() => salvarBinds({}))

test('o evento vira o texto guardado: modificadores em ordem e a tecla', () => {
  assert.equal(comboDoEvento(tecla('k', { ctrlKey: true })), 'Ctrl+K')
  assert.equal(comboDoEvento(tecla('k', { metaKey: true })), 'Ctrl+K', 'Cmd e Ctrl são o mesmo atalho')
  assert.equal(comboDoEvento(tecla('F', { ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+F')
  assert.equal(comboDoEvento(tecla('r', { altKey: true })), 'Alt+R')
  assert.equal(comboDoEvento(ev({ key: 'F2', code: 'F2' })), 'F2')
  assert.equal(comboDoEvento(ev({ key: '.', code: 'Period', ctrlKey: true })), 'Ctrl+.')
  assert.equal(comboDoEvento(ev({ key: ' ', code: 'Space' })), 'Space')
  assert.equal(comboDoEvento(ev({ key: '+', code: 'Equal', shiftKey: true })), 'Shift+Plus')
})

test('só um modificador apertado não é atalho', () => {
  assert.equal(comboDoEvento(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true })), null)
  assert.equal(comboDoEvento(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true })), null)
})

test('dígito e colchete vêm da tecla física: com Shift o key do 9 é "("', () => {
  assert.equal(comboDoEvento(ev({ key: '(', code: 'Digit9', ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+9')
  assert.equal(comboDoEvento(ev({ key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+]')
})

test('Alt no Mac troca a letra: vale a tecla física', () => {
  assert.equal(comboDoEvento(ev({ key: '®', code: 'KeyR', altKey: true })), 'Alt+R')
})

test('AltGr + número escreve caractere e não é atalho', () => {
  const altGr = { code: 'Digit2', key: '²', ctrlKey: true, altKey: true, getModifierState: (m) => m === 'AltGraph' }
  assert.equal(comboDoEvento(ev(altGr)), null)
  assert.equal(comboDoEvento(ev({ ...altGr, getModifierState: () => false })), 'Ctrl+Alt+2')
})

test('casa usa as teclas de fábrica, inclusive as várias de um atalho', () => {
  assert.ok(casa(tecla('k', { ctrlKey: true }), 'buscar'))
  assert.ok(!casa(tecla('k'), 'buscar'), 'K sozinho não busca')
  assert.ok(!casa(tecla('k', { ctrlKey: true, shiftKey: true }), 'buscar'), 'modificador a mais é outro atalho')
  assert.ok(casa(tecla('y', { ctrlKey: true }), 'refazer'))
  assert.ok(casa(tecla('z', { ctrlKey: true, shiftKey: true }), 'refazer'))
  assert.ok(casa(tecla('z', { ctrlKey: true }), 'desfazer'))
  assert.ok(!casa(tecla('z', { ctrlKey: true, shiftKey: true }), 'desfazer'))
})

test('trocar a tecla vale na hora, e a antiga deixa de valer', () => {
  salvarBinds({ buscar: ['Ctrl+Shift+K'] })
  assert.ok(casa(tecla('k', { ctrlKey: true, shiftKey: true }), 'buscar'))
  assert.ok(!casa(tecla('k', { ctrlKey: true }), 'buscar'))
  assert.deepEqual(bindsDe('buscar'), ['Ctrl+Shift+K'])
})

test('sem nenhuma tecla o atalho fica desligado', () => {
  salvarBinds({ buscar: [] })
  assert.ok(!casa(tecla('k', { ctrlKey: true }), 'buscar'))
})

test('o que não é atalho conhecido ou voltou ao padrão não fica guardado', () => {
  salvarBinds({ buscar: ['Ctrl+K'], naoExiste: ['Ctrl+X'], laviel: 'Ctrl+J', salvar: ['X'] })
  assert.deepEqual(bindsDe('buscar'), ['Ctrl+K'])
  assert.deepEqual(bindsDe('laviel'), ['Ctrl+J'])
  assert.deepEqual(bindsDe('salvar'), ['Ctrl+S'], 'letra pura não serve para salvar')
})

test('atalho em série: Alt+1 a 9 aceita qualquer dígito e diz qual', () => {
  assert.equal(numeroDaSerie(ev({ key: '3', code: 'Digit3', altKey: true }), 'irParaAba'), 3)
  assert.equal(numeroDaSerie(ev({ key: '0', code: 'Digit0', altKey: true }), 'irParaAba'), null, '0 está fora da série')
  salvarBinds({ irParaAba: ['Ctrl+Alt+1'] })
  assert.equal(numeroDaSerie(ev({ key: '9', code: 'Digit9', ctrlKey: true, altKey: true }), 'irParaAba'), 9)
  assert.equal(numeroDaSerie(ev({ key: '9', code: 'Digit9', altKey: true }), 'irParaAba'), null)
})

test('validar: letra pura só nos quadros, Esc e navegador recusados, série termina em número', () => {
  assert.match(validar('salvar', 'S').erro, /Ctrl ou Alt/)
  assert.equal(validar('salvar', 'F9').combo, 'F9', 'tecla de função não precisa de modificador')
  assert.equal(validar('design.retangulo', 'Q').combo, 'Q', 'ferramenta de quadro é letra pura')
  assert.ok(validar('salvar', 'Escape').erro)
  assert.ok(validar('salvar', 'Ctrl+W').erro, 'Ctrl+W é do navegador')
  assert.ok(validar('irParaAba', 'Alt+R').erro)
  assert.equal(validar('irParaAba', 'Ctrl+Alt+5').combo, 'Ctrl+Alt+1')
  assert.equal(validar('nota.formato', 'Ctrl+Alt+2').combo, 'Ctrl+Alt+0')
  assert.ok(validar('nota.formato', 'Ctrl+Alt+7').erro, '0 a 3')
})

test('conflito: atalho global trava a tecla em qualquer grupo, quadros diferentes não se atrapalham', () => {
  assert.equal(conflitoCom('laviel', 'Ctrl+K'), 'buscar')
  assert.equal(conflitoCom('laviel', 'Ctrl+J'), undefined, 'a própria tecla não é conflito')
  // Ctrl+Z é do Editor, vale em toda tela: nenhuma ferramenta pode tomá-lo.
  assert.equal(conflitoCom('planilha.negrito', 'Ctrl+Z'), 'desfazer')
  // Canvas e Design nunca estão abertos juntos: V nos dois é o normal.
  assert.equal(conflitoCom('design.mover', 'V'), undefined)
  assert.equal(conflitoCom('design.retangulo', 'V'), 'design.mover', 'no mesmo grupo, é conflito')
  // O Alt+1 a 9 ocupa nove teclas.
  assert.equal(conflitoCom('relogio', 'Alt+4'), 'irParaAba')
})

test('conflito olha o rascunho, não só o que está salvo', () => {
  assert.equal(conflitoCom('laviel', 'Ctrl+Shift+K', { buscar: ['Ctrl+Shift+K'] }), 'buscar')
})

test('ids únicos e todo item tem texto', () => {
  const ids = GRUPOS.flatMap((g) => g.itens.filter((i) => i.id).map((i) => i.id))
  assert.equal(new Set(ids).size, ids.length)
  for (const grupo of GRUPOS) for (const item of grupo.itens) assert.ok(item.texto, `${grupo.id}: sem texto`)
})

test('as teclas de fábrica não se atrapalham entre si', () => {
  for (const grupo of GRUPOS) {
    for (const item of grupo.itens.filter((i) => i.id)) {
      for (const combo of item.padrao) {
        assert.equal(validar(item.id, combo).combo, combo, `${item.id}: ${combo} recusado pelas próprias regras`)
        assert.equal(conflitoCom(item.id, combo), undefined, `${item.id}: ${combo} colide com ${conflitoCom(item.id, combo)}`)
      }
    }
  }
})

test('teclas para mostrar', () => {
  assert.deepEqual(teclasDoCombo('Ctrl+Shift+F'), ['Ctrl', 'Shift', 'F'])
  assert.deepEqual(teclasDoCombo('Alt+1', [1, 9]), ['Alt', '1 a 9'])
  assert.deepEqual(teclasDoCombo('Ctrl+ArrowDown'), ['Ctrl', '↓'])
  const lista = itensDoGrupo(GRUPOS.find((g) => g.id === 'abas'))
  assert.deepEqual(lista.find((i) => i.id === 'irParaAba').combos, [['Alt', '1 a 9']])
})

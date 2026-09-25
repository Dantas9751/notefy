import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMANDOS,
  comandoDe,
  comandosPara,
  expandirComando,
  instrucaoDoComando,
  sugestoesPara,
} from './comandos.js'

/* ------------------------------------------------------------------ */
/* Quais comandos aparecem                                            */
/* ------------------------------------------------------------------ */

test('fora de um item nao ha comando nenhum', () => {
  assert.deepEqual(comandosPara(null), [])
  assert.deepEqual(comandosPara(undefined), [])
  assert.deepEqual(sugestoesPara('/', null), [])
})

test('cada tipo so recebe comandos que fazem sentido nele', () => {
  const nomes = (kind) => comandosPara(kind).map((c) => c.nome)

  assert.ok(nomes('spreadsheet').includes('/formula'))
  assert.ok(!nomes('note').includes('/formula'))

  assert.ok(nomes('diagram').includes('/percorrer'))
  assert.ok(!nomes('spreadsheet').includes('/percorrer'))

  assert.ok(nomes('canvas').includes('/agrupar'))
  assert.ok(!nomes('diagram').includes('/agrupar'))

  assert.ok(nomes('note').includes('/revisar'))
  assert.ok(!nomes('canvas').includes('/revisar'))
})

test('comandos de estudo valem para todos os tipos', () => {
  for (const kind of ['note', 'spreadsheet', 'diagram', 'canvas']) {
    const nomes = comandosPara(kind).map((c) => c.nome)
    assert.ok(nomes.includes('/resumir'), `/resumir faltou em ${kind}`)
    assert.ok(nomes.includes('/explicar'), `/explicar faltou em ${kind}`)
  }
})

/* ------------------------------------------------------------------ */
/* Autocomplete                                                       */
/* ------------------------------------------------------------------ */

test('a barra sozinha lista tudo do tipo', () => {
  assert.deepEqual(
    sugestoesPara('/', 'note').map((c) => c.nome),
    comandosPara('note').map((c) => c.nome),
  )
})

test('filtra pelo prefixo digitado', () => {
  assert.deepEqual(sugestoesPara('/res', 'note').map((c) => c.nome), ['/resumir'])
})

test('texto que nao comeca com barra nao sugere nada', () => {
  assert.deepEqual(sugestoesPara('resumir isto', 'note'), [])
  assert.deepEqual(sugestoesPara('', 'note'), [])
})

test('a lista some quando o usuario passa para o argumento', () => {
  assert.deepEqual(sugestoesPara('/traduzir ', 'note'), [])
  assert.deepEqual(sugestoesPara('/traduzir alemao', 'note'), [])
})

test('prefixo sem correspondencia devolve lista vazia', () => {
  assert.deepEqual(sugestoesPara('/zzz', 'note'), [])
})

/* ------------------------------------------------------------------ */
/* expandirComando: o texto do usuario aparece no chat como digitou   */
/* ------------------------------------------------------------------ */

test('comando mantem o texto original', () => {
  assert.equal(expandirComando('/resumir', 'note'), '/resumir')
  assert.equal(expandirComando('/formula soma', 'spreadsheet'), '/formula soma')
})

test('texto livre passa intacto', () => {
  const livre = 'o que significa esta formula?'
  assert.equal(expandirComando(livre, 'spreadsheet'), livre)
})

test('comando de outro tipo nao e reconhecido', () => {
  assert.equal(expandirComando('/formula soma', 'note'), '/formula soma')
  assert.equal(comandoDe('/formula soma', 'note'), null)
  assert.ok(comandoDe('/formula soma', 'spreadsheet'))
})

/* ------------------------------------------------------------------ */
/* instrucaoDoComando: o que o modelo recebe                          */
/* ------------------------------------------------------------------ */

test('comando vira instrucao para o modelo', () => {
  const texto = instrucaoDoComando('/resumir', 'note')
  assert.notEqual(texto, '/resumir')
  assert.ok(texto.length > 20)
})

test('argumento entra na instrucao', () => {
  assert.match(instrucaoDoComando('/traduzir alemao', 'note'), /alemao/)
})

test('argumento ausente usa padrao', () => {
  assert.match(instrucaoDoComando('/traduzir', 'note'), /inglês/)
})

test('quantidade invalida em /perguntas cai no padrao', () => {
  assert.match(instrucaoDoComando('/perguntas', 'note'), /5 perguntas/)
  assert.match(instrucaoDoComando('/perguntas abc', 'note'), /5 perguntas/)
  assert.match(instrucaoDoComando('/perguntas 12', 'note'), /12 perguntas/)
})

test('texto livre devolve null', () => {
  assert.equal(instrucaoDoComando('resumir isto', 'note'), null)
  assert.equal(instrucaoDoComando('', 'note'), null)
})

test('comando de outro tipo devolve null', () => {
  assert.equal(instrucaoDoComando('/formula soma', 'note'), null)
})

/* ------------------------------------------------------------------ */
/* Integridade do catalogo                                            */
/* ------------------------------------------------------------------ */

test('todo comando esta bem formado', () => {
  const vistos = new Set()
  for (const c of COMANDOS) {
    assert.ok(c.nome.startsWith('/'), `${c.nome} deveria comecar com /`)
    assert.ok(!c.nome.includes(' '), `${c.nome} nao pode ter espaco`)
    assert.ok(!vistos.has(c.nome), `${c.nome} esta duplicado`)
    vistos.add(c.nome)

    assert.ok(c.descricao?.length > 0, `${c.nome} sem descricao`)
    assert.ok(c.tipos?.length > 0, `${c.nome} sem tipos`)
    assert.equal(typeof c.prompt, 'function', `${c.nome} sem prompt`)

    assert.ok(c.prompt('').length > 10, `${c.nome} devolveu prompt vazio`)
    assert.ok(c.prompt('teste').length > 10, `${c.nome} falhou com argumento`)
  }
})

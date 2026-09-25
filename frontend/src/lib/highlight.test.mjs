/**
 * Testes da extensão que acompanha a linguagem do bloco de código.
 *
 * Só `renameForLanguage` e `extensionFor` são exercitados: elas são
 * funções puras de string. O resto de `highlight.js` importa o
 * highlight.js de verdade, que não roda fora do bundler.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { extensionFor, renameForLanguage } from './highlight.js'

test('extensionFor cobre o seletor e não inventa para desconhecidos', () => {
  assert.equal(extensionFor('python'), '.py')
  assert.equal(extensionFor('rust'), '.rs')
  assert.equal(extensionFor('html'), '.html')
  assert.equal(extensionFor('brainfuck'), '')
})

test('troca a extensão quando ela é uma das nossas', () => {
  assert.equal(renameForLanguage('main.js', 'python'), 'main.py')
  assert.equal(renameForLanguage('app.py', 'rust'), 'app.rs')
  assert.equal(renameForLanguage('index.html', 'css'), 'index.css')
})

test('acrescenta a extensão em nome que ainda não tem', () => {
  assert.equal(renameForLanguage('main', 'python'), 'main.py')
})

test('nome vazio continua vazio: o campo é opcional', () => {
  assert.equal(renameForLanguage('', 'python'), '')
  assert.equal(renameForLanguage(undefined, 'python'), '')
  assert.equal(renameForLanguage('   ', 'python'), '')
})

test('não mexe em sufixo que não saiu daqui', () => {
  // `.finais` não é extensão de linguagem nenhuma — é parte do nome.
  assert.equal(renameForLanguage('notas.finais', 'python'), 'notas.finais')
  assert.equal(renameForLanguage('v1.2.3', 'python'), 'v1.2.3')
})

test('ponto inicial abre o nome, não uma extensão', () => {
  assert.equal(renameForLanguage('.env', 'ini'), '.env')
})

test('linguagem sem extensão conhecida apenas remove a antiga', () => {
  assert.equal(renameForLanguage('main.py', 'brainfuck'), 'main')
})

test('preserva o caminho e só troca o sufixo final', () => {
  assert.equal(renameForLanguage('src/lib/api.js', 'typescript'), 'src/lib/api.ts')
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { escaparTexto } from './sanitizar.js'

/**
 * `limparHtml` depende do DOM (DOMPurify precisa de `window`) e a suíte
 * do projeto é `node --test` sem DOM, então ela é verificada no
 * navegador, contra 18 payloads e 8 amostras de HTML legítimo do editor.
 * Aqui fica a parte pura.
 */

test('fecha os caracteres que quebram um atributo HTML', () => {
  // O caso real: o `alt` da imagem carrega o NOME DO ARQUIVO, e uma
  // aspa nele fecharia o atributo, deixando o resto virar markup.
  assert.equal(
    escaparTexto('x" onerror="alert(1)'),
    'x&quot; onerror=&quot;alert(1)',
  )
})

test('escapa os quatro que importam', () => {
  assert.equal(escaparTexto('<&>"'), '&lt;&amp;&gt;&quot;')
})

test('o & sai primeiro, senão as entidades são escapadas duas vezes', () => {
  assert.equal(escaparTexto('&lt;'), '&amp;lt;')
})

test('texto comum passa intacto', () => {
  assert.equal(escaparTexto('Cálculo III — derivadas'), 'Cálculo III — derivadas')
})

test('nulo e indefinido viram string vazia', () => {
  assert.equal(escaparTexto(null), '')
  assert.equal(escaparTexto(undefined), '')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CORES_DE_PARTIDA,
  PAPEIS,
  TEMAS,
  amostraDoTema,
  apagarTemaPersonalizado,
  assinarTemas,
  cssDoTema,
  escalaDosPapeis,
  resolverPersonalizado,
  salvarTemaPersonalizado,
  temaPorId,
  temasPersonalizados,
} from './temas.js'

const luz = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (a, b) => {
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

test('todo tema tem a escala inteira, do mais claro ao mais escuro', () => {
  for (const tema of TEMAS) {
    assert.equal(tema.ink.length, 12, tema.id)
    for (const cor of [...tema.ink, tema.destaque]) assert.match(cor, /^#[0-9a-f]{6}$/i, tema.id)
    for (let i = 1; i < 12; i += 1) assert.ok(luz(tema.ink[i]) < luz(tema.ink[i - 1]), `${tema.id}: passo ${i} não escurece`)
  }
})

test('o texto do app escuro (ink-100 sobre ink-950) é legível em todo tema', () => {
  for (const tema of TEMAS) {
    assert.ok(contraste(tema.ink[1], tema.ink[11]) >= 7, `${tema.id}: ${contraste(tema.ink[1], tema.ink[11]).toFixed(1)}`)
    // Texto secundário (ink-400) também passa do mínimo de leitura.
    assert.ok(contraste(tema.ink[5], tema.ink[11]) >= 4.5, `${tema.id} secundário: ${contraste(tema.ink[5], tema.ink[11]).toFixed(1)}`)
  }
})

test('a regra traz as doze variáveis em canais RGB; tema desconhecido não traz nada', () => {
  const css = cssDoTema('dracula')
  assert.equal((css.match(/--ink-\d+:/g) ?? []).length, 12)
  assert.match(css, /--ink-950:33 34 44;/)
  assert.equal(cssDoTema('light'), '')
})

test('as cores de fábrica, espalhadas pela escala, dão uma rampa: cada passo mais escuro que o anterior', () => {
  for (const base of ['dark', 'light']) {
    const ink = escalaDosPapeis(base, CORES_DE_PARTIDA[base])
    assert.equal(ink.length, 12, base)
    for (const cor of ink) assert.match(cor, /^#[0-9A-F]{6}$/, base)
    for (let i = 1; i < 12; i += 1) assert.ok(luz(ink[i]) < luz(ink[i - 1]), `${base}: passo ${i} não escurece`)
  }
})

test('cada papel cai no passo que o app lê: fundo escuro em 950, painel em 900, texto em 100', () => {
  const c = CORES_DE_PARTIDA.dark
  const ink = escalaDosPapeis('dark', c)
  assert.deepEqual([ink[11], ink[10], ink[9], ink[8], ink[5], ink[1]], [c.fundo, c.painel, c.realce, c.borda, c.textoSuave, c.texto])
  const k = CORES_DE_PARTIDA.light
  const claro = escalaDosPapeis('light', k)
  assert.deepEqual([claro[0], claro[1], claro[3], claro[6], claro[9]], [k.painel, k.realce, k.borda, k.textoSuave, k.texto])
})

test('tema personalizado: cor que falta ou é inválida volta à de partida, e o destaque acompanha', () => {
  const tema = resolverPersonalizado({ id: 'custom-abc', nome: 'X', base: 'dark', cores: { fundo: '#112233', texto: 'azul', destaque: '#fa0' } })
  assert.equal(tema.cores.fundo, '#112233')
  assert.equal(tema.cores.texto, CORES_DE_PARTIDA.dark.texto)
  assert.equal(tema.destaque, '#FFAA00')
  assert.equal(tema.ink[11], '#112233')
  assert.deepEqual(Object.keys(tema.cores), PAPEIS.map((p) => p.id))
})

test('salvar, achar, aplicar e apagar um tema personalizado, avisando quem está olhando', () => {
  let avisos = 0
  const parar = assinarTemas(() => { avisos += 1 })
  const id = salvarTemaPersonalizado({ nome: '  Meu tema  ', base: 'light', cores: { fundo: '#FFF8E7' } })
  assert.match(id, /^custom-[a-z0-9]+$/)
  assert.equal(temaPorId(id).nome, 'Meu tema')
  // Claro: o branco do app vira a cor de fundo.
  assert.match(cssDoTema(id), /--white:255 248 231;/)
  assert.equal((cssDoTema(id).match(/--ink-\d+:/g) ?? []).length, 12)
  assert.equal(amostraDoTema(temaPorId(id)).fundo, '#FFF8E7')

  salvarTemaPersonalizado({ id, nome: 'Renomeado', base: 'dark', cores: {} })
  assert.equal(temasPersonalizados().filter((x) => x.id === id).length, 1, 'salvar com o mesmo id atualiza, não duplica')
  assert.doesNotMatch(cssDoTema(id), /--white/, 'escuro não mexe no branco')
  assert.equal(amostraDoTema(temaPorId(id)).fundo, CORES_DE_PARTIDA.dark.fundo)

  apagarTemaPersonalizado(id)
  assert.equal(temaPorId(id), null)
  assert.equal(cssDoTema(id), '')
  parar()
  assert.equal(avisos, 3)
})

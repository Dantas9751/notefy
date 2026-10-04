/**
 * Testes da tradução.
 *
 * O teste que importa é o primeiro: ele lê o código do app inteiro atrás
 * de `t('...')` e confere que cada texto tem versão em inglês. É ele que
 * garante o "100% em inglês": uma tela nova com texto sem tradução
 * quebra aqui, e não na frente de quem usa o app.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import EN from '../locales/en-US.js'
import { t, traduzir, traduzirMensagem } from './i18n.js'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.(jsx?)$/.test(nome) ? [caminho] : []
  })
}

/** Os textos passados a `t()` como literal, com o arquivo de cada um. */
function textosDoApp() {
  const achados = new Map()
  const chamada = /(?<![\w.])t\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  for (const arquivo of arquivos(SRC)) {
    if (arquivo.includes('locales')) continue
    // Sem comentários: um `t('exemplo')` escrito num comentário não é uso.
    const codigo = readFileSync(arquivo, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const [, aspas, bruto] of codigo.matchAll(chamada)) {
      if (aspas === '`' && bruto.includes('${')) continue
      const texto = (aspas === '`' ? bruto : bruto.replace(/\\(['"\\])/g, '$1')).replace(/\\n/g, '\n')
      if (!achados.has(texto)) achados.set(texto, arquivo.slice(SRC.length))
    }
  }
  return achados
}

const variaveis = (texto) => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

test('todo texto passado a t() tem versão em inglês', () => {
  const faltando = [...textosDoApp()]
    .filter(([texto]) => !(texto in EN))
    .map(([texto, arquivo]) => `${arquivo}: ${JSON.stringify(texto)}`)
  assert.deepEqual(faltando, [])
})

test('a tradução usa as mesmas variáveis do original', () => {
  const erradas = Object.entries(EN)
    .filter(([pt, en]) => variaveis(pt).join() !== variaveis(en).join())
    .map(([pt]) => pt)
  assert.deepEqual(erradas, [])
})

test('nenhuma tradução está vazia', () => {
  const vazias = Object.entries(EN).filter(([, en]) => !String(en).trim())
  assert.deepEqual(vazias, [])
})

test('fora do navegador o idioma é português', () => {
  assert.equal(t('Salvar'), 'Salvar')
})

test('interpola variáveis nos dois idiomas', () => {
  assert.equal(traduzir('pt-BR', 'A cada {n} dias', { n: 3 }), 'A cada 3 dias')
  assert.equal(traduzir('en-US', 'A cada {n} dias', { n: 3 }), 'Every 3 days')
})

test('texto sem tradução cai no português em vez de sumir', () => {
  assert.equal(traduzir('en-US', 'texto que não existe'), 'texto que não existe')
})

test('mensagem do servidor com número no meio é traduzida', () => {
  const pt = 'Arquivo maior que o limite de {limite} MB.'
  assert.ok(pt in EN, 'a chave de exemplo precisa existir no dicionário')
  assert.equal(
    traduzirMensagem('Arquivo maior que o limite de 50 MB.', 'en-US'),
    traduzir('en-US', pt, { limite: '50' }),
  )
  assert.equal(traduzirMensagem('Arquivo maior que o limite de 50 MB.', 'en-US'), 'The file is over the 50 MB limit.')
})

test('mensagem desconhecida do servidor volta como veio', () => {
  assert.equal(traduzirMensagem('Qualquer coisa nova.', 'en-US'), 'Qualquer coisa nova.')
})

test('mensagem do servidor com trecho que também é do servidor', () => {
  assert.equal(
    traduzirMensagem('Já existe uma pasta chamada “Prova” nesta categoria.', 'en-US'),
    'A folder called “Prova” already exists in this category.',
  )
})

test('mensagem do servidor com sobra numérica no meio', () => {
  assert.equal(
    traduzirMensagem('Contém favoritos (Aula, Prova e mais 2). Remova a estrela deles antes de excluir.', 'en-US'),
    'Contains favorites (Aula, Prova and 2 more). Remove their star before deleting.',
  )
})

test('mensagem do servidor sem variável é traduzida por igualdade', () => {
  assert.equal(traduzirMensagem('Você já tem uma categoria com este nome.', 'en-US'), 'You already have a category with this name.')
})

test('em português a mensagem do servidor passa direto', () => {
  assert.equal(traduzirMensagem('Você já tem uma categoria com este nome.', 'pt-BR'), 'Você já tem uma categoria com este nome.')
})

test('constante de módulo acompanha a troca de idioma (getter)', async () => {
  const { DOCUMENT_KINDS } = await import('./documents.js')
  const i18n = await import('./i18n.js')
  const antes = DOCUMENT_KINDS.note.plural
  // `trocarIdioma` mexe no <html> e avisa a janela; aqui não há DOM.
  globalThis.document = { documentElement: {} }
  globalThis.window = { dispatchEvent() {} }
  globalThis.CustomEvent = class { constructor(tipo, opcoes) { this.type = tipo; this.detail = opcoes?.detail } }
  try {
    i18n.trocarIdioma('en-US')
    assert.equal(i18n.idioma, 'en-US')
    assert.equal(DOCUMENT_KINDS.note.plural, 'Notes')
    i18n.trocarIdioma('pt-BR')
    assert.equal(DOCUMENT_KINDS.note.plural, antes)
  } finally {
    delete globalThis.document
    delete globalThis.window
    delete globalThis.CustomEvent
  }
})

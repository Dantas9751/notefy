/**
 * Nenhum texto em português fica no código fora de `t()`.
 *
 * O teste de `i18n.test.mjs` garante que todo `t('...')` tem versão em
 * inglês, mas não vê o texto que alguém escreveu SEM `t()`: uma tela nova
 * com "Salvar" solto passaria em tudo e apareceria em português no app em
 * inglês. Aqui as linhas de código (comentários não contam) com letra
 * acentuada, que é o sinal mais barato de português, têm de estar dentro
 * de `t()`.
 *
 * Acento não pega palavra sem acento ("Sim", "Novo"); isso quem revisa vê.
 * A lista de exceções abaixo tem cada uma com o motivo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.jsx?$/.test(nome) ? [caminho] : []
  })
}

/** Linhas que podem ter acento sem serem texto de interface. */
const EXCECOES = [
  // Os nomes dos idiomas aparecem na própria língua, sempre.
  { arquivo: 'lib/i18n.js', linha: /Português \(Brasil\)/ },
  // A fórmula aceita "não" como falso e identificadores acentuados.
  { arquivo: 'lib/formula.js', linha: /'não'|A-Za-zÀ-ÿ/ },
  // Sinal de multiplicação, não texto.
  { arquivo: 'components/editors/TableSection.jsx', linha: /×/ },
  { arquivo: 'components/editors/GraphEditor.jsx', linha: /^×$/ },
  { arquivo: 'components/modals/PropriedadesModal.jsx', linha: /'×'/ },
  { arquivo: 'components/modals/FolderFormModal.jsx', linha: /'×'/ },
]

function semComentarios(codigo) {
  return codigo
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, ''))
}

test('todo texto acentuado do código está dentro de t()', () => {
  const soltos = []
  for (const caminho of arquivos(SRC)) {
    const rel = caminho.slice(SRC.length).replace(/\\/g, '/')
    if (rel.startsWith('locales/') || /\.test\.mjs$/.test(rel)) continue
    const linhas = semComentarios(readFileSync(caminho, 'utf8'))
    linhas.forEach((linha, i) => {
      if (!/[À-ÿ]/.test(linha)) return
      // `t(` na mesma linha, ou na linha de cima quando a chamada quebra.
      if (/\bt\(/.test(linha) || /\bt\(\s*$/.test(linhas[i - 1] ?? '')) return
      if (EXCECOES.some((e) => e.arquivo === rel && e.linha.test(linha.trim()))) return
      soltos.push(`${rel}:${i + 1}: ${linha.trim().slice(0, 100)}`)
    })
  }
  assert.deepEqual(soltos, [])
})

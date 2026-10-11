/**
 * Uma nota em Markdown ou em HTML.
 *
 * Fora do `ExportMenu` porque não tem nada de React: são funções puras
 * que recebem o documento e devolvem texto. Dentro do componente elas
 * eram inalcançáveis por teste, e o que mora aqui não é trivial — a
 * tabela em Markdown tem escape de pipe, largura da linha mais larga e
 * uma linha de separador que precisa bater com o número de colunas.
 *
 * A exportação em PDF NÃO passa por aqui: ela é feita no servidor
 * (`content/export_pdf.py`), onde o Pygments colore o código.
 */

import { idioma, t } from './i18n.js'
import { escapeHtml } from './utils.js'

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** `&amp;`, `&nbsp;`, `&#231;`, `&#xE7;` → o caractere (o espaço duro vira espaço comum). */
export function decodificarEntidades(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome) => {
    if (nome[0] === '#') {
      const codigo = nome[1].toLowerCase() === 'x' ? parseInt(nome.slice(2), 16) : Number(nome.slice(1))
      return codigo === 160 ? ' ' : String.fromCodePoint(codigo)
    }
    return ENTIDADES[nome.toLowerCase()] ?? inteira
  })
}

const atributo = (tag, nome) => {
  const achado = new RegExp(`\\s${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return achado ? decodificarEntidades(achado[2] ?? achado[3] ?? achado[4] ?? '') : ''
}

const BLOCOS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'tr', 'hr', 'section', 'article'])
const MARCAS = { b: '**', strong: '**', i: '*', em: '*', s: '~~', strike: '~~', del: '~~', code: '`' }

/**
 * O HTML do editor de nota em Markdown.
 *
 * Segue a ESTRUTURA do HTML, e não substituições soltas: o editor (um
 * `contenteditable` do Chromium) escreve cada linha numa `<div>`, aninha
 * divs dentro de divs e deixa a primeira linha solta. Trocando tag por
 * texto, parágrafos saíam colados, o título caía no meio da linha (e
 * deixava de ser título) e a lista numerada virava marcador.
 */
export function htmlToMarkdown(html) {
  if (!html) return ''
  // Cada pedaço com saída própria: o raiz, e cada citação, link e bloco de
  // código, que se transformam inteiros quando fecham.
  const pilha = [{ tipo: 'raiz', texto: '' }]
  const listas = []
  const atual = () => pilha[pilha.length - 1]
  const escrever = (texto) => {
    atual().texto += texto
  }
  // Garante `n` quebras no fim (início de bloco não gera linha em branco).
  const quebrar = (n) => {
    const p = atual()
    if (!p.texto.trim()) {
      p.texto = p.texto.replace(/\s+$/, '')
      return
    }
    // Logo depois do marcador do item: a `<div>` de dentro do `<li>` é a mesma linha.
    if (/(^|\n) *(- |\d+\. )$/.test(p.texto)) return
    const fim = /\n*$/.exec(p.texto)[0].length
    if (fim < n) p.texto = p.texto.replace(/[ \t]+$/, '') + '\n'.repeat(n - fim)
  }
  const fechar = (tipo) => {
    const i = pilha.map((p) => p.tipo).lastIndexOf(tipo)
    if (i <= 0) return null
    const [pedaco] = pilha.splice(i, 1)
    // O que estava aberto depois dele (tag mal fechada) volta para o pai.
    pedaco.texto += pilha.splice(i).map((p) => p.texto).join('')
    return pedaco
  }
  const recuo = () => listas.slice(0, -1).map((l) => ' '.repeat(l.marca.length)).join('')

  for (const parte of html.split(/(<[^>]+>)/)) {
    if (!parte) continue
    if (parte[0] !== '<') {
      const emCodigo = pilha.some((p) => p.tipo === 'pre')
      escrever(emCodigo ? decodificarEntidades(parte) : decodificarEntidades(parte.replace(/\s+/g, ' ')))
      continue
    }
    const fechamento = parte[1] === '/'
    const nome = (/^<\/?\s*([a-z0-9]+)/i.exec(parte)?.[1] ?? '').toLowerCase()

    if (nome === 'br') {
      if (pilha.some((p) => p.tipo === 'pre')) escrever('\n')
      else escrever('  \n')
    } else if (nome === 'img') {
      quebrar(2)
      escrever(`![${atributo(parte, 'alt')}](${atributo(parte, 'src')})`)
      quebrar(2)
    } else if (nome === 'hr') {
      quebrar(2)
      escrever('---')
      quebrar(2)
    } else if (/^h[1-6]$/.test(nome)) {
      quebrar(2)
      if (!fechamento) escrever(`${'#'.repeat(Number(nome[1]))} `)
    } else if (nome === 'ul' || nome === 'ol') {
      if (fechamento) {
        listas.pop()
        quebrar(listas.length ? 1 : 2)
      } else {
        quebrar(listas.length ? 1 : 2)
        listas.push({ tipo: nome, n: 0, marca: '- ' })
      }
    } else if (nome === 'li') {
      if (!fechamento) {
        quebrar(1)
        const lista = listas[listas.length - 1]
        if (lista) {
          lista.n += 1
          lista.marca = lista.tipo === 'ol' ? `${lista.n}. ` : '- '
          escrever(recuo() + lista.marca)
        } else {
          escrever('- ')
        }
      }
    } else if (nome === 'blockquote' || nome === 'pre' || nome === 'a') {
      if (!fechamento) {
        if (nome !== 'a') quebrar(2)
        pilha.push({ tipo: nome, texto: '', href: nome === 'a' ? atributo(parte, 'href') : '' })
      } else {
        const pedaco = fechar(nome)
        if (!pedaco) continue
        if (nome === 'a') {
          const texto = pedaco.texto.trim()
          escrever(!pedaco.href ? texto : texto && texto !== pedaco.href ? `[${texto}](${pedaco.href})` : `<${pedaco.href}>`)
        } else if (nome === 'pre') {
          escrever(`\`\`\`\n${pedaco.texto.replace(/^\n+|\n+$/g, '')}\n\`\`\``)
          quebrar(2)
        } else {
          const linhas = pedaco.texto.replace(/\n{3,}/g, '\n\n').trim().split('\n')
          escrever(linhas.map((l) => (l ? `> ${l}` : '>')).join('\n'))
          quebrar(2)
        }
      }
    } else if (MARCAS[nome] && !pilha.some((p) => p.tipo === 'pre')) {
      // Marca vazia (`<b></b>`, que o editor deixa ao desfazer) não vira `****`.
      const p = atual()
      if (!fechamento) {
        p.marcas = [...(p.marcas ?? []), { nome, em: p.texto.length }]
        escrever(MARCAS[nome])
      } else {
        const i = (p.marcas ?? []).map((m) => m.nome).lastIndexOf(nome)
        const aberta = i >= 0 ? p.marcas.splice(i, 1)[0] : null
        if (aberta && !p.texto.slice(aberta.em + MARCAS[nome].length).trim()) {
          p.texto = p.texto.slice(0, aberta.em) + p.texto.slice(aberta.em + MARCAS[nome].length)
        } else if (aberta) {
          // O espaço fica fora da marca: `**negrito **` não é negrito no Markdown.
          const sobra = /\s*$/.exec(p.texto)[0]
          p.texto = p.texto.slice(0, p.texto.length - sobra.length) + MARCAS[nome] + sobra
        }
      }
    } else if (nome === 'td' || nome === 'th') {
      if (fechamento) escrever(' ')
    } else if (BLOCOS.has(nome)) {
      quebrar(listas.length && nome !== 'p' ? 1 : 2)
    }
  }

  while (pilha.length > 1) {
    const pedaco = pilha.pop()
    atual().texto += pedaco.texto
  }
  return pilha[0].texto
    .split('\n')
    // Linha só de espaço (a `<div><br></div>` de uma linha vazia) some; no
    // resto, só os dois espaços da quebra de linha forçada ficam no fim.
    .map((l) => (l.trim() ? l.replace(/[ \t]+$/, (s) => (s === '  ' ? s : '')) : ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Largura da tabela: a da linha mais larga, que é a regra do editor. */
export function larguraDaTabela(rows) {
  return rows.reduce((maior, row) => Math.max(maior, row?.length ?? 0), 0)
}

// O título abre o arquivo, como no PDF: sem ele, o .md e o .html saíam sem
// nome nenhum dentro, e só o nome do arquivo dizia de que nota eram.
export function buildNoteMarkdown(doc) {
  const sections = doc.data?.sections ?? []
  const titulo = doc.title?.trim() ? `# ${doc.title.trim()}` : ''
  const corpo = sections
    .map((section) => {
      if (section.type === 'code') {
        const lang = section.language || ''
        return `\`\`\`${lang}\n${section.code ?? ''}\n\`\`\``
      }
      if (section.type === 'checklist') {
        // `- [x]` é a sintaxe de tarefa do GitHub e do Obsidian: colada
        // lá, a linha continua sendo uma caixinha clicável em vez de
        // virar um traço de texto.
        return (section.items ?? [])
          .map((item) => `- [${item.done ? 'x' : ' '}] ${item.text ?? ''}`)
          .join('\n')
      }
      if (section.type === 'table') {
        const rows = (section.rows ?? []).filter(Array.isArray)
        if (!rows.length) return ''
        const largura = larguraDaTabela(rows)
        // O pipe dentro da célula fecharia a coluna no meio dela.
        const linha = (row) =>
          `| ${Array.from({ length: largura }, (_, i) =>
            String(row[i] ?? '').replace(/\|/g, '\\|'),
          ).join(' | ')} |`
        const separador = `|${' --- |'.repeat(largura)}`
        return [linha(rows[0]), separador, ...rows.slice(1).map(linha)].join('\n')
      }
      return htmlToMarkdown(section.html ?? '')
    })
    .filter(Boolean)
    .join('\n\n')
  return [titulo, corpo].filter(Boolean).join('\n\n')
}

export function buildNoteHtml(doc) {
  const sections = doc.data?.sections ?? []
  const body = sections
    .map((section) => {
      if (section.type === 'code') {
        return `<pre><code class="language-${section.language ?? 'plaintext'}">${escapeHtml(section.code ?? '')}</code></pre>`
      }
      if (section.type === 'checklist') {
        const itens = (section.items ?? [])
          .map(
            (item) =>
              `<li><input type="checkbox" disabled${item.done ? ' checked' : ''}> ${escapeHtml(item.text ?? '')}</li>`,
          )
          .join('')
        return itens ? `<ul class="tarefas">${itens}</ul>` : ''
      }
      if (section.type === 'table') {
        const rows = (section.rows ?? []).filter(Array.isArray)
        if (!rows.length) return ''
        const largura = larguraDaTabela(rows)
        const celulas = (row, tag) =>
          Array.from(
            { length: largura },
            (_, i) => `<${tag}>${escapeHtml(String(row[i] ?? ''))}</${tag}>`,
          ).join('')
        const corpo = rows.slice(1).map((r) => `<tr>${celulas(r, 'td')}</tr>`).join('')
        return `<table><thead><tr>${celulas(rows[0], 'th')}</tr></thead><tbody>${corpo}</tbody></table>`
      }
      return section.html ?? ''
    })
    .join('\n')
  return `<!DOCTYPE html>
<html lang="${idioma}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(doc.title || t('Nota'))}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1a1816; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; overflow-x: auto; }
  code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 0.9em; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1rem; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
  th { background: #f5f5f5; }
  ul.tarefas { list-style: none; padding-left: 0.2rem; }
  h1.titulo { font-size: 2rem; margin-bottom: 1.5rem; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${doc.title?.trim() ? `<h1 class="titulo">${escapeHtml(doc.title.trim())}</h1>\n` : ''}${body}
</body>
</html>`
}

/**
 * As imagens de um HTML DENTRO dele (data URL). No editor elas apontam
 * para o servidor do próprio app (`http://127.0.0.1:.../media/...`): o
 * arquivo exportado abria sem imagem nenhuma assim que o app fechava, ou
 * no computador de quem o recebia. `ler(url)` devolve o data URL (ou
 * `null`, e aí a imagem fica com o endereço de antes).
 */
export async function embutirImagens(html, ler) {
  const enderecos = [...new Set([...html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/gi)].map((m) => m[1]))].filter(
    (src) => !src.startsWith('data:'),
  )
  let saida = html
  for (const endereco of enderecos) {
    const dado = await Promise.resolve()
      .then(() => ler(decodificarEntidades(endereco)))
      .catch(() => null)
    if (dado) saida = saida.split(`src="${endereco}"`).join(`src="${dado}"`)
  }
  return saida
}

/** Uma cópia da nota com as imagens embutidas, para o .html e o .md. */
export async function embutirImagensDaNota(doc, ler) {
  const sections = await Promise.all(
    (doc.data?.sections ?? []).map(async (section) =>
      section.html ? { ...section, html: await embutirImagens(section.html, ler) } : section,
    ),
  )
  return { ...doc, data: { ...doc.data, sections } }
}

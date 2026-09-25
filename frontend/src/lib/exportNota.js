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

export function htmlToMarkdown(html) {
  if (!html) return ''
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, (_, c) =>
      c.replace(/<[^>]+>/g, '').split('\n').map((l) => `> ${l}`).join('\n'),
    )
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Largura da tabela: a da linha mais larga, que é a regra do editor. */
export function larguraDaTabela(rows) {
  return rows.reduce((maior, row) => Math.max(maior, row?.length ?? 0), 0)
}

export function buildNoteMarkdown(doc) {
  const sections = doc.data?.sections ?? []
  return sections
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
      // Texto rico: strip HTML tags pra um markdown razoável.
      return htmlToMarkdown(section.html ?? '')
    })
    .join('\n\n')
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
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(doc.title || 'Nota')}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1a1816; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; overflow-x: auto; }
  code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 0.9em; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1rem; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
  th { background: #f5f5f5; }
  ul.tarefas { list-style: none; padding-left: 0.2rem; }
</style>
</head>
<body>
${body}
</body>
</html>`
}

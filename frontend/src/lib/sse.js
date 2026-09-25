/** Parser SSE puro — sem dependências, testável no Node. */

/**
 * Extrai os eventos `data:` de um bloco SSE. Ignora linhas soltas e
 * blocos malformados; `[DONE]` vira `{ done: true }`.
 */
export function extrairEventosSse(texto) {
  const eventos = []
  for (const linha of texto.split('\n')) {
    if (!linha.startsWith('data: ')) continue
    const bruto = linha.slice(6).trim()
    if (!bruto) continue
    if (bruto === '[DONE]') {
      eventos.push({ done: true })
      continue
    }
    try {
      eventos.push(JSON.parse(bruto))
    } catch {
      // pedaço malformado de provedor — ignora, o próximo pode ser válido
    }
  }
  return eventos
}
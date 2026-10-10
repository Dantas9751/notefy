/**
 * JavaScript de um bloco de código, rodando dentro do worker.
 *
 * O código vira o corpo de uma função assíncrona (então `await` funciona
 * no nível de cima) e recebe `console`, `prompt` e `alert` próprios: no
 * worker o `prompt` nativo não existe, e o `console` precisa sair na
 * nota, não no DevTools.
 */

const AsyncFunction = (async () => {}).constructor
//: `(async function anonymous(...\n) {\n` vem antes da primeira linha do código.
const LINHAS_DO_CABECALHO = 2

export function formatar(valor) {
  if (typeof valor === 'string') return valor
  if (valor instanceof Error) return valor.stack ?? String(valor)
  if (typeof valor === 'function') return `[Function ${valor.name || '(anonymous)'}]`
  if (typeof valor !== 'object' || valor === null) return String(valor)
  try {
    return JSON.stringify(valor) ?? String(valor)
  } catch {
    return String(valor) // referência circular
  }
}

/** `TypeError: x is not a function (line 3)`, com a linha do código da nota. */
export function descreverErro(erro) {
  if (!(erro instanceof Error)) return `Uncaught ${formatar(erro)}`
  const linha = /<anonymous>:(\d+):\d+/.exec(erro.stack ?? '')?.[1]
  const onde = linha ? ` (line ${linha - LINHAS_DO_CABECALHO})` : ''
  return `${erro.name}: ${erro.message}${onde}`
}

export async function rodarJavascript(codigo, { escrever, pedirEntrada }) {
  const imprimir = (fluxo) => (...valores) => escrever(`${valores.map(formatar).join(' ')}\n`, fluxo)
  // `table` e `dir` saem como o log: sem eles o código copiado de um
  // tutorial quebrava com "console.table is not a function".
  const console = {
    log: imprimir('saida'),
    info: imprimir('saida'),
    debug: imprimir('saida'),
    table: imprimir('saida'),
    dir: imprimir('saida'),
    warn: imprimir('erro'),
    error: imprimir('erro'),
    clear: () => {},
  }
  const prompt = (pergunta = '') => {
    const texto = String(pergunta)
    escrever(texto && !/\s$/.test(texto) ? `${texto} ` : texto)
    return pedirEntrada()
  }
  const alert = (mensagem = '') => escrever(`${mensagem}\n`)
  try {
    await new AsyncFunction('console', 'prompt', 'alert', codigo)(console, prompt, alert)
  } catch (erro) {
    escrever(`${descreverErro(erro)}\n`, 'erro')
  }
}

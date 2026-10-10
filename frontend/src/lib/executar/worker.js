/**
 * Worker que roda o código de um bloco da nota, longe da tela: um laço
 * infinito trava só ele, e "Parar" é um `terminate()`.
 *
 * Mensagens para a tela: `saida` (texto e fluxo), `estado` (carregando,
 * rodando), `entrada` e `entrada-fim` (esperando a pessoa responder),
 * `sem-python` (o Pyodide não carregou) e `fim`.
 */
import { rodarJavascript } from './javascript.js'
import { PythonIndisponivel, rodarPython } from './python.js'

const RODAR = { javascript: rodarJavascript, python: rodarPython }

/**
 * Espera a resposta do `input()`/`prompt()` com requisições SÍNCRONAS,
 * permitidas dentro de worker: é o que deixa o código parado na linha
 * até a tela responder (ver backend/core/entrada.py). `null` é o
 * "Cancelar": o canal fechou ou o servidor não responde.
 */
function esperarEntrada(urlDaEntrada, escrever) {
  if (!urlDaEntrada) return null
  self.postMessage({ tipo: 'entrada' })
  try {
    for (;;) {
      const pedido = new XMLHttpRequest()
      pedido.open('GET', urlDaEntrada, false)
      pedido.send()
      if (pedido.status === 204) continue // a espera venceu; pergunta de novo
      if (pedido.status !== 200) return null
      const { valor } = JSON.parse(pedido.responseText)
      if (valor != null) escrever(`${valor}\n`, 'entrada')
      return valor
    }
  } catch {
    return null
  } finally {
    self.postMessage({ tipo: 'entrada-fim' })
  }
}

self.onmessage = async ({ data: { linguagem, codigo, urlDaEntrada } }) => {
  const escrever = (texto, fluxo = 'saida') => {
    if (texto) self.postMessage({ tipo: 'saida', fluxo, texto })
  }
  // Os erros do código da pessoa já saem pelo `escrever`; chega aqui o que
  // falhou em volta dele (o Pyodide que não carregou, sem internet nem
  // arquivos). Sem o `finally`, o `fim` não ia e o bloco ficava em
  // "Preparando o Python..." para sempre.
  try {
    await RODAR[linguagem](codigo, {
      escrever,
      pedirEntrada: () => esperarEntrada(urlDaEntrada, escrever),
      avisar: (estado) => self.postMessage({ tipo: 'estado', estado }),
    })
  } catch (erro) {
    // O worker não tem o idioma do app: a tela escreve a frase. O detalhe
    // técnico fica no console, para quem for investigar.
    if (erro instanceof PythonIndisponivel) {
      console.error(erro.cause ?? erro)
      self.postMessage({ tipo: 'sem-python' })
    } else escrever(`${erro?.message ?? erro}\n`, 'erro')
  } finally {
    self.postMessage({ tipo: 'fim' })
  }
}

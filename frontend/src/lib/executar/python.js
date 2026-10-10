/**
 * Python de um bloco de código, com o Pyodide que vai junto com o app
 * (`public/pyodide`, copiado do node_modules pelo `npm install`). Carrega
 * na primeira execução e fica pronto no worker para as seguintes.
 *
 * Só o núcleo vai junto. Pacotes (numpy, pandas...) vêm do CDN oficial da
 * mesma versão quando o código os importa: funcionam com internet e não
 * pesam no instalador.
 */

let carregando = null

/** O próprio Python não carregou: a tela troca o erro técnico por uma frase que se entende. */
export class PythonIndisponivel extends Error {}

function carregarPyodide() {
  carregando ??= (async () => {
    const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.href).href
    const { loadPyodide, version } = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)
    return loadPyodide({ indexURL, packageBaseUrl: `https://cdn.jsdelivr.net/pyodide/v${version}/full/` })
  })().catch((erro) => {
    carregando = null // a próxima execução tenta de novo
    throw new PythonIndisponivel(erro.message, { cause: erro })
  })
  return carregando
}

/**
 * O traceback sem os quadros internos do Pyodide: quem estuda precisa ver
 * a linha do PRÓPRIO código, não `_pyodide/_base.py`.
 */
export function limparTraceback(texto) {
  let manter = true
  return texto
    .trimEnd()
    .split('\n')
    .filter((linha) => {
      if (linha.startsWith('  File "')) manter = linha.includes('"<exec>"')
      else if (!linha.startsWith(' ')) manter = true
      return manter
    })
    .join('\n')
}

function escritor(escrever, fluxo) {
  const decodificador = new TextDecoder()
  return {
    write: (bytes) => {
      escrever(decodificador.decode(bytes, { stream: true }), fluxo)
      return bytes.length
    },
  }
}

export async function rodarPython(codigo, { escrever, pedirEntrada, avisar }) {
  if (!carregando) avisar('carregando')
  const pyodide = await carregarPyodide()
  pyodide.setStdout(escritor(escrever, 'saida'))
  pyodide.setStderr(escritor(escrever, 'erro'))
  // `input()` lê daqui; `null` é fim da entrada (EOFError). O `autoEOF`
  // padrão faz cada leitura voltar com UMA resposta: desligado, o Pyodide
  // pedia a próxima antes de o código imprimir a pergunta seguinte.
  pyodide.setStdin({ stdin: pedirEntrada })
  // Variáveis novas a cada execução, e `__name__` como num script, para
  // o `if __name__ == "__main__":` funcionar.
  const globais = pyodide.globals.get('dict')()
  globais.set('__name__', '__main__')
  try {
    // `messageCallback` só é chamado quando algum pacote precisa baixar.
    await pyodide.loadPackagesFromImports(codigo, {
      messageCallback: () => avisar('carregando'),
      errorCallback: (mensagem) => escrever(`${mensagem}\n`, 'erro'),
    })
    avisar('rodando')
    await pyodide.runPythonAsync(codigo, { globals: globais })
  } catch (erro) {
    escrever(`${limparTraceback(erro.message)}\n`, 'erro')
  } finally {
    pyodide.runPython('import sys; sys.stdout.flush(); sys.stderr.flush()')
    globais.destroy()
  }
}

/**
 * O que muda quando o Notefy roda como programa e não como site.
 *
 * O app é o mesmo nos dois lugares — mesma SPA, mesmo backend HTTP. Só a
 * abertura de uma segunda janela precisa saber a diferença: no navegador é
 * `window.open`, no desktop é uma janela nativa do Tauri. Isolar isso aqui
 * mantém o resto do código sem `if (tauri)` espalhado.
 */

/** O Tauri injeta este objeto na webview antes de qualquer script rodar. */
export const noDesktop = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

/**
 * Abre uma rota do app numa janela separada.
 *
 * A rota viaja como `?open=`, e não no caminho, porque a janela nova faz
 * um carregamento de verdade: o `index.html` precisa ser encontrado antes
 * de o React existir para interpretar `/notes/<id>`. Quem desvia para a
 * rota certa é o `main.jsx`, antes de montar a aplicação.
 */
export async function abrirEmNovaJanela(rota, titulo = 'Notefy') {
  const query = `?open=${encodeURIComponent(rota)}`

  if (!noDesktop()) {
    window.open(`/${query}`, '_blank', 'width=1100,height=800')
    return
  }

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')

  new WebviewWindow(`notefy-${Date.now()}`, {
    url: `index.html${query}`,
    title: titulo,
    width: 1100,
    height: 800,
    minWidth: 640,
    minHeight: 480,
  })
}

/**
 * Salva um blob em disco, perguntando onde.
 *
 * No navegador é o download de sempre: um `<a download>` clicado por
 * script. Dentro do Tauri isso não faz nada — a webview não tem
 * gerenciador de downloads, o clique é engolido e nem erro aparece. Lá
 * quem salva é o comando `salvar_arquivo` do Rust, que abre o "Salvar
 * como" nativo e grava.
 *
 * Os bytes vão como corpo bruto do IPC (segundo argumento do `invoke`),
 * e não como JSON: um arquivo de dezenas de MB serializado em lista de
 * números não passa.
 *
 * Devolve `false` quando a pessoa cancelou o diálogo, para quem chamou
 * não anunciar sucesso nem falha.
 */
export async function salvarArquivo(blob, nomeSugerido) {
  const nome = nomeSugerido || 'arquivo'

  if (!noDesktop()) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    // Firefox só dispara o download se o elemento estiver no documento.
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revogar na mesma volta do event loop cancela o download antes de
    // ele começar; o navegador ainda não leu o blob.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    return true
  }

  const { invoke } = await import('@tauri-apps/api/core')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // Cabeçalho HTTP só aceita ASCII, e os nomes aqui têm acento.
  const caminho = await invoke('salvar_arquivo', bytes, {
    headers: { 'x-nome': encodeURIComponent(nome) },
  })

  return caminho !== null
}

/**
 * Ponte entre janelas da mesma sessão.
 *
 * Duas janelas abertas no mesmo documento não podem discordar sobre ele.
 * O app já avisa a si mesmo por eventos (`notefy:moved`, `notefy:favorites-
 * changed`, `notefy:task-changed`); esta ponte repete esses mesmos avisos
 * nas outras janelas, então qualquer tela que já escutava continua
 * funcionando sem saber que existe uma segunda janela.
 *
 * `BroadcastChannel` funciona em WebView2 e em navegador, e só alcança a
 * mesma origem — o que é exatamente o alcance desejado.
 */
/**
 * Identificador de uma tela aberta, para ela ignorar o próprio aviso.
 *
 * String, e NÃO `Symbol`: o `detail` do evento atravessa o
 * `BroadcastChannel`, e o algoritmo de clone estruturado não sabe copiar
 * um símbolo. O `postMessage` lançava `DataCloneError`, o erro escapava
 * do listener sem ninguém tratar e — o que ninguém via — a segunda
 * janela nunca ficava sabendo da mudança.
 */
export function idDeInstancia() {
  return `i${Math.random().toString(36).slice(2, 10)}`
}

export const EVENTOS_SINCRONIZADOS = [
  'notefy:moved',
  'notefy:favorites-changed',
  'notefy:task-changed',
]

export function conectarJanelas() {
  if (typeof BroadcastChannel === 'undefined') return () => {}

  const canal = new BroadcastChannel('notefy')
  // Sem esta marca, o evento reemitido aqui seria reenviado ao canal e as
  // janelas ficariam se avisando em círculo.
  const DE_FORA = Symbol.for('notefy.deOutraJanela')

  const emissores = EVENTOS_SINCRONIZADOS.map((nome) => {
    const aoDisparar = (evento) => {
      if (evento[DE_FORA]) return
      try {
        canal.postMessage({ nome, detail: evento.detail ?? null })
      } catch {
        // `detail` com algo que o clone estruturado não copia. A outra
        // janela perde ESTE aviso; sem o try, o erro subia como exceção
        // não tratada e a mesma coisa acontecia, só que com ruído no
        // console e nenhuma pista de qual evento foi.
        canal.postMessage({ nome, detail: null })
      }
    }
    window.addEventListener(nome, aoDisparar)
    return () => window.removeEventListener(nome, aoDisparar)
  })

  canal.onmessage = ({ data }) => {
    if (!EVENTOS_SINCRONIZADOS.includes(data?.nome)) return
    const evento = new CustomEvent(data.nome, { detail: data.detail })
    evento[DE_FORA] = true
    window.dispatchEvent(evento)
  }

  return () => {
    emissores.forEach((remover) => remover())
    canal.close()
  }
}

/**
 * Copia texto, devolvendo se deu certo.
 *
 * Os três lugares que copiavam faziam isso de três jeitos: um sem
 * guarda nenhuma (`navigator.clipboard.writeText`, que estoura onde a
 * API não existe) e dois com `?.` mas sem tratar a recusa. E ela
 * acontece: o Chromium rejeita com `NotAllowedError` quando o documento
 * não está em foco, que é exatamente o instante em que um modal acabou
 * de fechar.
 *
 * Nenhum dos chamadores tem para onde mandar um erro de copiar — é um
 * gesto que ou confirma sozinho ou não confirma. Por isso aqui devolve
 * booleano em vez de propagar.
 */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(String(texto ?? ''))
    return true
  } catch {
    return false
  }
}

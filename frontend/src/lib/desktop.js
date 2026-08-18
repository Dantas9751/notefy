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
      canal.postMessage({ nome, detail: evento.detail ?? null })
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

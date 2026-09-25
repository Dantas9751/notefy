import { Component } from 'react'

/**
 * O painel lateral funciona como uma segunda instância do app. Se uma
 * página quebrar lá dentro, o erro não pode derrubar a tela inteira
 * (que vira um fundo preto sem explicação) — o painel isola o erro e
 * mostra uma mensagem com botão de tentar de novo.
 */
export default class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Erro no painel lateral:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Algo deu errado ao carregar esta parte do painel.
          </p>
          <pre className="max-w-full overflow-auto rounded bg-ink-100 px-2 py-1 text-left text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-400">
            {String(this.state.error?.message || this.state.error || 'Erro desconhecido')}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-600 transition hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            Tentar de novo
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

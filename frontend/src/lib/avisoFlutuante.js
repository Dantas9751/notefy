/**
 * Avisos flutuantes de ação: o resultado de algo que não tem lugar na tela,
 * como uma exclusão em lote recusada, um download que falhou ou a IA
 * trabalhando. Saem no mesmo canto e com o mesmo cartão dos avisos de prazo
 * (`AvisosFlutuantes`), e qualquer código manda, inclusive fora do React.
 *
 * Erro de formulário continua no formulário, e tela que não carregou
 * continua no `ErrorState` com "Tentar novamente".
 */

export const EVENTO_AVISO = 'notefy:aviso'

let sequencia = 0
const enviar = (detail) => window.dispatchEvent(new CustomEvent(EVENTO_AVISO, { detail }))

/** Erro de uma ação. Some sozinho, com tempo para ler. O mesmo `id` troca o aviso no lugar. */
export function avisarErro(texto, id = `aviso${(sequencia += 1)}`) {
  if (texto) enviar({ id, tipo: 'erro', texto })
}

/**
 * Uma ação que terminou longe da vista (o arquivo convertido não está na
 * tela). Some sozinho; com `aoAbrir`, clicar no aviso leva ao resultado.
 */
export const avisarSucesso = (texto, id = `aviso${(sequencia += 1)}`, aoAbrir = null) =>
  enviar({ id, tipo: 'sucesso', texto, aoAbrir })

/** "Resumindo...": fica até `fecharAviso(id)` ou até virar erro com o mesmo `id`. */
export const avisarProgresso = (id, texto) => enviar({ id, tipo: 'progresso', texto })

export const fecharAviso = (id) => enviar({ fechar: id })

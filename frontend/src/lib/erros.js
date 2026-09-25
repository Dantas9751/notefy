/**
 * A frase que o usuário vê quando um pedido ao servidor falha.
 *
 * Mora fora do `api.js` porque aquele módulo lê `import.meta.env`, que
 * só existe dentro do Vite — importá-lo num teste de `node --test`
 * estoura antes da primeira asserção. Era por isso que a função mais
 * exposta do app (toda tela de erro passa por ela) não tinha teste
 * nenhum, e foi assim que a página de traceback do Django acabou sendo
 * exibida inteira dentro da caixa de erro do login.
 *
 * `api.js` continua reexportando `extractError`, então as ~40 telas que
 * importam de lá não mudaram.
 */

/**
 * Mensagens por situação, quando o corpo da resposta não traz uma.
 *
 * Sem isto sobrava a mensagem do axios — "Request failed with status
 * code 500", em inglês e sem dizer nada a quem está usando o app.
 */
const POR_STATUS = {
  400: 'Os dados enviados não foram aceitos.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para isso.',
  404: 'Não encontrado. O item pode ter sido excluído.',
  409: 'Isso entra em conflito com algo que já existe.',
  413: 'O arquivo é grande demais.',
  429: 'Muitas tentativas seguidas. Espere um instante.',
}

const SEM_RESPOSTA = 'Não foi possível falar com o servidor. Ele está rodando?'
const ERRO_DO_SERVIDOR = 'O servidor encontrou um erro. Tente de novo em instantes.'

/** O corpo é uma página HTML (erro do Django, proxy, portal de wi-fi)? */
function ehPaginaHtml(texto) {
  return /^\s*(<!doctype|<html)/i.test(texto)
}

/**
 * Achata o erro numa frase que dá para mostrar na tela.
 *
 * O corpo em texto era devolvido COMO VEIO, e quando o Django responde
 * 500 com `DEBUG=True` esse corpo é a página de traceback inteira —
 * centenas de linhas de HTML despejadas dentro da caixinha vermelha de
 * erro do login. Foi o que aconteceu quando o backend subiu apontando
 * para um banco vazio.
 *
 * A ordem é: o que o DRF explicou > o que o status significa > o
 * fallback. A mensagem do axios nunca chega ao usuário: ela é em inglês
 * e fala de código HTTP, não do que ele tentou fazer.
 */
export function extractError(error, fallback = 'Algo deu errado. Tente novamente.') {
  const status = error?.response?.status
  const data = error?.response?.data

  // Sem resposta nenhuma: servidor fora do ar, CORS ou tempo esgotado.
  if (!error?.response) return SEM_RESPOSTA

  const porStatus = POR_STATUS[status] ?? (status >= 500 ? ERRO_DO_SERVIDOR : null)

  if (typeof data === 'string') {
    const texto = data.trim()
    // Página de erro do servidor: só o status diz algo de útil.
    if (!texto || ehPaginaHtml(texto)) return porStatus ?? fallback
    // Texto solto e curto ainda pode ser uma mensagem de verdade; longo
    // é despejo de alguma coisa e não cabe na tela.
    return texto.length <= 300 ? texto : (porStatus ?? fallback)
  }

  // `responseType: 'blob'` (exportar PDF) não dá para ler aqui sem
  // await; o status é o que sobra.
  if (typeof Blob !== 'undefined' && data instanceof Blob) return porStatus ?? fallback

  if (data?.detail) {
    const detalhe = Array.isArray(data.detail) ? data.detail[0] : data.detail
    if (typeof detalhe === 'string') return detalhe
  }

  if (data && typeof data === 'object') {
    // Primeiro erro de campo do DRF. Sem o nome do campo junto: as
    // mensagens deste projeto são escritas para se explicarem sozinhas
    // ("O fim não pode ser anterior ao início.").
    for (const valor of Object.values(data)) {
      const mensagem = Array.isArray(valor) ? valor[0] : valor
      if (typeof mensagem === 'string' && mensagem) return mensagem
    }
  }

  return porStatus ?? fallback
}

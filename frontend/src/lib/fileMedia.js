import api from '@/lib/api'

/**
 * Busca de arquivos de mídia pelo MESMO caminho que o resto do app usa.
 *
 * O `file_url` do backend é absoluto (`http://127.0.0.1:8000/media/...`):
 * usar essa URL direto no `<img>`/`<iframe>` quebrava fora do navegador
 * em dev — o servidor de mídia fica noutra porta e a janela do desktop
 * nem tem proxy. Aqui o caminho `/media/...` é remontado sobre a origem
 * da API configurada (VITE_API_URL), com o header de autorização do
 * axios, então funciona no navegador, no desktop e com autenticação.
 */

/** Origem (esquema+host+porta) que o app usa para falar com o backend. */
export function origemDaApi() {
  const base = import.meta.env.VITE_API_URL || '/api'
  try {
    if (/^https?:/i.test(base)) return new URL(base).origin
  } catch {
    // Caminho relativo ou valor inválido: cai no caso abaixo.
  }
  return window.location.origin
}

/** Só o caminho da mídia (`/media/uploads/...`), pronto para remontar. */
export function caminhoDeMedia(fileUrl) {
  try {
    return new URL(fileUrl, window.location.href).pathname
  } catch {
    return fileUrl
  }
}

/** URL absoluta da mídia na origem da API — o que o axios consegue buscar. */
export function urlDeMedia(fileUrl) {
  return `${origemDaApi()}${caminhoDeMedia(fileUrl)}`
}

/**
 * Busca o conteúdo do arquivo com a sessão do app (refresh incluído).
 * `responseType`: `'blob'` para binário, `'text'` para arquivos legíveis.
 */
export function buscarArquivo(fileUrl, responseType = 'blob') {
  return api.get(urlDeMedia(fileUrl), { responseType })
}

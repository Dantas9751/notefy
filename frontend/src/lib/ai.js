import { TOKEN_KEY } from './api'
import { extrairEventosSse } from './sse'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export class ErroIA extends Error {
  constructor(mensagem, status = 0) {
    super(mensagem)
    this.name = 'ErroIA'
    this.status = status
  }
}

/**
 * Chama a API de IA diretamente via `fetch` em vez de usar a instância
 * `api` (axios) do app. Por quê?
 *
 * O axios tem um interceptor de 401 que tenta renovar o token e, se
 * falhar, desloga o usuário. Isso é correto para chamadas normais da
 * API (listar pastas, salvar documento), mas NÃO para chamadas de IA:
 * se a chave do provedor de IA estiver errada, o Django devolve 401
 * com "credenciais não fornecidas" — que o interceptor confunde com
 * token JWT expirado, derruba a sessão e manda pra tela de login.
 *
 * Usando `fetch` puro, o 401 chega como erro normal e o `catch` de
 * `runIA` trata como ErroIA, sem afetar a sessão do usuário.
 */
function chamarIA(url, body, { signal } = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  return fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * Endpoint único de IA: `task` escolhe o que fazer (o catálogo mora no
 * backend), o resto é o material. Sem streaming — quem quer resposta em
 * pedaços usa `chatStream`.
 *
 * `apply` decide o destino do resultado: nada = pré-visualização,
 * `replace` grava no `targetId`, `create` cria um item na `folderId`.
 */
export async function runIA({
  task,
  documentId,
  input,
  apply,
  targetId,
  folderId,
  title,
  kind,
  signal,
}) {
  try {
    const resposta = await chamarIA(
      '/ai/run/',
      {
        task,
        document_id: documentId,
        input,
        apply,
        target_id: targetId,
        folder_id: folderId,
        title,
        kind,
      },
      { signal },
    )

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}))
      const detalhe =
        (typeof corpo === 'string'
          ? corpo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
          : corpo?.detail) || 'Falha na chamada de IA.'
      throw new ErroIA(detalhe, resposta.status)
    }

    return resposta.json()
  } catch (erro) {
    if (erro instanceof ErroIA) throw erro
    throw new ErroIA(erro.message || 'Falha na chamada de IA.', 0)
  }
}

export async function chatStream({ messages, documentId, signal, onText }) {
  const chamar = (token) =>
    fetch(`${BASE_URL}/ai/chat/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify({ messages, document_id: documentId }),
      signal,
    })

  let resposta = await chamar(localStorage.getItem(TOKEN_KEY))

  if (resposta.status === 401) {
    // Dispara a fila de refresh do axios chamando um endpoint barato; o
    // interceptor renova o token e a chamada retorna 200.
    const { default: api } = await import('./api')
    try {
      await api.get('/me/')
    } catch {
      throw new ErroIA('Sessão expirada. Entre novamente.', 401)
    }
    resposta = await chamar(localStorage.getItem(TOKEN_KEY))
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    throw new ErroIA(corpo.detail || 'Falha na chamada de IA.', resposta.status)
  }
  if (!resposta.body) {
    throw new ErroIA('Este navegador não suporta streaming.', 501)
  }

  const leitor = resposta.body.getReader()
  const decodificador = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    buffer += decodificador.decode(value, { stream: true })
    let fim
    while ((fim = buffer.indexOf('\n\n')) !== -1) {
      const bloco = buffer.slice(0, fim)
      buffer = buffer.slice(fim + 2)
      for (const evento of extrairEventosSse(bloco)) {
        if (evento.done) return
        if (evento.text) onText?.(evento.text)
        if (evento.error) throw new ErroIA(evento.error, 502)
      }
    }
  }
}
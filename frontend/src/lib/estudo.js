/**
 * Cronômetro de estudo: as partes puras.
 *
 * A mecânica é a do Anki e a do Toggl, não a de um cronômetro comum: o
 * relógio anda sozinho enquanto a pessoa está de fato usando o app e para
 * sozinho quando ela sai. Ninguém estuda lembrando de apertar "começar",
 * e um cronômetro esquecido ligado a noite toda mente mais do que não
 * medir nada.
 *
 * O total é POR DIA do calendário local. Vira à meia-noite sem ninguém
 * mandar: a chave do dia muda e o contador começa do zero.
 */

/** Quanto tempo sem teclado/mouse/toque antes de considerar que parou. */
export const OCIOSO_MS = 60_000

const PREFIXO = 'notefy.estudo.'

/** `notefy.estudo.2026-09-19` — data LOCAL, não UTC.
 *
 *  `toISOString()` daria o dia em UTC: quem estuda às 22h em Brasília
 *  veria o tempo cair no dia seguinte. */
export function chaveDoDia(quando = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${PREFIXO}${quando.getFullYear()}-${pad(quando.getMonth() + 1)}-${pad(quando.getDate())}`
}

/**
 * O relógio deve andar agora?
 *
 * Visível E com atividade recente. Sem a parte da visibilidade, deixar o
 * app aberto atrás do navegador contaria como estudo; sem a da
 * atividade, a tela parada contaria também.
 */
export function deveContar({ visivel, ultimaAtividade, agora = Date.now(), pausado = false }) {
  if (pausado || !visivel) return false
  return agora - ultimaAtividade < OCIOSO_MS
}

/**
 * Segundos -> `2h 14m`, `43m`, `12s`.
 *
 * Os segundos só aparecem abaixo de um minuto. Acima disso eles mudam a
 * largura do texto a cada tique e a sidebar inteira treme junto.
 */
export function formatarDuracao(segundos) {
  const total = Math.max(0, Math.floor(segundos))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m) return `${m}m`
  return `${total}s`
}

export function lerTotal(chave) {
  try {
    const bruto = Number(localStorage.getItem(chave))
    return Number.isFinite(bruto) && bruto > 0 ? bruto : 0
  } catch {
    return 0
  }
}

export function gravarTotal(chave, segundos) {
  try {
    localStorage.setItem(chave, String(Math.floor(segundos)))
  } catch {
    /* sem storage: vale só nesta sessão */
  }
}

/** Os últimos N dias com tempo registrado, do mais recente para trás. */
export function historico(dias = 7, agora = new Date()) {
  const saida = []
  for (let i = 0; i < dias; i += 1) {
    const d = new Date(agora)
    d.setDate(d.getDate() - i)
    saida.push({ dia: d, segundos: lerTotal(chaveDoDia(d)) })
  }
  return saida
}

// --------------------------------------------------------------------------
// Rateio por documento
//
// O total do dia sozinho responde "estudei bastante"; ele não responde
// "estudei o quê". Sabendo o documento aberto a cada segundo, o mesmo
// contador vira `2h de Cálculo, 25min de Algoritmos` — que é a informação
// que serve para decidir o que abrir a seguir.
//
// Mora ao lado do total, numa chave irmã (`...docs`), e não dentro dele:
// o total existe desde antes e é lido em outro lugar; trocar o formato
// dele zeraria o histórico de quem já tem dias gravados.
// --------------------------------------------------------------------------

/** `notefy.estudo.2026-09-20.docs` */
export function chaveDosDocumentos(quando = new Date()) {
  return `${chaveDoDia(quando)}.docs`
}

/**
 * `{ [id]: { s: segundos, titulo, kind } }`
 *
 * O título fica GRAVADO junto, e não é buscado na API na hora de exibir:
 * o documento pode ter sido renomeado ou ido para a lixeira, e o tempo
 * gasto nele continua sendo verdade sobre o dia que passou.
 */
export function lerPorDocumento(chave) {
  try {
    const bruto = JSON.parse(localStorage.getItem(chave) || '{}')
    return bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}
  } catch {
    return {}
  }
}

export function gravarPorDocumento(chave, mapa) {
  try {
    localStorage.setItem(chave, JSON.stringify(mapa))
  } catch {
    /* sem storage: vale só nesta sessão */
  }
}

/** Soma um segundo ao documento, devolvendo um mapa NOVO. */
export function somarSegundo(mapa, documento) {
  if (!documento?.id) return mapa
  const atual = mapa[documento.id]
  return {
    ...mapa,
    [documento.id]: {
      s: (atual?.s ?? 0) + 1,
      titulo: documento.titulo || atual?.titulo || 'Sem título',
      kind: documento.kind || atual?.kind || 'note',
    },
  }
}

/** Do mapa para uma lista ordenada por tempo, do maior para o menor. */
export function rankingDoDia(mapa, limite = 5) {
  return Object.entries(mapa)
    .map(([id, valor]) => ({ id, segundos: valor?.s ?? 0, ...valor }))
    .filter((item) => item.segundos > 0)
    .sort((a, b) => b.segundos - a.segundos)
    .slice(0, limite)
}

// --------------------------------------------------------------------------
// Quem está aberto agora
//
// Uma variável de módulo, e não um contexto React: o cronômetro lê este
// valor DENTRO do `setInterval`, uma vez por segundo. Num contexto, cada
// documento aberto repintaria a sidebar inteira para entregar um dado que
// ninguém desenha.
// --------------------------------------------------------------------------

let aberto = null

/** Chamado pela tela que abre um documento; `null` ao sair dela. */
export function marcarDocumentoAberto(documento) {
  aberto = documento?.id
    ? { id: documento.id, titulo: documento.title || documento.titulo, kind: documento.kind }
    : null
}

export function documentoAberto() {
  return aberto
}

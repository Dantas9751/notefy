/**
 * Avaliador de fórmulas da planilha.
 *
 * Parser recursivo descendente próprio — deliberadamente NÃO um `eval()`,
 * que executaria qualquer JavaScript escrito numa célula e viraria um
 * buraco de segurança assim que uma planilha fosse compartilhada.
 *
 * Suporta números, textos entre aspas, booleanos, referências (A1),
 * intervalos (A1:B10), aritmética, comparação, e um conjunto de funções
 * com nomes em português e inglês.
 *
 * Colunas são endereçadas por letra na ordem em que aparecem (A, B, C...)
 * e linhas por número a partir de 1, como o usuário espera de uma
 * planilha — a fórmula não menciona os ids internos.
 */

import { idioma, t } from './i18n.js'

/* -------------------------------------------------------------------- */
/* Coerções                                                             */
/* -------------------------------------------------------------------- */

const isBlank = (v) => v === null || v === undefined || v === ''

/**
 * Texto de número no formato que a pessoa digitou, pronto para `Number()`.
 *
 * O separador que aparece por ÚLTIMO é o decimal: "1.234,56" e "1,234.56"
 * são o mesmo número. Só vírgula é decimal ("12,5"), como no Brasil.
 */
function normalizarNumero(texto) {
  const s = String(texto).trim().replace(/\s/g, '')
  const virgula = s.lastIndexOf(',')
  const ponto = s.lastIndexOf('.')
  if (virgula > ponto) return s.replace(/\./g, '').replace(',', '.')
  if (virgula !== -1) return s.replace(/,/g, '')
  return s
}

function toNumber(raw) {
  if (isBlank(raw)) return 0
  if (typeof raw === 'boolean') return raw ? 1 : 0
  if (typeof raw === 'number') return raw
  return numeroOuNulo(raw) ?? serialDeData(raw) ?? 0
}

//: Símbolo de moeda na frente do número: "R$ 10", "US$ 5", "€ 3,20".
const MOEDA_NA_FRENTE = /^(?:R\$|US\$|\$|€|£)\s*/i

/**
 * O número que o texto É, ou `null` quando não é número.
 *
 * `toNumber` devolve 0 para "abc", e é o certo dentro de uma conta. Para
 * MOSTRAR não serve: uma coluna Número com "abc" exibia "0", e a pessoa
 * não tinha como saber o que estava escrito ali.
 *
 * Reconhece o que se digita numa planilha sem escolher formato antes,
 * como no Excel: "R$ 1.234,56" é 1234.56 e "15%" é 0.15.
 */
export function numeroOuNulo(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  let texto = raw.trim()
  let sinal = 1
  if (texto[0] === '-') {
    sinal = -1
    texto = texto.slice(1).trimStart()
  }
  texto = texto.replace(MOEDA_NA_FRENTE, '')
  if (sinal === 1 && texto[0] === '-') {
    sinal = -1
    texto = texto.slice(1)
  }
  const porCento = texto.endsWith('%')
  if (porCento) texto = texto.slice(0, -1).trimEnd()
  if (!/^\+?(\d|[.,]\d)/.test(texto)) return null
  const value = Number(normalizarNumero(texto))
  if (!Number.isFinite(value)) return null
  return sinal * (porCento ? value / 100 : value)
}

/* -------------------------------------------------------------------- */
/* Datas                                                                */
/*                                                                      */
/* Como no Excel, a data vira um número de dias (o "serial", contado de */
/* 30/12/1899) quando entra numa conta: `=B1-A1` dá os dias entre as    */
/* duas, e `=A1+30` a data trinta dias depois.                          */
/* -------------------------------------------------------------------- */

const DIA_MS = 86400000
const EPOCA = Date.UTC(1899, 11, 30)
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/
//: Dia, mês e ano com barra (ou hífen, ou ponto), com hora opcional. O ano é obrigatório:
//: "1/2" é "metade" com a mesma frequência que é uma data.
const DATA_ESCRITA = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/

/** Serial da data escrita no texto ("12/03/2026", "2026-03-12"), ou `null`. */
export function serialDeData(raw) {
  if (typeof raw !== 'string') return null
  const texto = raw.trim()
  let partes
  const iso = DATA_ISO.exec(texto)
  if (iso) {
    partes = { ano: +iso[1], mes: +iso[2], dia: +iso[3], hora: +(iso[4] ?? 0), minuto: +(iso[5] ?? 0) }
  } else {
    const escrita = DATA_ESCRITA.exec(texto)
    if (!escrita) return null
    // Mês antes do dia só em inglês, como cada um escreve.
    const [primeiro, segundo] = [+escrita[1], +escrita[2]]
    const [dia, mes] = String(idioma).startsWith('en') ? [segundo, primeiro] : [primeiro, segundo]
    let ano = +escrita[3]
    // Ano com dois dígitos, pela regra do Excel: 00-29 é 20xx, 30-99 é 19xx.
    if (escrita[3].length === 2) ano += ano < 30 ? 2000 : 1900
    partes = { ano, mes, dia, hora: +(escrita[4] ?? 0), minuto: +(escrita[5] ?? 0) }
  }
  const { ano, mes, dia, hora, minuto } = partes
  if (mes < 1 || mes > 12 || dia < 1 || hora > 23 || minuto > 59) return null
  const ms = Date.UTC(ano, mes - 1, dia, hora, minuto)
  // 31/02 vira 03/03 no `Date`: a volta tem de dar o mesmo dia.
  if (new Date(ms).getUTCDate() !== dia) return null
  return (ms - EPOCA) / DIA_MS
}

/** Data (e hora, se houver) do serial, no formato ISO que a coluna Data guarda. */
export function dataDeSerial(serial) {
  const iso = new Date(EPOCA + Math.round(serial * 1440) * 60000).toISOString()
  return serial % 1 ? iso.slice(0, 16) : iso.slice(0, 10)
}

/** Hoje na data DO APARELHO: `toISOString` é UTC, e às 22h em Brasília já seria amanhã. */
function hojeLocal() {
  const agora = new Date()
  return dataDeSerial((Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()) - EPOCA) / DIA_MS)
}

/** Data ISO que uma fórmula devolveu (HOJE, data + dias): é mostrada como data. */
const ehDataIso = (valor) => typeof valor === 'string' && DATA_ISO.test(valor)

/** A célula guarda uma fórmula? `=` na frente, em qualquer coluna, como no Excel. */
export function ehFormula(raw) {
  return typeof raw === 'string' && raw.length > 1 && raw[0] === '='
}

/** Na coluna Fórmula toda célula preenchida é fórmula; nas outras, só o que começa com `=`. */
export function celulaComFormula(column, raw) {
  return column?.type === 'formula' ? !isBlank(raw) : ehFormula(raw)
}

/** Apóstrofo na frente é texto literal: `'=A1` mostra "=A1" sem calcular. */
const literal = (raw) => (typeof raw === 'string' && raw[0] === "'" ? raw.slice(1) : raw)

/**
 * Erro de fórmula com o código curto que vai na célula (`#DIV/0!`) e a
 * mensagem que explica (no título e na barra de fórmula).
 */
class ErroDeFormula extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.codigo = codigo
  }
}

const erro = (mensagem) => new ErroDeFormula(t('#ERRO!'), mensagem)

const toText = (raw) => (isBlank(raw) ? '' : String(raw))

function toBool(raw) {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  const text = toText(raw).trim().toLowerCase()
  return !['', '0', 'false', 'falso', 'no', 'nao', 'não', 'n'].includes(text)
}

/* -------------------------------------------------------------------- */
/* Funções                                                              */
/* -------------------------------------------------------------------- */

/** Compara um valor contra um critério ("> 10", "<> x", "texto"). */
function matchesCriterion(value, criterion) {
  const raw = toText(criterion).trim()
  const operator = raw.match(/^(<=|>=|<>|!=|=|<|>)\s*(.*)$/)
  if (!operator) {
    return toText(value).trim().toLowerCase() === raw.toLowerCase()
  }
  const [, op, operand] = operator
  const numeric = operand !== '' && Number.isFinite(Number(operand.replace(',', '.')))
  const left = numeric ? toNumber(value) : toText(value).trim().toLowerCase()
  const right = numeric ? toNumber(operand) : operand.trim().toLowerCase()

  switch (op) {
    case '=':
      return left === right
    case '<>':
    case '!=':
      return left !== right
    case '<':
      return left < right
    case '<=':
      return left <= right
    case '>':
      return left > right
    case '>=':
      return left >= right
    default:
      return false
  }
}

const sum = (values) => values.reduce((acc, n) => acc + toNumber(n), 0)

/**
 * Só os valores que são número (ou data), como o Excel faz em MÉDIA, MÍN,
 * MÁX e MED: célula vazia e texto ficam de fora. Contados como 0, uma
 * célula vazia no intervalo puxava a média para baixo e o MÍN para zero.
 */
const numeros = (values) =>
  values
    .filter((v) => typeof v === 'number' || typeof v === 'boolean' || numeroOuNulo(v) !== null || serialDeData(v) !== null)
    .map(toNumber)

const media = (a) => {
  const n = numeros(a)
  return n.length ? n.reduce((x, y) => x + y, 0) / n.length : 0
}

const FUNCTIONS = {
  // -- Agregação -----------------------------------------------------
  SOMA: sum,
  SUM: sum,
  MEDIA: media,
  AVG: media,
  AVERAGE: media,
  MIN: (a) => {
    const n = numeros(a)
    return n.length ? Math.min(...n) : 0
  },
  MAX: (a) => {
    const n = numeros(a)
    return n.length ? Math.max(...n) : 0
  },
  CONT: (a) => a.filter((v) => !isBlank(v)).length,
  COUNT: (a) => a.filter((v) => !isBlank(v)).length,
  CONT_VAZIO: (a) => a.filter(isBlank).length,
  COUNTBLANK: (a) => a.filter(isBlank).length,
  MEDIAN: (a) => FUNCTIONS.MEDIANA(a),
  MEDIANA: (a) => {
    const nums = numeros(a).sort((x, y) => x - y)
    if (!nums.length) return 0
    const middle = Math.floor(nums.length / 2)
    return nums.length % 2 ? nums[middle] : (nums[middle - 1] + nums[middle]) / 2
  },

  // -- Agregação condicional ----------------------------------------
  // Recebem o intervalo como lista já expandida; o critério vem depois.
  SOMASE: (a) => {
    const criterion = a[a.length - 1]
    return sum(a.slice(0, -1).filter((v) => matchesCriterion(v, criterion)))
  },
  SUMIF: (a) => FUNCTIONS.SOMASE(a),
  CONT_SE: (a) => {
    const criterion = a[a.length - 1]
    return a.slice(0, -1).filter((v) => matchesCriterion(v, criterion)).length
  },
  COUNTIF: (a) => FUNCTIONS.CONT_SE(a),

  // -- Matemática ----------------------------------------------------
  PRODUTO: (a) => (a.length ? a.reduce((acc, n) => acc * toNumber(n), 1) : 0),
  PRODUCT: (a) => FUNCTIONS.PRODUTO(a),
  INT: (a) => Math.floor(toNumber(a[0])),
  MOD: (a) => {
    const divisor = toNumber(a[1])
    if (divisor === 0) throw new ErroDeFormula('#DIV/0!', t('Divisão por zero'))
    // O sinal segue o divisor, como no Excel: MOD(-3; 2) é 1, não -1.
    return toNumber(a[0]) - divisor * Math.floor(toNumber(a[0]) / divisor)
  },
  ABS: (a) => Math.abs(toNumber(a[0])),
  ARRED: (a) => {
    const factor = 10 ** toNumber(a[1] ?? 0)
    return Math.round(toNumber(a[0]) * factor) / factor
  },
  ROUND: (a) => FUNCTIONS.ARRED(a),
  TETO: (a) => Math.ceil(toNumber(a[0])),
  CEIL: (a) => Math.ceil(toNumber(a[0])),
  PISO: (a) => Math.floor(toNumber(a[0])),
  FLOOR: (a) => Math.floor(toNumber(a[0])),
  RAIZ: (a) => Math.sqrt(toNumber(a[0])),
  SQRT: (a) => Math.sqrt(toNumber(a[0])),
  POT: (a) => toNumber(a[0]) ** toNumber(a[1]),
  POWER: (a) => toNumber(a[0]) ** toNumber(a[1]),

  // -- Lógica --------------------------------------------------------
  SE: (a) => (toBool(a[0]) ? a[1] : (a[2] ?? '')),
  IF: (a) => FUNCTIONS.SE(a),
  E: (a) => a.every(toBool),
  AND: (a) => a.every(toBool),
  OU: (a) => a.some(toBool),
  OR: (a) => a.some(toBool),
  NAO: (a) => !toBool(a[0]),
  NOT: (a) => !toBool(a[0]),

  // -- Texto ---------------------------------------------------------
  CONCAT: (a) => a.map(toText).join(''),
  UNIR: (a) => a.map(toText).join(''),
  MAIUSC: (a) => toText(a[0]).toUpperCase(),
  UPPER: (a) => toText(a[0]).toUpperCase(),
  MINUSC: (a) => toText(a[0]).toLowerCase(),
  LOWER: (a) => toText(a[0]).toLowerCase(),
  NUM_CARACT: (a) => toText(a[0]).length,
  LEN: (a) => toText(a[0]).length,
  ESQUERDA: (a) => toText(a[0]).slice(0, toNumber(a[1] ?? 1)),
  LEFT: (a) => FUNCTIONS.ESQUERDA(a),
  DIREITA: (a) => toText(a[0]).slice(-toNumber(a[1] ?? 1)),
  RIGHT: (a) => FUNCTIONS.DIREITA(a),
  ARRUMAR: (a) => toText(a[0]).trim(),
  TRIM: (a) => toText(a[0]).trim(),

  // -- Data ----------------------------------------------------------
  HOJE: () => hojeLocal(),
  TODAY: () => FUNCTIONS.HOJE(),
  DAYS: (a) => FUNCTIONS.DIAS(a),
  // `new Date("12/03/2026")` lia 3 de dezembro (mês primeiro, à americana).
  DIAS: (a) => Math.round(toNumber(a[0]) - toNumber(a[1])),
}

// Os nomes do Excel em português, que levam acento e ponto (MÉDIA,
// MÁXIMO, CONT.SE...). O nome é comparado sem acento e com `.` virando `_`
// (`nomeDeFuncao`), então MÉDIA já cai em MEDIA e CONT.SE em CONT_SE.
Object.assign(FUNCTIONS, {
  MAXIMO: FUNCTIONS.MAX,
  MINIMO: FUNCTIONS.MIN,
  MAIUSCULA: FUNCTIONS.MAIUSC,
  MINUSCULA: FUNCTIONS.MINUSC,
  POTENCIA: FUNCTIONS.POT,
  CONCATENAR: FUNCTIONS.CONCAT,
})

/** Nome de função como a tabela acima o guarda: maiúsculo, sem acento, `.` vira `_`. */
const nomeDeFuncao = (nome) =>
  nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '_')

/**
 * As funções que a pessoa vê: na ajuda, no autocompletar e na dica de
 * argumentos. O nome e os argumentos vêm nos dois idiomas, porque é o que
 * se DIGITA; a descrição passa pela tradução.
 */
export const FUNCOES = [
  { pt: 'SOMA', en: 'SUM', args: ['valor1; valor2; ...', 'value1, value2, ...'], get desc() { return t('Soma números ou intervalos') } },
  { pt: 'MEDIA', en: 'AVERAGE', args: ['valor1; valor2; ...', 'value1, value2, ...'], get desc() { return t('Média dos valores') } },
  { pt: 'MIN', en: 'MIN', args: ['valor1; valor2; ...', 'value1, value2, ...'], get desc() { return t('Menor valor') } },
  { pt: 'MAX', en: 'MAX', args: ['valor1; valor2; ...', 'value1, value2, ...'], get desc() { return t('Maior valor') } },
  { pt: 'CONT', en: 'COUNT', args: ['intervalo', 'range'], get desc() { return t('Quantas células preenchidas') } },
  { pt: 'CONT_VAZIO', en: 'COUNTBLANK', args: ['intervalo', 'range'], get desc() { return t('Quantas células vazias') } },
  { pt: 'MEDIANA', en: 'MEDIAN', args: ['valor1; valor2; ...', 'value1, value2, ...'], get desc() { return t('Valor central') } },
  { pt: 'SOMASE', en: 'SUMIF', args: ['intervalo; critério', 'range, criterion'], get desc() { return t('Soma o que atende ao critério') } },
  { pt: 'CONT_SE', en: 'COUNTIF', args: ['intervalo; critério', 'range, criterion'], get desc() { return t('Conta o que atende ao critério') } },
  { pt: 'PRODUTO', en: 'PRODUCT', args: ['valor1; valor2; ...', 'value1, value2, ...'], get desc() { return t('Multiplica os valores') } },
  { pt: 'SE', en: 'IF', args: ['teste; se_verdadeiro; se_falso', 'test, if_true, if_false'], get desc() { return t('Condicional') } },
  { pt: 'SEERRO', en: 'IFERROR', args: ['valor; se_erro', 'value, if_error'], get desc() { return t('Troca um erro por outro valor') } },
  { pt: 'E', en: 'AND', args: ['teste1; teste2; ...', 'test1, test2, ...'], get desc() { return t('Verdadeiro se todos forem verdadeiros') } },
  { pt: 'OU', en: 'OR', args: ['teste1; teste2; ...', 'test1, test2, ...'], get desc() { return t('Verdadeiro se algum for verdadeiro') } },
  { pt: 'NAO', en: 'NOT', args: ['teste', 'test'], get desc() { return t('Inverte verdadeiro e falso') } },
  { pt: 'ARRED', en: 'ROUND', args: ['número; casas', 'number, digits'], get desc() { return t('Arredonda com casas decimais') } },
  { pt: 'TETO', en: 'CEIL', args: ['número', 'number'], get desc() { return t('Arredonda para cima') } },
  { pt: 'PISO', en: 'FLOOR', args: ['número', 'number'], get desc() { return t('Arredonda para baixo') } },
  { pt: 'INT', en: 'INT', args: ['número', 'number'], get desc() { return t('Parte inteira') } },
  { pt: 'MOD', en: 'MOD', args: ['número; divisor', 'number, divisor'], get desc() { return t('Resto da divisão') } },
  { pt: 'ABS', en: 'ABS', args: ['número', 'number'], get desc() { return t('Valor absoluto') } },
  { pt: 'RAIZ', en: 'SQRT', args: ['número', 'number'], get desc() { return t('Raiz quadrada') } },
  { pt: 'POT', en: 'POWER', args: ['base; expoente', 'base, exponent'], get desc() { return t('Potência') } },
  { pt: 'CONCAT', en: 'CONCAT', args: ['texto1; texto2; ...', 'text1, text2, ...'], get desc() { return t('Junta textos') } },
  { pt: 'MAIUSC', en: 'UPPER', args: ['texto', 'text'], get desc() { return t('Tudo em maiúsculas') } },
  { pt: 'MINUSC', en: 'LOWER', args: ['texto', 'text'], get desc() { return t('Tudo em minúsculas') } },
  { pt: 'NUM_CARACT', en: 'LEN', args: ['texto', 'text'], get desc() { return t('Comprimento do texto') } },
  { pt: 'ESQUERDA', en: 'LEFT', args: ['texto; quantos', 'text, count'], get desc() { return t('Primeiros caracteres') } },
  { pt: 'DIREITA', en: 'RIGHT', args: ['texto; quantos', 'text, count'], get desc() { return t('Últimos caracteres') } },
  { pt: 'ARRUMAR', en: 'TRIM', args: ['texto', 'text'], get desc() { return t('Tira os espaços das pontas') } },
  { pt: 'HOJE', en: 'TODAY', args: ['', ''], get desc() { return t('Data de hoje') } },
  { pt: 'DIAS', en: 'DAYS', args: ['data_final; data_inicial', 'end_date, start_date'], get desc() { return t('Diferença em dias') } },
]

const emPortugues = () => !String(idioma).startsWith('en')

/** Nome e argumentos da função no idioma do app: "SOMA(valor1; valor2; ...)". */
export function assinaturaDe(funcao) {
  const pt = emPortugues()
  return `${pt ? funcao.pt : funcao.en}(${funcao.args[pt ? 0 : 1]})`
}

/**
 * Funções cujo nome começa com o que a pessoa está digitando, para o
 * autocompletar. Compara sem acento: "MÉD" acha MEDIA.
 */
export function sugerirFuncoes(prefixo, limite = 6) {
  const alvo = nomeDeFuncao(prefixo)
  if (!alvo) return []
  const pt = emPortugues()
  return FUNCOES.filter((f) => (pt ? f.pt : f.en).startsWith(alvo) || (pt ? f.en : f.pt).startsWith(alvo))
    .sort((a, b) => Number(!(pt ? a.pt : a.en).startsWith(alvo)) - Number(!(pt ? b.pt : b.en).startsWith(alvo)))
    .slice(0, limite)
}

/** A função (do catálogo) pelo nome, em qualquer idioma ou grafia. */
export function funcaoPorNome(nome) {
  const alvo = nomeDeFuncao(nome)
  return FUNCOES.find((f) => f.pt === alvo || f.en === alvo) ?? null
}

/**
 * O que o cursor está escrevendo numa fórmula, para o editor ajudar:
 *
 * - `palavra`: o nome de função sendo digitado logo antes do cursor (para
 *   o autocompletar), com a posição onde começa;
 * - `dentroDe`: a função cujos parênteses o cursor está dentro (para a
 *   dica de argumentos).
 *
 * Texto entre aspas não conta: `"SOMA"` é texto, não função.
 */
export function contextoDoCursor(texto, cursor) {
  const antes = String(texto ?? '').slice(0, cursor)
  if (!antes.startsWith('=')) return { palavra: null, dentroDe: null }

  // Fora de aspas? Conta as aspas abertas até o cursor.
  const aspas = (antes.match(/"/g) ?? []).length
  if (aspas % 2 === 1) return { palavra: null, dentroDe: null }

  const casou = /(^|[=(;,+\-*/^&<>:\s])([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)$/.exec(antes)
  // "A1" é referência, não começo de nome de função.
  const palavra =
    casou && !/^[A-Za-z]+\d+$/.test(casou[2]) ? { texto: casou[2], inicio: antes.length - casou[2].length } : null

  // A função aberta mais próxima: anda para trás contando parênteses.
  let profundidade = 0
  let dentroDe = null
  let entreAspas = false
  for (let i = antes.length - 1; i >= 0; i -= 1) {
    const ch = antes[i]
    if (ch === '"') entreAspas = !entreAspas
    if (entreAspas) continue
    if (ch === ')') profundidade += 1
    else if (ch === '(') {
      if (profundidade === 0) {
        const nome = /([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)$/.exec(antes.slice(0, i))
        dentroDe = nome ? funcaoPorNome(nome[1]) : null
        break
      }
      profundidade -= 1
    }
  }
  return { palavra, dentroDe }
}

/* -------------------------------------------------------------------- */
/* Endereçamento                                                        */
/* -------------------------------------------------------------------- */

/** Índice 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnLetter(index) {
  let letter = ''
  let n = index
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter
    n = Math.floor(n / 26) - 1
  }
  return letter
}

function letterToIndex(letters) {
  return (
    letters
      .toUpperCase()
      .split('')
      .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  )
}

/* -------------------------------------------------------------------- */
/* Tokenizador                                                          */
/* -------------------------------------------------------------------- */

const TOKEN_RE =
  /\s*(?:("(?:[^"\\]|\\.)*")|(\d+\.?\d*|\.\d+)|(\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?)|([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)|(#REF!)|(<=|>=|<>|!=|\*\*|[-+*/%(),;^<>=&]))/y

function tokenize(input) {
  const tokens = []
  TOKEN_RE.lastIndex = 0
  while (TOKEN_RE.lastIndex < input.length) {
    // Espaço no fim ("=A1+B1 ") não é caractere inesperado.
    if (!input.slice(TOKEN_RE.lastIndex).trim()) break
    const match = TOKEN_RE.exec(input)
    if (!match) throw erro(t('Caractere inesperado'))
    const [, str, number, reference, name, refApagada, operator] = match
    if (str !== undefined) {
      tokens.push({ type: 'string', value: str.slice(1, -1).replace(/\\(.)/g, '$1') })
    } else if (number !== undefined) {
      tokens.push({ type: 'number', value: Number(number) })
    } else if (reference !== undefined) {
      // O `$` só importa ao copiar e preencher (`deslocarFormula`); para
      // calcular, $A$1 e A1 são a mesma célula.
      tokens.push({ type: 'ref', value: reference.replace(/\$/g, '') })
    } else if (name !== undefined) {
      const upper = nomeDeFuncao(name)
      if (upper === 'VERDADEIRO' || upper === 'TRUE') tokens.push({ type: 'bool', value: true })
      else if (upper === 'FALSO' || upper === 'FALSE') tokens.push({ type: 'bool', value: false })
      else tokens.push({ type: 'name', value: upper })
    } else if (refApagada !== undefined) {
      // Linha ou coluna citada foi excluída (ver `ajustarAoExcluir`).
      throw new ErroDeFormula('#REF!', t('A fórmula cita uma célula que foi excluída'))
    } else {
      tokens.push({ type: 'op', value: operator })
    }
  }
  return tokens
}

/* -------------------------------------------------------------------- */
/* Parser                                                               */
/*                                                                      */
/* Precedência, do menor para o maior: comparação, concatenação (&),     */
/* soma/subtração, multiplicação/divisão/resto, potência, unário.        */
/* -------------------------------------------------------------------- */

/**
 * `+` e `-` que sabem de datas, como no Excel: data mais (ou menos) dias
 * continua DATA, e data menos data é o número de dias entre as duas.
 */
function somarOuSubtrair(a, op, b) {
  const resultado = op === '+' ? toNumber(a) + toNumber(b) : toNumber(a) - toNumber(b)
  const dataA = serialDeData(a) !== null
  const dataB = serialDeData(b) !== null
  if (dataA !== dataB && !(op === '-' && dataB)) return dataDeSerial(resultado)
  return resultado
}

function parse(tokens, resolve) {
  let position = 0
  const peek = () => tokens[position]
  const next = () => tokens[position++]

  function parseComparison() {
    let left = parseConcat()
    while (peek()?.type === 'op' && ['<', '>', '<=', '>=', '=', '<>', '!='].includes(peek().value)) {
      const op = next().value
      const right = parseConcat()
      // Duas datas comparam pelo calendário: como texto, "12/03" vinha antes de "15/01".
      const numeric =
        typeof left === 'number' ||
        typeof right === 'number' ||
        (serialDeData(left) !== null && serialDeData(right) !== null)
      const a = numeric ? toNumber(left) : toText(left).toLowerCase()
      const b = numeric ? toNumber(right) : toText(right).toLowerCase()
      switch (op) {
        case '<': left = a < b; break
        case '>': left = a > b; break
        case '<=': left = a <= b; break
        case '>=': left = a >= b; break
        case '=': left = a === b; break
        default: left = a !== b
      }
    }
    return left
  }

  function parseConcat() {
    let left = parseExpression()
    while (peek()?.type === 'op' && peek().value === '&') {
      next()
      left = toText(left) + toText(parseExpression())
    }
    return left
  }

  function parseExpression() {
    let left = parseTerm()
    while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value
      const right = parseTerm()
      left = somarOuSubtrair(left, op, right)
    }
    return left
  }

  function parseTerm() {
    let left = parsePower()
    while (peek()?.type === 'op' && ['*', '/', '%'].includes(peek().value)) {
      const op = next().value
      const right = toNumber(parsePower())
      const a = toNumber(left)
      if (op === '*') left = a * right
      else if (op === '/') {
        if (right === 0) throw new ErroDeFormula('#DIV/0!', t('Divisão por zero'))
        left = a / right
      } else left = a % right
    }
    return left
  }

  function parsePower() {
    const base = parseUnary()
    if (peek()?.type === 'op' && (peek().value === '^' || peek().value === '**')) {
      next()
      // Recursão à direita: 2^3^2 é 2^(3^2), como em planilhas.
      return toNumber(base) ** toNumber(parsePower())
    }
    return base
  }

  function parseUnary() {
    if (peek()?.type === 'op' && (peek().value === '-' || peek().value === '+')) {
      const op = next().value
      const value = toNumber(parseUnary())
      return op === '-' ? -value : value
    }
    return parsePrimary()
  }

  /**
   * Pula um argumento inteiro sem calcular: anda até a vírgula (ou `;`)
   * ou o parêntese que fecha a função, contando os parênteses de dentro.
   * É o que deixa o SEERRO seguir em frente quando o primeiro argumento
   * deu erro no meio do caminho.
   */
  function pularArgumento() {
    let profundidade = 0
    while (position < tokens.length) {
      const token = peek()
      if (token.type === 'op') {
        if (token.value === '(') profundidade += 1
        else if (token.value === ')') {
          if (profundidade === 0) return
          profundidade -= 1
        } else if ((token.value === ',' || token.value === ';') && profundidade === 0) return
      }
      next()
    }
  }

  function parsePrimary() {
    const token = next()
    if (!token) throw erro(t('Fórmula incompleta'))

    if (token.type === 'number' || token.type === 'string' || token.type === 'bool') {
      return token.value
    }

    if (token.type === 'ref') {
      const values = resolve(token.value)
      if (values.length > 1) throw erro(t('Intervalo só é aceito dentro de função'))
      return values[0] ?? ''
    }

    if (token.type === 'name') {
      const seErro = token.value === 'SEERRO' || token.value === 'IFERROR'
      const fn = FUNCTIONS[token.value]
      if (!fn && !seErro) {
        throw new ErroDeFormula(t('#NOME?'), t('Função desconhecida: {value}', { value: token.value }))
      }
      if (peek()?.value !== '(') throw erro(t('Faltou "(" depois de {value}', { value: token.value }))
      next()

      // SEERRO avalia o primeiro argumento por conta própria: um erro ali
      // é justamente o caso que ele existe para tratar.
      if (seErro) {
        let valor
        let falhou = false
        const inicio = position
        try {
          valor = parseComparison()
        } catch {
          // O erro pode ter estourado dentro de outra função, no meio dos
          // parênteses dela: recomeça do início do argumento para pular
          // contando os parênteses certos.
          falhou = true
          position = inicio
          pularArgumento()
        }
        let alternativa = ''
        if (peek()?.value === ',' || peek()?.value === ';') {
          next()
          alternativa = parseComparison()
        }
        if (peek()?.value !== ')') throw erro(t('Faltou fechar parêntese'))
        next()
        return falhou ? alternativa : valor
      }

      // Argumentos aceitam intervalos, que se expandem em vários valores.
      // `;` e `,` são intercambiáveis como separador.
      const args = []
      if (peek()?.value !== ')') {
        for (;;) {
          if (peek()?.type === 'ref' && peek().value.includes(':')) {
            args.push(...resolve(next().value))
          } else {
            args.push(parseComparison())
          }
          if (peek()?.value === ',' || peek()?.value === ';') {
            next()
            continue
          }
          break
        }
      }
      if (peek()?.value !== ')') throw erro(t('Faltou fechar parêntese'))
      next()
      return fn(args)
    }

    if (token.value === '(') {
      const value = parseComparison()
      if (peek()?.value !== ')') throw erro(t('Faltou fechar parêntese'))
      next()
      return value
    }

    throw erro(t('Token inesperado'))
  }

  const result = parseComparison()
  if (position < tokens.length) throw erro(t('Sobrou conteúdo na fórmula'))
  return result
}

/* -------------------------------------------------------------------- */
/* API pública                                                          */
/* -------------------------------------------------------------------- */

/**
 * Resultado de cada célula de fórmula, por planilha.
 *
 * Sem isto, cada célula recalculava do zero tudo de que depende, e quem
 * dependia dela recalculava de novo. Com fórmulas que citam a linha de
 * cima duas vezes (`=A1+A1`, `=A2+A2`...), cada linha DOBRAVA o trabalho:
 * 22 linhas levavam 7 segundos para UMA célula, e 30 travavam a aba.
 *
 * A chave é a identidade de `rows` e `columns`. O editor troca os dois
 * arrays a cada edição (estado imutável do React), então o cache de uma
 * versão nunca responde pela seguinte, e o `WeakMap` o solta sozinho
 * quando a versão sai de uso.
 */
const memoPorLinhas = new WeakMap()

function memoDe(rows, columns) {
  let porColunas = memoPorLinhas.get(rows)
  if (!porColunas) {
    porColunas = new WeakMap()
    memoPorLinhas.set(rows, porColunas)
  }
  let memo = porColunas.get(columns)
  if (!memo) {
    memo = new Map()
    porColunas.set(columns, memo)
  }
  return memo
}

/**
 * Avalia a fórmula de uma célula.
 *
 * `visiting` carrega a cadeia de células já em avaliação; se a fórmula
 * voltar a uma delas, é referência circular — sem esse controle a
 * recursão estouraria a pilha e derrubaria a aba.
 */
export function evaluateFormula(expression, { columns, rows, visiting = new Set() } = {}) {
  const source = String(expression ?? '').replace(/^=/, '').trim()
  if (!source) return { value: '', error: null, codigo: null }

  const resolve = (reference) => {
    const [start, end] = reference.split(':')
    const parseRef = (ref) => {
      const match = /^([A-Za-z]+)(\d+)$/.exec(ref)
      if (!match) throw erro(t('Referência inválida: {ref}', { ref }))
      return { col: letterToIndex(match[1]), row: Number(match[2]) - 1 }
    }

    const from = parseRef(start)
    const to = end ? parseRef(end) : from

    // Recortado ao tamanho da planilha: o laço percorria o retângulo
    // PEDIDO, e `SOMA(A1:ZZZ2000000)` numa planilha de 3x3 eram 36
    // bilhões de voltas em células que não existem.
    const ultimaLinha = Math.min(Math.max(from.row, to.row), rows.length - 1)
    const ultimaColuna = Math.min(Math.max(from.col, to.col), columns.length - 1)

    const values = []
    for (let r = Math.min(from.row, to.row); r <= ultimaLinha; r += 1) {
      for (let c = Math.min(from.col, to.col); c <= ultimaColuna; c += 1) {
        const column = columns[c]
        const row = rows[r]
        if (!column || !row) continue

        const key = `${c}:${r}`
        const raw = row.cells?.[column.id]

        // Qualquer célula que comece com `=` é fórmula, em qualquer coluna:
        // `=A1+B1` numa coluna de texto calcula, e quem cita essa célula
        // recebe o RESULTADO, não o texto da fórmula.
        if (celulaComFormula(column, raw)) {
          if (visiting.has(key)) throw new ErroDeFormula('#CIRC!', t('Referência circular'))
          // Guardar também o ERRO é seguro: se uma célula caiu num ciclo
          // a partir daqui, o ciclo passa por ela, e cai de qualquer ponto.
          const memo = memoDe(rows, columns)
          let nested = memo.get(key)
          if (!nested) {
            nested = evaluateFormula(raw, {
              columns,
              rows,
              visiting: new Set([...visiting, key]),
            })
            memo.set(key, nested)
          }
          if (nested.error) throw new ErroDeFormula(nested.codigo, nested.error)
          values.push(nested.value)
        } else {
          values.push(literal(raw))
        }
      }
    }
    return values
  }

  try {
    const value = parse(tokenize(source), resolve)
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { value: '', error: t('Resultado inválido'), codigo: t('#NÚM!') }
      // Corta o lixo de ponto flutuante (0.1+0.2) sem truncar de verdade.
      return { value: Math.round(value * 1e10) / 1e10, error: null, codigo: null }
    }
    return { value, error: null, codigo: null }
  } catch (error) {
    return { value: '', error: error.message, codigo: error.codigo ?? t('#ERRO!') }
  }
}

/** Posição de cada linha (ou coluna) na versão atual do array, sem `indexOf` a cada célula. */
const indicesPorLista = new WeakMap()
function indiceDe(lista, item) {
  let mapa = indicesPorLista.get(lista)
  if (!mapa) {
    mapa = new Map(lista.map((x, i) => [x, i]))
    indicesPorLista.set(lista, mapa)
  }
  return mapa.get(item) ?? -1
}

/**
 * Resultado da fórmula de uma célula, calculado uma vez por versão da
 * planilha: a tela redesenha a cada tecla e não pode refazer todas as
 * contas a cada vez.
 */
function resultadoDaCelula(column, row, columns, rows) {
  const c = indiceDe(columns, column)
  const r = indiceDe(rows, row)
  const raw = row.cells?.[column.id]
  if (c === -1 || r === -1) return evaluateFormula(raw, { columns, rows })
  const key = `${c}:${r}`
  const memo = memoDe(rows, columns)
  let resultado = memo.get(key)
  if (!resultado) {
    resultado = evaluateFormula(raw, { columns, rows, visiting: new Set([key]) })
    memo.set(key, resultado)
  }
  return resultado
}

/* -------------------------------------------------------------------- */
/* Formatação por tipo de coluna                                        */
/* -------------------------------------------------------------------- */

/**
 * Formatadores por idioma e opções. Montar um `Intl.NumberFormat` custa
 * caro, e a grade redesenha a cada tecla digitada numa célula: criar um por
 * célula de Moeda a cada desenho deixava a digitação lenta em planilha grande.
 */
const formatadores = new Map()
function formatador(opcoes) {
  const chave = `${idioma}|${JSON.stringify(opcoes)}`
  if (!formatadores.has(chave)) formatadores.set(chave, new Intl.NumberFormat(idioma, opcoes))
  return formatadores.get(chave)
}

function formatNumber(value, column) {
  const decimals = column.decimals
  return formatador(
    decimals === undefined || decimals === null
      ? { maximumFractionDigits: 4 }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals },
  ).format(value)
}

/** Dinheiro na moeda da coluna, com as casas decimais escolhidas na barra (o padrão da moeda sem escolha). */
function formatarMoeda(valor, column) {
  const casas = column.decimals
  return formatador({
    style: 'currency',
    currency: column.currency || 'BRL',
    ...(casas === undefined || casas === null ? {} : { minimumFractionDigits: casas, maximumFractionDigits: casas }),
  }).format(valor)
}

/**
 * Data no formato do idioma do app, ou `null`.
 *
 * Aceita o que a coluna Data guarda (ISO), o que se digita ("12/03/2026")
 * e o serial que uma conta devolve. O relógio é o UTC dos dois lados: o
 * serial não tem fuso, e converter para o local trocava o dia à noite.
 */
function dataLegivel(valor, comHora) {
  const serial = typeof valor === 'number' ? valor : serialDeData(toText(valor))
  if (serial === null) return null
  const data = new Date(EPOCA + Math.round(serial * 1440) * 60000)
  return comHora
    ? data.toLocaleString(idioma, { timeZone: 'UTC' })
    : data.toLocaleDateString(idioma, { timeZone: 'UTC' })
}

/**
 * Valor exibido numa célula, já resolvendo fórmula e formato.
 *
 * Devolve também `formula` (a célula calcula) e `numerico` (o que aparece
 * é número e vai alinhado à direita, como em toda planilha). O formato é o
 * da COLUNA mesmo quando o valor veio de uma fórmula: `=B1*2` numa coluna
 * Moeda sai como dinheiro.
 */
export function displayValue(column, row, columns, rows) {
  const raw = row.cells?.[column.id]
  const formula = celulaComFormula(column, raw)
  let valor = literal(raw)

  if (formula) {
    const { value, error, codigo } = resultadoDaCelula(column, row, columns, rows)
    if (error) return { text: codigo || `#${error}`, error, raw, formula, numerico: false }
    valor = value
  }

  const saida = (text, numerico = false) => ({ text, error: null, raw, formula, numerico })

  if (column.type === 'checkbox') return saida(toBool(valor) && !isBlank(valor) ? '✓' : '')
  if (isBlank(valor)) return saida('')
  if (typeof valor === 'boolean') return saida(valor ? t('VERDADEIRO') : t('FALSO'))

  const numero = numeroOuNulo(valor)
  switch (column.type) {
    case 'number':
      return numero === null ? saida(toText(valor)) : saida(formatNumber(numero, column), true)
    case 'currency':
      return numero === null
        ? saida(toText(valor))
        : saida(formatarMoeda(numero, column), true)
    case 'percent': {
      if (numero === null) return saida(toText(valor))
      // A coluna guarda pontos percentuais (15 é "15%"); "15%" digitado com
      // o sinal chega aqui como 0.15.
      const pontos = typeof valor === 'string' && valor.trim().endsWith('%') ? numero * 100 : numero
      return saida(`${formatNumber(pontos, column)}%`, true)
    }
    case 'rating':
      return saida('★'.repeat(Math.max(0, Math.min(5, Math.round(toNumber(valor))))))
    case 'multiselect':
      return saida((Array.isArray(valor) ? valor : [valor]).join(', '))
    case 'date':
    case 'datetime': {
      // Número só é data quando veio de uma conta: "5" digitado continua 5.
      const legivel = typeof valor === 'number' && !formula ? null : dataLegivel(valor, column.type === 'datetime')
      return legivel ? saida(legivel, true) : saida(toText(valor))
    }
    default:
      // Texto, link, seleção, coluna Fórmula: número calculado ganha o
      // formato de número; número DIGITADO fica como foi escrito, mas
      // alinhado à direita, que é o que diz "isto é um número". Data que
      // uma conta devolveu (HOJE(), A1+30) aparece como data.
      if (typeof valor === 'number') return saida(formatNumber(valor, column), true)
      if (formula && ehDataIso(valor)) return saida(dataLegivel(valor, valor.length > 10), true)
      return saida(toText(valor), numero !== null || serialDeData(valor) !== null)
  }
}

/**
 * Valor de uma célula para ordenar, filtrar, resumir e exportar: o
 * resultado quando é fórmula, o conteúdo quando não é.
 *
 * `rows` é a planilha INTEIRA, na ordem gravada: é ela que as referências
 * endereçam, mesmo quando quem pergunta está olhando uma visão filtrada.
 */
export function comparableValue(column, row, columns, rows) {
  const raw = row.cells?.[column.id]
  if (celulaComFormula(column, raw)) {
    const { value, error } = resultadoDaCelula(column, row, columns, rows)
    return error ? null : value
  }
  return literal(raw) ?? null
}

/**
 * Valor que vai para o .xlsx e o .csv: o resultado da fórmula, e número
 * como NÚMERO — "7" digitado numa coluna Número saía como texto, e o Excel
 * marcava a célula com o triângulo verde de "número armazenado como texto".
 */
export function valorParaExportar(column, row, columns, rows) {
  const valor = comparableValue(column, row, columns, rows)
  if (column.type === 'checkbox') return valor ? t('VERDADEIRO') : t('FALSO')
  if (Array.isArray(valor)) return valor.join(', ')
  if (typeof valor === 'boolean') return valor ? t('VERDADEIRO') : t('FALSO')
  if (typeof valor !== 'string') return valor
  // Código com zero na frente (CEP, matrícula) continua texto numa coluna
  // de texto: virar número apagaria o zero. "R$ 10" e "15%" também: como
  // 10 e 0.15, o Excel mostraria o número sem o símbolo.
  const ehColunaNumerica = NUMERIC_COLUMN_TYPES.includes(column.type)
  if (!ehColunaNumerica && /^\s*[-+]?0\d|[%$€£]/.test(valor)) return valor
  const numero = numeroOuNulo(valor)
  if (numero !== null && column.type === 'percent' && valor.trim().endsWith('%')) return Math.round(numero * 1e12) / 1e10
  return numero ?? valor
}

const NUMERIC_COLUMN_TYPES = ['number', 'currency', 'percent', 'rating', 'formula']

/* -------------------------------------------------------------------- */
/* Resumo de coluna                                                     */
/* -------------------------------------------------------------------- */

export const AGGREGATE_LABELS = {
  get none() { return t('Nenhum') },
  get sum() { return t('Soma') },
  get avg() { return t('Média@@agregação') },
  get min() { return t('Mínimo') },
  get max() { return t('Máximo') },
  get count() { return t('Contagem') },
  get filled() { return t('Preenchidas') },
  get empty() { return t('Vazias') },
  get percent_filled() { return t('% preenchida') },
}

/**
 * Resumo do rodapé de uma coluna sobre `rows` (as linhas à vista).
 *
 * `todas` é a planilha inteira: as fórmulas endereçam a ordem gravada, e
 * calculá-las sobre a visão filtrada fazia `=A2` apontar para a segunda
 * linha DA TELA — o resumo de uma coluna de fórmula mudava ao ordenar.
 */
export function aggregate(column, rows, columns, todas = rows) {
  const kind = column.aggregate ?? 'none'
  if (kind === 'none' || !rows.length) return null

  const values = rows.map((row) => comparableValue(column, row, columns, todas))
  const filled = values.filter((v) => !isBlank(v) && v !== false)

  switch (kind) {
    case 'filled':
      return { label: AGGREGATE_LABELS[kind], text: String(filled.length) }
    case 'empty':
      return { label: AGGREGATE_LABELS[kind], text: String(values.length - filled.length) }
    case 'count':
      return { label: AGGREGATE_LABELS[kind], text: String(values.length) }
    case 'percent_filled':
      return {
        label: AGGREGATE_LABELS[kind],
        text: `${Math.round((filled.length / values.length) * 100)}%`,
      }
    default: {
      const numbers = numeros(filled)
      if (!numbers.length) return { label: AGGREGATE_LABELS[kind], text: '—' }
      const result =
        kind === 'sum'
          ? numbers.reduce((a, b) => a + b, 0)
          : kind === 'avg'
            ? numbers.reduce((a, b) => a + b, 0) / numbers.length
            : kind === 'min'
              ? Math.min(...numbers)
              : Math.max(...numbers)
      // O resumo sai no formato da coluna: mínimo e máximo de datas são
      // datas (e não o número de dias por trás), soma de Moeda é dinheiro.
      const data = ['date', 'datetime'].includes(column.type) && ['min', 'max'].includes(kind)
      const arredondado = Math.round(result * 1e4) / 1e4
      let text = formatNumber(arredondado, column)
      if (data) text = dataLegivel(result, column.type === 'datetime')
      else if (column.type === 'currency') text = formatarMoeda(arredondado, column)
      else if (column.type === 'percent') text = `${text}%`
      return { label: AGGREGATE_LABELS[kind], text }
    }
  }
}

/* -------------------------------------------------------------------- */
/* Ordenação e filtro                                                   */
/* -------------------------------------------------------------------- */

export const FILTER_OPERATORS = [
  { value: 'contains', get label() { return t('contém') } },
  { value: 'not_contains', get label() { return t('não contém') } },
  { value: 'equals', get label() { return t('é igual a') } },
  { value: 'not_equals', get label() { return t('é diferente de') } },
  { value: 'gt', get label() { return t('maior que') } },
  { value: 'lt', get label() { return t('menor que') } },
  { value: 'filled', get label() { return t('está preenchida') } },
  { value: 'empty', get label() { return t('está vazia') } },
]

function passesFilter(rule, column, row, columns, rows) {
  const value = comparableValue(column, row, columns, rows)
  const text = toText(value).toLowerCase()
  const target = toText(rule.value).toLowerCase()

  switch (rule.operator) {
    case 'contains':
      return text.includes(target)
    case 'not_contains':
      return !text.includes(target)
    case 'equals':
      return text === target
    case 'not_equals':
      return text !== target
    case 'gt':
      return toNumber(value) > toNumber(rule.value)
    case 'lt':
      return toNumber(value) < toNumber(rule.value)
    case 'filled':
      return !isBlank(value) && value !== false
    case 'empty':
      return isBlank(value) || value === false
    default:
      return true
  }
}

/**
 * Aplica filtros e ordenação para exibição.
 *
 * A ordem das linhas no payload NÃO muda: ordenar é uma visão, e as
 * referências das fórmulas (A1, A2...) continuam apontando para as mesmas
 * células. Reordenar o array quebraria toda fórmula da planilha.
 */
export function visibleRows(data) {
  const columns = data?.columns ?? []
  const rows = data?.rows ?? []
  const byId = Object.fromEntries(columns.map((c) => [c.id, c]))

  let result = rows
  for (const rule of data?.filters ?? []) {
    const column = byId[rule.column]
    if (!column) continue
    result = result.filter((row) => passesFilter(rule, column, row, columns, rows))
  }

  const sort = data?.sort
  if (sort?.column && byId[sort.column]) {
    const column = byId[sort.column]
    const direction = sort.direction === 'desc' ? -1 : 1
    result = [...result].sort((a, b) => {
      const va = comparableValue(column, a, columns, rows)
      const vb = comparableValue(column, b, columns, rows)
      if (isBlank(va) && isBlank(vb)) return 0
      if (isBlank(va)) return 1 // vazias sempre no fim
      if (isBlank(vb)) return -1
      // Número com número compara como número em QUALQUER coluna: numa de
      // texto, "10" vinha antes de "9".
      const na = numeroOuNulo(va)
      const nb = numeroOuNulo(vb)
      if (na !== null && nb !== null) return (na - nb) * direction
      // Data com data pelo calendário: como texto, "15/01" vinha depois de "12/03".
      const da = serialDeData(va)
      const db = serialDeData(vb)
      if (da !== null && db !== null) return (da - db) * direction
      if (NUMERIC_COLUMN_TYPES.includes(column.type)) return (toNumber(va) - toNumber(vb)) * direction
      // `numeric`: "Aula 2" antes de "Aula 10".
      return toText(va).localeCompare(toText(vb), idioma, { numeric: true }) * direction
    })
  }

  return result
}

/* -------------------------------------------------------------------- */
/* Reescrita de referências                                             */
/*                                                                      */
/* Quando a planilha muda de forma — linha inserida ou excluída, coluna  */
/* movida, fórmula copiada para outra célula —, cada referência precisa  */
/* acompanhar o DADO, como no Excel. Sem isso `=A5` continuava `=A5`     */
/* depois de excluir a linha 2, e passava a somar a linha errada sem     */
/* aviso nenhum.                                                        */
/* -------------------------------------------------------------------- */

/** Texto entre aspas (que passa intacto) ou uma referência / intervalo. */
const PADRAO_REFERENCIA =
  /("(?:[^"\\]|\\.)*")|(?<![A-Za-zÀ-ÿ0-9_$.])(\$?)([A-Za-z]+)(\$?)(\d+)(?::(\$?)([A-Za-z]+)(\$?)(\d+))?(?![A-Za-zÀ-ÿ0-9_(])/g

const escreverReferencia = (r) =>
  `${r.absCol ? '$' : ''}${columnLetter(r.col)}${r.absRow ? '$' : ''}${r.row + 1}`

/**
 * Passa cada referência da fórmula por `fn(inicio, fim)`, que devolve as
 * novas pontas — ou `null` quando a célula deixou de existir, e a
 * referência vira `#REF!`, como no Excel.
 */
function transformarReferencias(formula, fn) {
  return String(formula).replace(PADRAO_REFERENCIA, (inteiro, aspas, a1, l1, b1, n1, a2, l2, b2, n2) => {
    if (aspas !== undefined) return inteiro
    const inicio = { absCol: a1 === '$', col: letterToIndex(l1), absRow: b1 === '$', row: Number(n1) - 1 }
    const fim = l2 === undefined ? null : { absCol: a2 === '$', col: letterToIndex(l2), absRow: b2 === '$', row: Number(n2) - 1 }
    const novas = fn(inicio, fim)
    if (!novas) return '#REF!'
    const [p, q] = novas
    return q ? `${escreverReferencia(p)}:${escreverReferencia(q)}` : escreverReferencia(p)
  })
}

const campoDoEixo = (eixo) => (eixo === 'linha' ? 'row' : 'col')

/**
 * A fórmula copiada `dLinhas` para baixo e `dColunas` para a direita: o que
 * não tem `$` anda junto (`=A1*2` uma linha abaixo vira `=A2*2`). Sair da
 * planilha pela esquerda ou por cima vira `#REF!`.
 */
export function deslocarFormula(formula, dLinhas, dColunas) {
  if (!dLinhas && !dColunas) return formula
  const mover = (r) => ({
    ...r,
    row: r.absRow ? r.row : r.row + dLinhas,
    col: r.absCol ? r.col : r.col + dColunas,
  })
  return transformarReferencias(formula, (inicio, fim) => {
    const pontas = [mover(inicio), fim && mover(fim)]
    return pontas.some((r) => r && (r.row < 0 || r.col < 0)) ? null : pontas
  })
}

/** Linha (ou coluna) nova na posição `indice`: o que estava dali para frente anda uma casa. */
export function ajustarAoInserir(formula, eixo, indice, quantidade = 1) {
  const campo = campoDoEixo(eixo)
  const mover = (r) => (r[campo] >= indice ? { ...r, [campo]: r[campo] + quantidade } : r)
  return transformarReferencias(formula, (inicio, fim) => [mover(inicio), fim && mover(fim)])
}

/**
 * Linha (ou coluna) `indice` excluída: quem vinha depois volta uma casa,
 * o intervalo que a continha encolhe, e a referência à própria célula
 * excluída vira `#REF!`.
 */
export function ajustarAoExcluir(formula, eixo, indice) {
  const campo = campoDoEixo(eixo)
  return transformarReferencias(formula, (inicio, fim) => {
    if (!fim) {
      if (inicio[campo] === indice) return null
      return [inicio[campo] > indice ? { ...inicio, [campo]: inicio[campo] - 1 } : inicio, null]
    }
    const [menor, maior] = inicio[campo] <= fim[campo] ? [inicio, fim] : [fim, inicio]
    if (menor[campo] === indice && maior[campo] === indice) return null
    const novoMenor = menor[campo] > indice ? { ...menor, [campo]: menor[campo] - 1 } : menor
    const novoMaior = maior[campo] >= indice ? { ...maior, [campo]: maior[campo] - 1 } : maior
    return menor === inicio ? [novoMenor, novoMaior] : [novoMaior, novoMenor]
  })
}

/** Coluna (ou linha) movida de `de` para `para`: a referência segue o dado. */
export function ajustarAoMover(formula, eixo, de, para) {
  if (de === para) return formula
  const campo = campoDoEixo(eixo)
  const mapear = (i) => {
    if (i === de) return para
    if (de < para && i > de && i <= para) return i - 1
    if (para < de && i >= para && i < de) return i + 1
    return i
  }
  const mover = (r) => ({ ...r, [campo]: mapear(r[campo]) })
  return transformarReferencias(formula, (inicio, fim) => [mover(inicio), fim && mover(fim)])
}

/**
 * Aplica `reescrever` a toda célula com fórmula da planilha. Devolve o
 * MESMO array quando nada mudou, para não gastar render nem passo de
 * desfazer à toa.
 */
export function reescreverFormulas(columns, rows, reescrever) {
  let mudou = false
  const novas = rows.map((row) => {
    let cells = null
    for (const column of columns) {
      const raw = row.cells?.[column.id]
      if (!celulaComFormula(column, raw)) continue
      const nova = reescrever(String(raw))
      if (nova === raw) continue
      cells ??= { ...row.cells }
      cells[column.id] = nova
    }
    if (!cells) return row
    mudou = true
    return { ...row, cells }
  })
  return mudou ? novas : rows
}

/**
 * As referências de uma fórmula, na ordem em que aparecem, para pintar as
 * células citadas enquanto ela é escrita. Intervalo vem com as duas pontas
 * já ordenadas; repetida aparece uma vez só.
 */
export function referenciasDaFormula(formula) {
  if (!ehFormula(formula)) return []
  const vistas = new Map()
  transformarReferencias(formula, (inicio, fim) => {
    const ponta = fim ?? inicio
    const chave = `${inicio.col}:${inicio.row}:${ponta.col}:${ponta.row}`
    if (!vistas.has(chave)) {
      vistas.set(chave, {
        colunaInicio: Math.min(inicio.col, ponta.col),
        colunaFim: Math.max(inicio.col, ponta.col),
        linhaInicio: Math.min(inicio.row, ponta.row),
        linhaFim: Math.max(inicio.row, ponta.row),
      })
    }
    return [inicio, fim]
  })
  return [...vistas.values()]
}

/** Endereço de uma célula ("B3"), a partir dos índices de coluna e de linha. */
export const enderecoDe = (coluna, linha) => `${columnLetter(coluna)}${linha + 1}`

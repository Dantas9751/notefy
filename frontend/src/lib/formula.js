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

/* -------------------------------------------------------------------- */
/* Coerções                                                             */
/* -------------------------------------------------------------------- */

const isBlank = (v) => v === null || v === undefined || v === ''

function toNumber(raw) {
  if (isBlank(raw)) return 0
  if (typeof raw === 'boolean') return raw ? 1 : 0
  if (typeof raw === 'number') return raw
  // Aceita "1.234,56" e "1234.56": o usuário digita no formato que quiser.
  const cleaned = String(raw).trim().replace(/\s/g, '')
  const normalized =
    cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned
  const value = Number(normalized)
  return Number.isFinite(value) ? value : 0
}

const toText = (raw) => (isBlank(raw) ? '' : String(raw))

function toBool(raw) {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  const text = toText(raw).trim().toLowerCase()
  return !['', '0', 'false', 'falso', 'nao', 'não', 'n'].includes(text)
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

const FUNCTIONS = {
  // -- Agregação -----------------------------------------------------
  SOMA: sum,
  SUM: sum,
  MEDIA: (a) => (a.length ? sum(a) / a.length : 0),
  AVG: (a) => (a.length ? sum(a) / a.length : 0),
  AVERAGE: (a) => (a.length ? sum(a) / a.length : 0),
  MIN: (a) => (a.length ? Math.min(...a.map(toNumber)) : 0),
  MAX: (a) => (a.length ? Math.max(...a.map(toNumber)) : 0),
  CONT: (a) => a.filter((v) => !isBlank(v)).length,
  COUNT: (a) => a.filter((v) => !isBlank(v)).length,
  CONT_VAZIO: (a) => a.filter(isBlank).length,
  MEDIANA: (a) => {
    const nums = a.map(toNumber).sort((x, y) => x - y)
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
  DIREITA: (a) => toText(a[0]).slice(-toNumber(a[1] ?? 1)),
  ARRUMAR: (a) => toText(a[0]).trim(),
  TRIM: (a) => toText(a[0]).trim(),

  // -- Data ----------------------------------------------------------
  HOJE: () => new Date().toISOString().slice(0, 10),
  DIAS: (a) => {
    const start = new Date(toText(a[1]))
    const end = new Date(toText(a[0]))
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return 0
    return Math.round((end - start) / 86400000)
  },
}

/** Nomes oferecidos na ajuda do editor — sem os apelidos em inglês. */
export const FUNCTION_HELP = [
  { name: 'SOMA(A1:A10)', desc: 'Soma um intervalo' },
  { name: 'MEDIA(A1:A10)', desc: 'Média dos valores' },
  { name: 'MIN / MAX', desc: 'Menor e maior valor' },
  { name: 'CONT(A1:A10)', desc: 'Quantas células preenchidas' },
  { name: 'MEDIANA(A1:A10)', desc: 'Valor central' },
  { name: 'SOMASE(A1:A10; ">5")', desc: 'Soma o que atende ao critério' },
  { name: 'CONT_SE(A1:A10; "ok")', desc: 'Conta o que atende ao critério' },
  { name: 'SE(A1>7; "passou"; "reprovou")', desc: 'Condicional' },
  { name: 'E / OU / NAO', desc: 'Lógica booleana' },
  { name: 'ARRED(A1; 2)', desc: 'Arredonda com casas decimais' },
  { name: 'CONCAT(A1; " - "; B1)', desc: 'Junta textos' },
  { name: 'MAIUSC / MINUSC', desc: 'Troca a caixa do texto' },
  { name: 'NUM_CARACT(A1)', desc: 'Comprimento do texto' },
  { name: 'HOJE()', desc: 'Data de hoje' },
  { name: 'DIAS(A1; B1)', desc: 'Diferença em dias' },
]

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
  /\s*(?:("(?:[^"\\]|\\.)*")|(\d+\.?\d*)|(\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?)|([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*)|(<=|>=|<>|!=|\*\*|[-+*/%(),;^<>=&]))/y

function tokenize(input) {
  const tokens = []
  TOKEN_RE.lastIndex = 0
  while (TOKEN_RE.lastIndex < input.length) {
    const match = TOKEN_RE.exec(input)
    if (!match) throw new Error('Caractere inesperado')
    const [, str, number, reference, name, operator] = match
    if (str !== undefined) {
      tokens.push({ type: 'string', value: str.slice(1, -1).replace(/\\(.)/g, '$1') })
    } else if (number !== undefined) {
      tokens.push({ type: 'number', value: Number(number) })
    } else if (reference !== undefined) {
      // O `$` de referência absoluta é aceito e ignorado: a planilha não
      // copia fórmulas entre células, então não há o que ancorar.
      tokens.push({ type: 'ref', value: reference.replace(/\$/g, '') })
    } else if (name !== undefined) {
      const upper = name.toUpperCase()
      if (upper === 'VERDADEIRO' || upper === 'TRUE') tokens.push({ type: 'bool', value: true })
      else if (upper === 'FALSO' || upper === 'FALSE') tokens.push({ type: 'bool', value: false })
      else tokens.push({ type: 'name', value: upper.replace(/\./g, '_') })
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

function parse(tokens, resolve) {
  let position = 0
  const peek = () => tokens[position]
  const next = () => tokens[position++]

  function parseComparison() {
    let left = parseConcat()
    while (peek()?.type === 'op' && ['<', '>', '<=', '>=', '=', '<>', '!='].includes(peek().value)) {
      const op = next().value
      const right = parseConcat()
      const numeric = typeof left === 'number' || typeof right === 'number'
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
      left = op === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right)
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
        if (right === 0) throw new Error('Divisão por zero')
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

  function parsePrimary() {
    const token = next()
    if (!token) throw new Error('Fórmula incompleta')

    if (token.type === 'number' || token.type === 'string' || token.type === 'bool') {
      return token.value
    }

    if (token.type === 'ref') {
      const values = resolve(token.value)
      if (values.length > 1) throw new Error('Intervalo só é aceito dentro de função')
      return values[0] ?? ''
    }

    if (token.type === 'name') {
      const fn = FUNCTIONS[token.value]
      if (!fn) throw new Error(`Função desconhecida: ${token.value}`)
      if (peek()?.value !== '(') throw new Error(`Faltou "(" depois de ${token.value}`)
      next()

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
      if (peek()?.value !== ')') throw new Error('Faltou fechar parêntese')
      next()
      return fn(args)
    }

    if (token.value === '(') {
      const value = parseComparison()
      if (peek()?.value !== ')') throw new Error('Faltou fechar parêntese')
      next()
      return value
    }

    throw new Error('Token inesperado')
  }

  const result = parseComparison()
  if (position < tokens.length) throw new Error('Sobrou conteúdo na fórmula')
  return result
}

/* -------------------------------------------------------------------- */
/* API pública                                                          */
/* -------------------------------------------------------------------- */

/**
 * Avalia a fórmula de uma célula.
 *
 * `visiting` carrega a cadeia de células já em avaliação; se a fórmula
 * voltar a uma delas, é referência circular — sem esse controle a
 * recursão estouraria a pilha e derrubaria a aba.
 */
export function evaluateFormula(expression, { columns, rows, visiting = new Set() } = {}) {
  const source = String(expression || '').replace(/^=/, '').trim()
  if (!source) return { value: '', error: null }

  const resolve = (reference) => {
    const [start, end] = reference.split(':')
    const parseRef = (ref) => {
      const match = /^([A-Za-z]+)(\d+)$/.exec(ref)
      if (!match) throw new Error(`Referência inválida: ${ref}`)
      return { col: letterToIndex(match[1]), row: Number(match[2]) - 1 }
    }

    const from = parseRef(start)
    const to = end ? parseRef(end) : from

    const values = []
    for (let r = Math.min(from.row, to.row); r <= Math.max(from.row, to.row); r += 1) {
      for (let c = Math.min(from.col, to.col); c <= Math.max(from.col, to.col); c += 1) {
        const column = columns[c]
        const row = rows[r]
        if (!column || !row) continue

        const key = `${c}:${r}`
        const raw = row.cells?.[column.id]

        if (column.type === 'formula') {
          if (visiting.has(key)) throw new Error('Referência circular')
          const nested = evaluateFormula(raw, {
            columns,
            rows,
            visiting: new Set([...visiting, key]),
          })
          if (nested.error) throw new Error(nested.error)
          values.push(nested.value)
        } else {
          values.push(raw)
        }
      }
    }
    return values
  }

  try {
    const value = parse(tokenize(source), resolve)
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { value: '', error: 'Resultado inválido' }
      // Corta o lixo de ponto flutuante (0.1+0.2) sem truncar de verdade.
      return { value: Math.round(value * 1e10) / 1e10, error: null }
    }
    return { value, error: null }
  } catch (error) {
    return { value: '', error: error.message }
  }
}

/* -------------------------------------------------------------------- */
/* Formatação por tipo de coluna                                        */
/* -------------------------------------------------------------------- */

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

function formatNumber(value, column) {
  const decimals = column.decimals
  const formatter =
    decimals === undefined || decimals === null
      ? NUMBER_FORMAT
      : new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
  return formatter.format(value)
}

/** Valor exibido numa célula, já resolvendo fórmula e formato. */
export function displayValue(column, row, columns, rows) {
  const raw = row.cells?.[column.id]

  if (column.type === 'formula') {
    const { value, error } = evaluateFormula(raw, { columns, rows })
    if (error) return { text: `#${error}`, error, raw }
    if (typeof value === 'boolean') return { text: value ? 'VERDADEIRO' : 'FALSO', error: null, raw }
    if (typeof value === 'number') return { text: formatNumber(value, column), error: null, raw }
    return { text: toText(value), error: null, raw }
  }

  if (column.type === 'checkbox') return { text: raw ? '✓' : '', error: null, raw }
  if (isBlank(raw)) return { text: '', error: null, raw }

  switch (column.type) {
    case 'number':
      return { text: formatNumber(toNumber(raw), column), error: null, raw }
    case 'currency':
      return {
        text: new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: column.currency || 'BRL',
        }).format(toNumber(raw)),
        error: null,
        raw,
      }
    case 'percent':
      return { text: `${formatNumber(toNumber(raw), column)}%`, error: null, raw }
    case 'rating':
      return { text: '★'.repeat(Math.max(0, Math.min(5, Math.round(toNumber(raw))))), error: null, raw }
    case 'multiselect':
      return { text: (Array.isArray(raw) ? raw : [raw]).join(', '), error: null, raw }
    case 'date':
      return { text: new Date(`${raw}T00:00:00`).toLocaleDateString('pt-BR'), error: null, raw }
    case 'datetime':
      return { text: new Date(raw).toLocaleString('pt-BR'), error: null, raw }
    default:
      return { text: toText(raw), error: null, raw }
  }
}

/** Valor numérico/comparável de uma célula — usado por ordenação e resumo. */
export function comparableValue(column, row, columns, rows) {
  if (column.type === 'formula') {
    const { value, error } = evaluateFormula(row.cells?.[column.id], { columns, rows })
    return error ? null : value
  }
  return row.cells?.[column.id] ?? null
}

/* -------------------------------------------------------------------- */
/* Resumo de coluna                                                     */
/* -------------------------------------------------------------------- */

export const AGGREGATE_LABELS = {
  none: 'Nenhum',
  sum: 'Soma',
  avg: 'Média',
  min: 'Mínimo',
  max: 'Máximo',
  count: 'Contagem',
  filled: 'Preenchidas',
  empty: 'Vazias',
  percent_filled: '% preenchida',
}

export function aggregate(column, rows, columns) {
  const kind = column.aggregate ?? 'none'
  if (kind === 'none' || !rows.length) return null

  const values = rows.map((row) => comparableValue(column, row, columns, rows))
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
      const numbers = filled.map(toNumber)
      if (!numbers.length) return { label: AGGREGATE_LABELS[kind], text: '—' }
      const result =
        kind === 'sum'
          ? numbers.reduce((a, b) => a + b, 0)
          : kind === 'avg'
            ? numbers.reduce((a, b) => a + b, 0) / numbers.length
            : kind === 'min'
              ? Math.min(...numbers)
              : Math.max(...numbers)
      return { label: AGGREGATE_LABELS[kind], text: formatNumber(Math.round(result * 1e4) / 1e4, column) }
    }
  }
}

/* -------------------------------------------------------------------- */
/* Ordenação e filtro                                                   */
/* -------------------------------------------------------------------- */

export const FILTER_OPERATORS = [
  { value: 'contains', label: 'contém' },
  { value: 'not_contains', label: 'não contém' },
  { value: 'equals', label: 'é igual a' },
  { value: 'not_equals', label: 'é diferente de' },
  { value: 'gt', label: 'maior que' },
  { value: 'lt', label: 'menor que' },
  { value: 'filled', label: 'está preenchida' },
  { value: 'empty', label: 'está vazia' },
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
      const numeric = ['number', 'currency', 'percent', 'rating', 'formula'].includes(column.type)
      if (numeric) return (toNumber(va) - toNumber(vb)) * direction
      return toText(va).localeCompare(toText(vb), 'pt-BR') * direction
    })
  }

  return result
}

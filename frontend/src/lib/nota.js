/**
 * A nota como página contínua.
 *
 * No banco a nota continua uma lista de seções (`text`, `checklist`,
 * `table`, `code`), porque cada bloco guardado como DADO vale mais do que
 * desenhado no texto (ver `backend/content/schemas.py`). O que mudou é a
 * tela: ela é uma folha só, como no Word, e quem escreve não precisa do
 * mouse para criar nada. Para isso a página segue uma regra:
 *
 *   sempre há TEXTO no começo, entre dois blocos e no fim.
 *
 * É o parágrafo que o Word mantém depois de uma tabela: é onde o cursor
 * cai ao sair de um bloco, onde se digita "/" para inserir o próximo, e o
 * que torna o "clicar em Inserir checklist entre dois blocos" desnecessário.
 * Textos vizinhos viram um só, porque duas seções de texto seguidas na tela
 * são uma fronteira invisível onde a seta e o Backspace tropeçam.
 *
 * Tudo aqui é função pura sobre a lista: a tela (`NoteEditor`) chama, e
 * os testes conferem sem navegador.
 */

import { t } from './i18n.js'

const sorteio = () => Math.random().toString(36).slice(2, 9)

export const novoId = (prefixo = 's') => `${prefixo}${sorteio()}`

export const ehTexto = (secao) => (secao?.type ?? 'text') === 'text'

/** O HTML tem algo para ler ou ver? `<p><br></p>` não tem. */
export function htmlVazio(html) {
  if (!html) return true
  if (/<(img|hr|table|video|iframe)\b/i.test(html)) return false
  return !html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;|\u00a0|\u200b|\s/g, '')
}

const COMECA_COM_BLOCO = /^\s*<(p|div|h[1-6]|ul|ol|li|blockquote|pre|table|hr|figure)\b/i

/**
 * Junta dois trechos de HTML; o vazio não deixa linha em branco.
 *
 * O de baixo entra num bloco próprio quando começa com texto solto: o
 * contentEditable guarda a primeira linha sem <p>, e "antes" + "depois"
 * colados viravam "antesdepois" numa linha só. O de cima fica como está —
 * é a contagem de nós dele que diz onde fica a emenda (ver `removerBloco`).
 */
export function juntarHtml(a, b) {
  if (htmlVazio(a)) return htmlVazio(b) ? '' : b
  if (htmlVazio(b)) return a
  return a + (COMECA_COM_BLOCO.test(b) ? b : `<div>${b}</div>`)
}

/** Seção nova do tipo pedido. `texto` é o resto da linha onde o bloco nasceu. */
export function novaSecao(tipo, { texto = '', feito = false, linguagem = 'plaintext' } = {}) {
  if (tipo === 'checklist') {
    return { id: novoId(), type: 'checklist', items: [{ id: novoId('i'), text: texto, done: !!feito }] }
  }
  if (tipo === 'table') {
    // 2×2: cabeçalho e uma linha de dados, o mínimo para parecer tabela.
    return { id: novoId(), type: 'table', rows: [[texto, ''], ['', '']] }
  }
  if (tipo === 'code') {
    return { id: novoId(), type: 'code', language: linguagem, code: texto, title: '' }
  }
  return { id: novoId(), type: 'text', html: texto }
}

/**
 * A lista de seções como a página desenha: texto no começo, entre blocos e
 * no fim, e textos vizinhos fundidos.
 *
 * Roda a cada render, então os textos que ela cria têm id DETERMINÍSTICO,
 * tirado do bloco vizinho: um id sorteado aqui trocaria a `key` do editor
 * a cada tecla e o React o remontaria debaixo do cursor. Seção sem id
 * (nota gravada antes de o backend preencher) ganha um pelo mesmo motivo.
 */
export function normalizar(secoes) {
  const lista = (Array.isArray(secoes) ? secoes : []).filter((s) => s && typeof s === 'object')
  const usados = new Set(lista.map((s) => s.id).filter(Boolean))
  const livre = (base) => {
    let id = base
    for (let n = 2; usados.has(id); n += 1) id = `${base}${n}`
    usados.add(id)
    return id
  }

  const saida = []
  lista.forEach((original, posicao) => {
    const secao = original.id ? original : { ...original, id: livre(`s${posicao}`) }
    const anterior = saida[saida.length - 1]
    if (ehTexto(secao)) {
      if (anterior && ehTexto(anterior)) {
        saida[saida.length - 1] = { ...anterior, html: juntarHtml(anterior.html, secao.html) }
      } else {
        saida.push(secao.type ? secao : { ...secao, type: 'text' })
      }
      return
    }
    if (!anterior || !ehTexto(anterior)) {
      saida.push({ id: livre(`t-${secao.id}`), type: 'text', html: '' })
    }
    saida.push(secao)
  })

  const ultima = saida[saida.length - 1]
  if (!ultima || !ehTexto(ultima)) {
    saida.push({ id: livre(ultima ? `${ultima.id}-t` : 's1'), type: 'text', html: '' })
  }
  return saida
}

/**
 * O bloco entra no lugar do cursor: o texto `indice` vira "antes", o bloco,
 * e "depois". O "antes" fica com o id do texto original, para o editor
 * onde a pessoa estava não ser remontado.
 */
export function inserirBloco(pagina, indice, { antes = '', depois = '' }, bloco) {
  const atual = pagina[indice]
  return normalizar([
    ...pagina.slice(0, indice),
    { ...atual, html: antes },
    bloco,
    { id: novoId(), type: 'text', html: depois },
    ...pagina.slice(indice + 1),
  ])
}

/** Bloco logo depois da seção `indice` (cursor dentro de outro bloco). */
export function inserirDepois(pagina, indice, bloco) {
  return normalizar([...pagina.slice(0, indice + 1), bloco, ...pagina.slice(indice + 1)])
}

/** Tira a seção; os textos que ficam vizinhos viram um. */
export function removerSecao(pagina, indice) {
  return normalizar(pagina.filter((_, i) => i !== indice))
}

/**
 * Sobe ou desce um bloco uma posição.
 *
 * Linha em branco não conta como posição: entre dois blocos sempre há um
 * texto, e se ele estiver vazio o bloco "subiria" para o mesmo lugar e a
 * normalização o devolveria — o botão pareceria quebrado.
 */
export function moverBloco(pagina, indice, direcao) {
  const vazio = (j) => ehTexto(pagina[j]) && htmlVazio(pagina[j].html)
  const passo = direcao < 0 ? -1 : 1
  let alvo = indice + passo
  while (alvo >= 0 && alvo < pagina.length && vazio(alvo)) alvo += passo
  if (alvo < 0 || alvo >= pagina.length) return pagina

  const sem = pagina.filter((_, i) => i !== indice)
  // Subindo, o alvo continua no mesmo índice em `sem` e o bloco entra antes
  // dele. Descendo, o alvo recuou uma casa e o bloco entra depois dele.
  sem.splice(alvo, 0, pagina[indice])
  return normalizar(sem)
}

/** Cópia do bloco, com ids novos, logo abaixo do original. */
export function duplicarBloco(pagina, indice) {
  const original = pagina[indice]
  const copia = JSON.parse(JSON.stringify(original))
  copia.id = novoId()
  if (Array.isArray(copia.items)) copia.items = copia.items.map((item) => ({ ...item, id: novoId('i') }))
  return inserirDepois(pagina, indice, copia)
}

/**
 * Atalho de Markdown digitado no começo de uma linha.
 *
 * `antes` é o texto do começo do bloco até o cursor, com o caractere que
 * acabou de entrar. Âncora no começo de propósito: "[] " no meio de uma
 * frase é texto, não pedido de checklist.
 */
export function atalhoMarkdown(antes) {
  const s = String(antes ?? '').replace(/\u00a0/g, ' ')
  if (/^\[ ?\] $/.test(s)) return { bloco: 'checklist' }
  if (/^\[[xX]\] $/.test(s)) return { bloco: 'checklist', feito: true }
  if (s === '```') return { bloco: 'code' }
  if (/^#{1,3} $/.test(s)) return { formato: `h${s.length - 1}` }
  if (/^[-*] $/.test(s)) return { lista: 'insertUnorderedList' }
  if (/^1[.)] $/.test(s)) return { lista: 'insertOrderedList' }
  if (s === '> ') return { formato: 'blockquote' }
  return null
}

/** Linha que vira divisor quando a pessoa aperta Enter: "---", "***", "___". */
export const ehDivisor = (linha) => /^(-{3,}|\*{3,}|_{3,})$/.test(String(linha ?? '').replace(/\u00a0/g, ' ').trim())

/** O menu do "/": abre quando a barra vem no começo da linha ou depois de um espaço. */
export function consultaDaBarra(antes) {
  const m = String(antes ?? '').replace(/\u00a0/g, ' ').match(/(?:^|\s)\/([^/\n]{0,30})$/)
  return m ? m[1] : null
}

/** Os comandos do "/". O ícone de cada um mora na tela; aqui só o que filtra. */
export const COMANDOS = [
  { id: 'texto', get rotulo() { return t('Texto') }, get dica() { return t('Parágrafo comum') }, palavras: 'paragrafo normal text paragraph' },
  { id: 'h1', get rotulo() { return t('Título 1') }, get dica() { return t('Seção grande') }, palavras: 'titulo cabecalho heading title h1' },
  { id: 'h2', get rotulo() { return t('Título 2') }, get dica() { return t('Seção média') }, palavras: 'titulo subtitulo heading h2' },
  { id: 'h3', get rotulo() { return t('Título 3') }, get dica() { return t('Seção pequena') }, palavras: 'titulo heading h3' },
  { id: 'checklist', get rotulo() { return t('Checklist') }, get dica() { return t('Lista de tarefas com caixas de marcar') }, palavras: 'tarefa todo caixa marcar checkbox task' },
  { id: 'ul', get rotulo() { return t('Lista') }, get dica() { return t('Lista com marcadores') }, palavras: 'marcadores topicos bullet list' },
  { id: 'ol', get rotulo() { return t('Lista numerada') }, get dica() { return t('Lista com números') }, palavras: 'numeros ordenada ordered numbered' },
  { id: 'table', get rotulo() { return t('Tabela') }, get dica() { return t('Linhas e colunas') }, palavras: 'grade table grid' },
  { id: 'code', get rotulo() { return t('Código') }, get dica() { return t('Bloco com realce de sintaxe') }, palavras: 'codigo programacao snippet code' },
  { id: 'citacao', get rotulo() { return t('Citação') }, get dica() { return t('Trecho em destaque') }, palavras: 'citacao quote' },
  { id: 'divisor', get rotulo() { return t('Divisor') }, get dica() { return t('Linha horizontal') }, palavras: 'linha separador divider line hr' },
  { id: 'imagem', get rotulo() { return t('Imagem') }, get dica() { return t('Do computador ou do celular') }, palavras: 'foto figura image picture' },
  { id: 'link', get rotulo() { return t('Link') }, get dica() { return t('Endereço na web') }, palavras: 'url endereco site' },
  { id: 'data', get rotulo() { return t('Data de hoje') }, get dica() { return t('Escreve a data por extenso') }, palavras: 'hoje dia date today' },
]

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Filtra pelo que vem depois da barra. Começo do nome primeiro, depois
 * nome contendo, depois sinônimo: "/tab" acha Tabela antes de qualquer
 * coisa que só tenha "tab" no meio.
 */
export function filtrarComandos(consulta, comandos = COMANDOS) {
  const q = semAcento(consulta).trim()
  if (!q) return comandos
  const nota = (c) => {
    const rotulo = semAcento(c.rotulo)
    if (rotulo.startsWith(q)) return 0
    if (rotulo.includes(q)) return 1
    if (semAcento(c.palavras).split(' ').some((p) => p.startsWith(q))) return 2
    return -1
  }
  return comandos
    .map((c) => [c, nota(c)])
    .filter(([, n]) => n >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([c]) => c)
}

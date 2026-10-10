/**
 * O cursor dentro de um `contentEditable`: onde está e como movê-lo.
 *
 * A nota é uma página feita de vários editores (um por trecho de texto,
 * mais os blocos). Para a pessoa não sentir as emendas, a seta que chega
 * na última linha de um trecho precisa saltar para o próximo, o Backspace
 * no começo precisa voltar para o anterior e o bloco inserido pelo "/"
 * precisa nascer exatamente onde o cursor estava. Tudo isso pergunta ao
 * DOM onde o cursor está — e é isso que mora aqui.
 */

const BLOCOS = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE)$/

function selecaoDentro(editor) {
  const sel = window.getSelection()
  if (!editor || !sel || sel.rangeCount === 0) return null
  return editor.contains(sel.anchorNode) ? sel : null
}

/** Parágrafo, título ou item de lista onde o cursor está. */
export function blocoDoCursor(editor) {
  const sel = selecaoDentro(editor)
  if (!sel) return null
  for (let no = sel.anchorNode; no && no !== editor; no = no.parentNode) {
    if (no.nodeType === 1 && BLOCOS.test(no.tagName)) return no
  }
  return editor
}

/** Texto do começo do bloco até o cursor. `null` com seleção estendida. */
export function textoAntesDoCursor(editor) {
  const sel = selecaoDentro(editor)
  if (!sel || !sel.isCollapsed) return null
  const bloco = blocoDoCursor(editor)
  const intervalo = document.createRange()
  intervalo.setStart(bloco, 0)
  intervalo.setEnd(sel.anchorNode, sel.anchorOffset)
  return intervalo.toString().replace(/\u00a0/g, ' ')
}

/** Texto inteiro do bloco onde o cursor está. */
export function textoDoBloco(editor) {
  const bloco = blocoDoCursor(editor)
  return bloco ? (bloco.textContent || '').replace(/\u00a0/g, ' ') : ''
}

const temMidia = (intervalo) => !!intervalo.cloneContents().querySelector?.('img, hr, table')

/** Nada antes do cursor, nem texto nem imagem? */
export function cursorNoInicio(editor) {
  const sel = selecaoDentro(editor)
  if (!sel || !sel.isCollapsed) return false
  const intervalo = document.createRange()
  intervalo.setStart(editor, 0)
  intervalo.setEnd(sel.anchorNode, sel.anchorOffset)
  return !intervalo.toString().replace(/\u200b/g, '') && !temMidia(intervalo)
}

/** Retângulo do cursor na tela. Num bloco vazio o navegador devolve zero, e vale o do bloco. */
export function retanguloDoCursor(editor) {
  const sel = selecaoDentro(editor)
  if (!sel) return editor?.getBoundingClientRect() ?? null
  const intervalo = sel.getRangeAt(0).cloneRange()
  intervalo.collapse(false)
  const caixas = intervalo.getClientRects()
  if (caixas.length) return caixas[caixas.length - 1]
  const bloco = blocoDoCursor(editor) ?? editor
  return bloco.getBoundingClientRect()
}

/** Caixa da primeira (ou última) linha com conteúdo do editor. */
function caixaDaPonta(editor, ultima) {
  const percurso = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (no) =>
      (no.nodeType === 3 && no.textContent.replace(/[\s\u200b]/g, '')) ||
      (no.nodeType === 1 && /^(IMG|HR|BR)$/.test(no.tagName))
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  })
  let alvo = null
  if (ultima) {
    while (percurso.nextNode()) alvo = percurso.currentNode
  } else {
    alvo = percurso.nextNode()
  }
  if (!alvo) return null
  if (alvo.nodeType === 1) return alvo.getBoundingClientRect()
  const intervalo = document.createRange()
  const texto = alvo.textContent
  if (ultima) {
    intervalo.setStart(alvo, Math.max(0, texto.length - 1))
    intervalo.setEnd(alvo, texto.length)
  } else {
    intervalo.setStart(alvo, 0)
    intervalo.setEnd(alvo, Math.min(1, texto.length))
  }
  const caixas = intervalo.getClientRects()
  return caixas.length ? caixas[ultima ? caixas.length - 1 : 0] : intervalo.getBoundingClientRect()
}

const meio = (caixa) => (caixa.top + caixa.bottom) / 2

/** O cursor está na primeira linha? (seta para cima sairia do trecho) */
export function cursorNaPrimeiraLinha(editor) {
  const sel = selecaoDentro(editor)
  if (!sel || !sel.isCollapsed) return false
  const primeira = caixaDaPonta(editor, false)
  if (!primeira) return true
  const cursor = retanguloDoCursor(editor)
  return meio(cursor) < primeira.bottom
}

/** O cursor está na última linha? (seta para baixo sairia do trecho) */
export function cursorNaUltimaLinha(editor) {
  const sel = selecaoDentro(editor)
  if (!sel || !sel.isCollapsed) return false
  const ultima = caixaDaPonta(editor, true)
  if (!ultima) return true
  const cursor = retanguloDoCursor(editor)
  return meio(cursor) > ultima.top
}

const VAZIOS = /^(IMG|BR|HR|INPUT)$/

/** O ponto mais fundo no começo (ou no fim) de um nó: é ali que o texto digitado entra. */
function pontaProfunda(no, fim) {
  let atual = no
  for (;;) {
    const filho = fim ? atual.lastChild : atual.firstChild
    if (!filho) break
    if (filho.nodeType === 1 && VAZIOS.test(filho.tagName)) {
      // Antes do <br> final de um parágrafo, e não depois dele: depois do
      // <br> o texto cairia numa linha nova.
      const posicao = [...atual.childNodes].indexOf(filho)
      return [atual, fim && filho.tagName === 'BR' ? posicao : fim ? posicao + 1 : posicao]
    }
    if (filho.nodeType === 3) return [filho, fim ? filho.textContent.length : 0]
    atual = filho
  }
  return [atual, fim ? atual.childNodes.length : 0]
}

/**
 * Põe o cursor no começo, no fim, ou na emenda depois do n-ésimo filho do
 * editor (`{ no: n }`, quando dois trechos viraram um).
 */
export function posicionarCursor(editor, onde = 'fim') {
  if (!editor) return
  editor.focus({ preventScroll: true })
  let alvo = editor
  let fim = onde !== 'inicio'
  if (typeof onde === 'object' && onde && Number.isInteger(onde.no)) {
    const n = Math.min(onde.no, editor.childNodes.length)
    alvo = n > 0 ? editor.childNodes[n - 1] : editor
    fim = n > 0
  }
  const [no, offset] = alvo.nodeType === 3 ? [alvo, fim ? alvo.textContent.length : 0] : pontaProfunda(alvo, fim)
  const intervalo = document.createRange()
  intervalo.setStart(no, offset)
  intervalo.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(intervalo)
  const elemento = no.nodeType === 1 ? no : no.parentElement
  elemento?.scrollIntoView?.({ block: 'nearest' })
}

const ehVazio = (no) =>
  !(no.textContent || '').replace(/[\s\u00a0\u200b]/g, '') &&
  !(no.nodeType === 1 && (/^(IMG|HR)$/.test(no.tagName) || no.querySelector?.('img, hr')))

/**
 * Tira do fragmento a linha onde o cursor estava: o texto solto antes do
 * primeiro bloco, ou o primeiro bloco (o parágrafo cortado ao meio), ou o
 * primeiro item de uma lista — achatar a lista inteira numa linha só
 * misturaria os itens.
 */
function tirarPrimeiraLinha(caixa) {
  let linha = ''
  while (caixa.firstChild) {
    const no = caixa.firstChild
    if (no.nodeType === 1 && /^(UL|OL)$/.test(no.tagName)) {
      if (!linha) {
        const item = no.querySelector('li')
        if (item) {
          linha = item.textContent || ''
          item.remove()
        }
        if (!no.querySelector('li')) no.remove()
      }
      break
    }
    if (no.nodeType === 1 && BLOCOS.test(no.tagName)) {
      if (!linha) {
        linha = no.textContent || ''
        no.remove()
      }
      break
    }
    linha += no.textContent || ''
    no.remove()
  }
  return linha
}

/**
 * Corta o editor no cursor.
 *
 * Devolve o HTML de antes (que fica no editor), o texto do resto da linha
 * (que vira o conteúdo do bloco novo: "[] comprar pão" vira um item
 * "comprar pão") e o HTML das linhas seguintes (que vira o texto depois
 * do bloco). Sem cursor dentro do editor, corta no fim.
 */
export function cortarNoCursor(editor) {
  const sel = selecaoDentro(editor)
  const resto = document.createRange()
  if (sel) {
    const atual = sel.getRangeAt(0)
    resto.setStart(atual.endContainer, atual.endOffset)
  } else {
    resto.setStart(editor, editor.childNodes.length)
  }
  resto.setEnd(editor, editor.childNodes.length)
  const fragmento = resto.extractContents()

  const caixa = document.createElement('div')
  caixa.appendChild(fragmento)
  const linha = tirarPrimeiraLinha(caixa)

  // O que sobrou vazio no fim do editor (o <p> que perdeu todo o texto)
  // viraria uma linha em branco antes do bloco.
  while (editor.lastChild && ehVazio(editor.lastChild)) editor.lastChild.remove()

  const depois = [...caixa.childNodes].every(ehVazio) ? '' : caixa.innerHTML
  return {
    antes: editor.innerHTML,
    linha: linha.replace(/\u00a0/g, ' ').replace(/\u200b/g, '').trim(),
    depois,
  }
}

/** Quantos filhos de topo o HTML tem: o ponto de emenda depois de juntar dois trechos. */
export function contarNos(html) {
  if (!html) return 0
  const modelo = document.createElement('template')
  modelo.innerHTML = html
  return modelo.content.childNodes.length
}

/** O que segura o cursor dentro de um trecho ainda vazio (ver `estiloNoCursor`). */
export const MARCADOR = '​'

/**
 * Fonte ou tamanho com o cursor parado (nada selecionado): valem para o que
 * for digitado a seguir, como no Word.
 *
 * O `execCommand` com a seleção vazia guarda o valor como "estilo de
 * digitação" e o aplica na próxima letra — e o valor era a sentinela que
 * `aplicarFonte`/`aplicarTamanho` trocam pelo nome e pelo tamanho de
 * verdade. Ela entrava literal no texto (`<font face="notefy-sentinela">`,
 * `<font size="7">`, letra gigante), com a barra ainda dizendo "Padrão" e
 * 11. Aqui o estilo vira um trecho vazio no cursor, com o cursor dentro: o
 * que se digita nasce nele, e a barra já o lê antes da primeira letra.
 */
export function estiloNoCursor(estilo) {
  const selecao = window.getSelection()
  const faixa = selecao.getRangeAt(0)
  const no = faixa.startContainer
  const pai = no.nodeType === 3 ? no.parentElement : no
  // Ainda sem letra nenhuma (só o marcador): muda o mesmo trecho em vez de
  // aninhar outro — escolher a fonte e depois o tamanho vale para os dois.
  let alvo = pai?.tagName === 'SPAN' && pai.textContent === MARCADOR ? pai : null
  if (!alvo) {
    alvo = document.createElement('span')
    alvo.textContent = MARCADOR
    faixa.insertNode(alvo)
  }
  Object.assign(alvo.style, estilo)
  faixa.setStart(alvo.firstChild, 1)
  faixa.collapse(true)
  selecao.removeAllRanges()
  selecao.addRange(faixa)
}

/**
 * Tira o marcador do texto em que a pessoa já digitou, mantendo o cursor
 * no lugar. Sem isto ele ficava: a seta esbarrava num caractere invisível.
 */
export function soltarMarcador() {
  const selecao = window.getSelection()
  const no = selecao?.anchorNode
  if (no?.nodeType !== 3 || no.data.length < 2 || !no.data.includes(MARCADOR)) return
  const antes = no.data.slice(0, selecao.anchorOffset).split(MARCADOR).length - 1
  const posicao = selecao.anchorOffset - antes
  no.data = no.data.replaceAll(MARCADOR, '')
  selecao.collapse(no, posicao)
}

/** A posição de texto sob um ponto da tela (`caretPositionFromPoint` é o padrão; o WebView2 ainda usa o outro). */
function cursorNoPonto(x, y) {
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y)
    return p && { no: p.offsetNode, offset: p.offset }
  }
  const faixa = document.caretRangeFromPoint?.(x, y)
  return faixa && { no: faixa.startContainer, offset: faixa.startOffset }
}

/**
 * O ponto de texto mais perto de um ponto da tela, entre os `editores`.
 *
 * Para quem começa a arrastar FORA do texto (a margem da folha, a mesa
 * cinza, o vão embaixo): o trecho é o que está na altura do ponteiro (ou o
 * mais próximo, acima ou abaixo de todos), e o ponto é trazido para dentro
 * dele — na margem esquerda vira o começo da linha; na direita, o fim.
 */
export function pontoNoTexto(editores, x, y) {
  let editor = null
  let menor = Infinity
  for (const el of editores) {
    const r = el.getBoundingClientRect()
    const distancia = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    if (distancia < menor) {
      menor = distancia
      editor = el
    }
  }
  if (!editor) return null
  const r = editor.getBoundingClientRect()
  const ponto = cursorNoPonto(Math.min(Math.max(x, r.left + 1), r.right - 1), Math.min(Math.max(y, r.top + 1), r.bottom - 1))
  return ponto && editor.contains(ponto.no) ? { editor, ...ponto } : null
}

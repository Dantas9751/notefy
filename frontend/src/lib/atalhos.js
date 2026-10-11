/**
 * Os atalhos do app: o que cada tecla faz, as teclas de fábrica e as que a
 * pessoa trocou em Configurações → Atalhos.
 *
 * É a fonte única de duas coisas: o painel do Ctrl+/ (que lê daqui, então
 * mostra as teclas de AGORA) e os handlers de teclado, que perguntam
 * `casa(evento, 'salvar')` em vez de comparar `e.key` com uma letra. Uma
 * tecla nova entra aqui, no grupo certo, e o handler usa o id.
 *
 * Os itens com `fixo` são só descrição: padrões de digitação (`[ ]` + Espaço),
 * Ctrl+C/Ctrl+V (a área de transferência do sistema) e teclas de navegação.
 * Não têm id, não trocam, mas aparecem na lista para ela ser a lista toda.
 *
 * Onde mora cada handler:
 * - Geral e abas: `AppLayout.jsx`, `TabBar.jsx` e `RelogioFlutuante.jsx`
 * - Editor: `DocumentEditor.jsx` e `lib/history.js`
 * - Nota: `NoteEditor.jsx` e os blocos (`ChecklistSection`, `TableSection`, `CodeSection`)
 * - Canvas e diagrama: `GraphEditor.jsx`
 * - Design: `editors/design/DesignEditor.jsx`
 * - Planilha: `SpreadsheetEditor.jsx`
 * - Barra lateral e listas: `useRenomear.jsx` (F2)
 *
 * As teclas trocadas ficam neste aparelho (localStorage), como o tema.
 */

import { t } from './i18n.js'

const CHAVE = 'notefy.atalhos'

/* -------------------------------------------------------------------- */
/* Quais atalhos existem                                                 */
/* -------------------------------------------------------------------- */

/**
 * `global`: vale em qualquer tela, então não pode dividir tecla com ninguém.
 * `livre`: o que dispensa Ctrl e Alt. `'tudo'`: as ferramentas dos quadros usam a
 * letra pura (V, R, T). `'navegacao'`: a planilha e as listas aceitam Delete, Enter,
 * setas e afins, mas não letra (que seria digitar). Os demais exigem Ctrl ou Alt.
 */
export const GRUPOS = [
  {
    id: 'geral',
    global: true,
    get titulo() { return t('Geral') },
    itens: [
      { id: 'buscar', padrao: ['Ctrl+K'], get texto() { return t('Buscar') } },
      { id: 'laviel', padrao: ['Ctrl+J'], get texto() { return t('Abrir o Laviel') } },
      { id: 'zen', padrao: ['Ctrl+.', 'F11'], get texto() { return t('Modo zen (tela cheia; no app, F11 também)') } },
      { id: 'fecharPainel', padrao: ['Ctrl+\\'], get texto() { return t('Fechar o painel ao lado') } },
      { id: 'relogio', padrao: ['Alt+R'], get texto() { return t('Relógio flutuante (abre e fecha)') } },
      { id: 'atalhos', padrao: ['Ctrl+/'], get texto() { return t('Esta lista') } },
    ],
  },
  {
    id: 'abas',
    global: true,
    get titulo() { return t('Abas') },
    itens: [
      { id: 'fecharAba', padrao: ['Ctrl+Q'], get texto() { return t('Fechar a aba') } },
      { id: 'irParaAba', padrao: ['Alt+1'], serie: [1, 9], get texto() { return t('Ir para a aba') } },
    ],
  },
  {
    id: 'editor',
    global: true,
    get titulo() { return t('Editor') },
    itens: [
      { id: 'salvar', padrao: ['Ctrl+S'], get texto() { return t('Salvar') } },
      { id: 'desfazer', padrao: ['Ctrl+Z'], get texto() { return t('Desfazer') } },
      { id: 'refazer', padrao: ['Ctrl+Y', 'Ctrl+Shift+Z'], get texto() { return t('Refazer') } },
      { id: 'favoritar', padrao: ['Ctrl+Shift+F'], get texto() { return t('Favoritar') } },
    ],
  },
  {
    id: 'nota',
    get titulo() { return t('Nota') },
    itens: [
      { fixo: ['/'], get texto() { return t('Inserir: checklist, tabela, código, título...') } },
      { fixo: ['[ ]', 'Espaço'], get texto() { return t('Checklist') } },
      { fixo: ['#', 'Espaço'], get texto() { return t('Título (## e ### para os menores)') } },
      { fixo: ['-', 'Espaço'], get texto() { return t('Lista') } },
      { fixo: ['1.', 'Espaço'], get texto() { return t('Lista numerada') } },
      { fixo: ['```'], get texto() { return t('Bloco de código') } },
      { fixo: ['---', 'Enter'], get texto() { return t('Divisor') } },
      { id: 'nota.checklist', padrao: ['Ctrl+Shift+9'], get texto() { return t('Checklist') } },
      { id: 'nota.lista', padrao: ['Ctrl+Shift+8'], get texto() { return t('Lista') } },
      { id: 'nota.numerada', padrao: ['Ctrl+Shift+7'], get texto() { return t('Lista numerada') } },
      { id: 'nota.formato', padrao: ['Ctrl+Alt+0'], serie: [0, 3], get texto() { return t('Texto normal e títulos') } },
      { id: 'nota.sairDoBloco', padrao: ['Ctrl+Enter'], get texto() { return t('Sair do bloco para o texto (no código JavaScript ou Python, executa)') } },
      { fixo: ['Enter'], get texto() { return t('No item vazio, encerra o checklist') } },
    ],
  },
  {
    id: 'canvas',
    livre: 'tudo',
    get titulo() { return t('Canvas e diagrama') },
    itens: [
      { id: 'canvas.selecionar', padrao: ['V'], get texto() { return t('Selecionar') } },
      { id: 'canvas.area', padrao: ['A'], get texto() { return t('Selecionar área') } },
      { id: 'canvas.texto', padrao: ['T'], get texto() { return t('Texto') } },
      { id: 'canvas.caneta', padrao: ['P'], get texto() { return t('Caneta (canvas)') } },
      { id: 'canvas.marcador', padrao: ['M'], get texto() { return t('Marcador (canvas)') } },
      { id: 'canvas.destaque', padrao: ['H'], get texto() { return t('Destaque (canvas)') } },
      { id: 'canvas.borracha', padrao: ['E'], get texto() { return t('Borracha (canvas)') } },
      { id: 'canvas.retangulo', padrao: ['R'], get texto() { return t('Retângulo (canvas)') } },
      { id: 'canvas.elipse', padrao: ['O'], get texto() { return t('Elipse (canvas)') } },
      { id: 'canvas.linha', padrao: ['L'], get texto() { return t('Linha (canvas)') } },
      { fixo: ['Ctrl', 'C'], get texto() { return t('Copiar') } },
      { fixo: ['Ctrl', 'V'], get texto() { return t('Colar, inclusive imagem') } },
      { id: 'canvas.apagar', padrao: ['Delete', 'Backspace'], get texto() { return t('Apagar a seleção') } },
    ],
  },
  {
    id: 'design',
    livre: 'tudo',
    get titulo() { return t('Design') },
    itens: [
      { id: 'design.mover', padrao: ['V'], get texto() { return t('Mover') } },
      { id: 'design.mao', padrao: ['H'], get texto() { return t('Mão (arrastar a vista)') } },
      { id: 'design.frame', padrao: ['F', 'A'], get texto() { return t('Frame') } },
      { id: 'design.retangulo', padrao: ['R'], get texto() { return t('Retângulo') } },
      { id: 'design.elipse', padrao: ['O'], get texto() { return t('Elipse') } },
      { id: 'design.linha', padrao: ['L'], get texto() { return t('Linha') } },
      { id: 'design.texto', padrao: ['T'], get texto() { return t('Texto') } },
      { id: 'design.autoLayout', padrao: ['Shift+A'], get texto() { return t('Auto layout') } },
      { id: 'design.agrupar', padrao: ['Ctrl+G'], get texto() { return t('Agrupar') } },
      { id: 'design.desagrupar', padrao: ['Ctrl+Shift+G'], get texto() { return t('Desagrupar') } },
      { id: 'design.frameComSelecao', padrao: ['Ctrl+Alt+G'], get texto() { return t('Criar frame com a seleção') } },
      { id: 'design.duplicar', padrao: ['Ctrl+D'], get texto() { return t('Duplicar (Alt+arrastar também)') } },
      { id: 'design.frente', padrao: ['Ctrl+]'], get texto() { return t('Trazer para frente') } },
      { id: 'design.topo', padrao: ['Ctrl+Shift+]'], get texto() { return t('Trazer para o topo') } },
      { id: 'design.tras', padrao: ['Ctrl+['], get texto() { return t('Enviar para trás') } },
      { id: 'design.fundo', padrao: ['Ctrl+Shift+['], get texto() { return t('Enviar para o fundo') } },
      { id: 'design.alinharEsquerda', padrao: ['Alt+A'], get texto() { return t('Alinhar à esquerda') } },
      { id: 'design.alinharDireita', padrao: ['Alt+D'], get texto() { return t('Alinhar à direita') } },
      { id: 'design.alinharTopo', padrao: ['Alt+W'], get texto() { return t('Alinhar ao topo') } },
      { id: 'design.alinharBase', padrao: ['Alt+S'], get texto() { return t('Alinhar à base') } },
      { id: 'design.centralizarH', padrao: ['Alt+H'], get texto() { return t('Centralizar na horizontal') } },
      { id: 'design.centralizarV', padrao: ['Alt+V'], get texto() { return t('Centralizar na vertical') } },
      { id: 'design.entrar', padrao: ['Enter'], get texto() { return t('Entrar nos filhos; no texto, editar') } },
      { id: 'design.pai', padrao: ['Shift+Enter'], get texto() { return t('Selecionar o pai') } },
      { fixo: ['Ctrl', 'clique'], get texto() { return t('Selecionar a camada mais funda') } },
      { id: 'design.enquadrarTudo', padrao: ['Shift+1'], get texto() { return t('Enquadrar tudo') } },
      { id: 'design.enquadrarSelecao', padrao: ['Shift+2'], get texto() { return t('Enquadrar a seleção') } },
      { id: 'design.zoom100', padrao: ['Shift+0'], get texto() { return t('Zoom em 100%') } },
      { fixo: ['Espaço'], get texto() { return t('Segurar e arrastar move a vista') } },
      { id: 'design.ocultar', padrao: ['Ctrl+Shift+H'], get texto() { return t('Ocultar') } },
      { id: 'design.travar', padrao: ['Ctrl+Shift+L'], get texto() { return t('Travar') } },
    ],
  },
  {
    id: 'planilha',
    livre: 'navegacao',
    get titulo() { return t('Planilha') },
    itens: [
      { fixo: ['Enter'], get texto() { return t('Editar a célula; de novo, grava e desce') } },
      { id: 'planilha.editar', padrao: ['F2'], get texto() { return t('Editar a célula sem apagar o que tem') } },
      { fixo: ['Tab'], get texto() { return t('Grava e vai para a direita') } },
      { fixo: ['Ctrl', '↓'], get texto() { return t('Ir até a borda da planilha') } },
      { fixo: ['Shift', '↓'], get texto() { return t('Estender a seleção') } },
      { id: 'planilha.selecionarTudo', padrao: ['Ctrl+A'], get texto() { return t('Selecionar tudo') } },
      { fixo: ['Ctrl', 'C'], get texto() { return t('Copiar células') } },
      { id: 'planilha.limpar', padrao: ['Delete', 'Backspace'], get texto() { return t('Limpar células') } },
      { id: 'planilha.negrito', padrao: ['Ctrl+B'], get texto() { return t('Negrito') } },
      { id: 'planilha.italico', padrao: ['Ctrl+I'], get texto() { return t('Itálico') } },
      { id: 'planilha.sublinhado', padrao: ['Ctrl+U'], get texto() { return t('Sublinhado') } },
      { id: 'planilha.soma', padrao: ['Alt+='], get texto() { return t('Soma automática') } },
      { id: 'planilha.moeda', padrao: ['Ctrl+Shift+4'], get texto() { return t('Formato de moeda') } },
      { id: 'planilha.porcentagem', padrao: ['Ctrl+Shift+5'], get texto() { return t('Formato de porcentagem') } },
    ],
  },
  {
    id: 'lateral',
    livre: 'navegacao',
    get titulo() { return t('Barra lateral e listas') },
    itens: [
      { id: 'lateral.renomear', padrao: ['F2'], get texto() { return t('Renomear') } },
      { fixo: ['Esc'], get texto() { return t('Limpar a seleção') } },
    ],
  },
]

/** Os itens que têm id (os que trocam), por id, cada um com o grupo a que pertence. */
const ACOES = Object.fromEntries(
  GRUPOS.flatMap((grupo) => grupo.itens.filter((i) => i.id).map((item) => [item.id, { item, grupo }])),
)

export const acaoPorId = (id) => ACOES[id]?.item
export const grupoDa = (id) => ACOES[id]?.grupo
export const IDS_DE_ATALHOS = Object.keys(ACOES)

/* -------------------------------------------------------------------- */
/* Teclas: do evento para o texto "Ctrl+Shift+F"                         */
/* -------------------------------------------------------------------- */

const SO_MODIFICADOR = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified'])

/**
 * O atalho que o evento representa, no formato guardado: modificadores na
 * ordem Ctrl, Alt, Shift e a tecla (`Ctrl+Shift+F`, `Alt+R`, `F2`, `Ctrl+.`).
 * `null` quando é só um modificador apertado.
 *
 * A tecla vem do que está escrito nela (`e.key`), para valer no layout da
 * pessoa, com três exceções: dígitos e colchetes vêm de `e.code` (com Shift o
 * `key` do "9" é "(", e a tecla física é a mesma em todo layout), e letra
 * que o Alt transforma em outro caractere (Mac) volta para a letra do `code`.
 */
export function comboDoEvento(e) {
  const key = e.key
  if (!key || SO_MODIFICADOR.has(key)) return null
  const code = e.code ?? ''
  let base
  if (/^Digit\d$/.test(code)) base = code.slice(5)
  else if (code === 'BracketLeft') base = '['
  else if (code === 'BracketRight') base = ']'
  else if (/^[a-z]$/i.test(key)) base = key.toUpperCase()
  else if (/^Key[A-Z]$/.test(code)) base = code.slice(3)
  else if (key === ' ') base = 'Space'
  else if (key === '+') base = 'Plus'
  else base = key
  const modificadores = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean)
  // AltGr + número escreve ², ³, £: não é atalho (no Windows o AltGr chega como Ctrl+Alt).
  if (/^\d$/.test(base) && modificadores.includes('Ctrl') && modificadores.includes('Alt') && e.getModifierState?.('AltGraph')) return null
  return [...modificadores, base].join('+')
}

const mesmos = (a, b) => a.length === b.length && a.every((c, i) => c === b[i])
const partes = (combo) => combo.split('+')
const baseDe = (combo) => partes(combo).at(-1)
const modificadoresDe = (combo) => partes(combo).slice(0, -1)

/** Troca o dígito de um atalho em série pelo primeiro da série (Alt+3 → Alt+1). */
function normalizarSerie(combo, [primeiro, ultimo]) {
  const base = baseDe(combo)
  if (!/^\d$/.test(base) || Number(base) < primeiro || Number(base) > ultimo) return combo
  return [...modificadoresDe(combo), String(primeiro)].join('+')
}

/* -------------------------------------------------------------------- */
/* As teclas de agora: as de fábrica mais o que a pessoa trocou          */
/* -------------------------------------------------------------------- */

/** `{ [id]: ['Ctrl+K'] }` só com o que difere do padrão. */
let personalizados = {}
let versaoAtual = 0
const ouvintes = new Set()

function lerGuardado() {
  let bruto
  try {
    bruto = JSON.parse(globalThis.localStorage?.getItem(CHAVE) ?? '{}')
  } catch {
    return {}
  }
  return limpar(bruto)
}

/** Descarta o que não é mais um atalho conhecido (id removido, texto corrompido) e o que é igual ao padrão. */
function limpar(mapa) {
  const limpo = {}
  for (const [id, combos] of Object.entries(mapa ?? {})) {
    const acao = acaoPorId(id)
    if (!acao || !Array.isArray(combos) || !combos.every((c) => typeof c === 'string' && c && validar(id, c).combo === c)) continue
    if (!mesmos(combos, acao.padrao)) limpo[id] = combos
  }
  return limpo
}

/** As teclas de um atalho: as trocadas, ou as de fábrica. `mapa` é para o rascunho da tela de configuração. */
export const bindsDe = (id, mapa = personalizados) => mapa[id] ?? acaoPorId(id).padrao

/** O mapa que está valendo (cópia: a tela mexe no rascunho dela, e só `salvarBinds` muda o de verdade). */
export const bindsSalvos = () => ({ ...personalizados })

/** Troca tudo de uma vez. Salvar é a única porta: o rascunho da tela não vale até aqui. */
export function salvarBinds(mapa) {
  personalizados = limpar(mapa)
  try {
    if (Object.keys(personalizados).length) globalThis.localStorage?.setItem(CHAVE, JSON.stringify(personalizados))
    else globalThis.localStorage?.removeItem(CHAVE)
  } catch {
    // Sem armazenamento (janela privada cheia): vale até fechar o app.
  }
  versaoAtual += 1
  ouvintes.forEach((avisar) => avisar())
}

/** Para `useSyncExternalStore`: quem lista os atalhos redesenha quando eles mudam. */
export const assinar = (avisar) => {
  ouvintes.add(avisar)
  return () => ouvintes.delete(avisar)
}
export const versao = () => versaoAtual

/* -------------------------------------------------------------------- */
/* Perguntar e validar                                                   */
/* -------------------------------------------------------------------- */

/** Este evento é o atalho `id`? */
export function casa(e, id) {
  const acao = acaoPorId(id)
  const combo = acao && comboDoEvento(e)
  if (!combo) return false
  return bindsDe(id).includes(acao.serie ? normalizarSerie(combo, acao.serie) : combo)
}

/** Atalho em série (Alt+1 a 9): o número apertado, ou `null` se o evento não é o atalho. */
export function numeroDaSerie(e, id) {
  return casa(e, id) ? Number(baseDe(comboDoEvento(e))) : null
}

/** O Ctrl+W e companhia são do navegador: a página nunca os recebe, e prometer a tecla seria mentir. */
const DO_NAVEGADOR = new Set(['Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Shift+W', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Alt+F4', 'F5', 'F12'])

/**
 * Confere um atalho para a ação `id`. Devolve `{ combo }` (já no formato
 * guardado) ou `{ erro }` com o motivo, escrito para a pessoa.
 */
export function validar(id, combo) {
  const acao = acaoPorId(id)
  const grupo = grupoDa(id)
  const base = baseDe(combo)
  const modificadores = modificadoresDe(combo)
  if (!base) return { erro: t('Aperte uma tecla.') }
  if (base === 'Escape') return { erro: t('Esc cancela; escolha outra tecla.') }
  if (DO_NAVEGADOR.has(combo)) return { erro: t('O navegador usa esta combinação; escolha outra.') }
  const digita = base.length === 1 || base === 'Space' || base === 'Plus'
  const dispensa = /^F\d{1,2}$/.test(base) || grupo.livre === 'tudo' || (grupo.livre === 'navegacao' && !digita)
  if (!dispensa && !modificadores.some((m) => m === 'Ctrl' || m === 'Alt')) {
    return { erro: t('Use Ctrl ou Alt junto com a tecla.') }
  }
  if (acao.serie) {
    const [primeiro, ultimo] = acao.serie
    if (!/^\d$/.test(base) || Number(base) < primeiro || Number(base) > ultimo) {
      return { erro: t('Termine com um número de {a} a {b}.', { a: primeiro, b: ultimo }) }
    }
    return { combo: normalizarSerie(combo, acao.serie) }
  }
  return { combo }
}

/** Todas as teclas que o atalho cobre: a série Alt+1 a 9 ocupa nove. */
function ocupadas(id, combos) {
  const serie = acaoPorId(id).serie
  if (!serie) return combos
  return combos.flatMap((combo) => {
    const mods = modificadoresDe(combo)
    return Array.from({ length: serie[1] - serie[0] + 1 }, (_, i) => [...mods, String(serie[0] + i)].join('+'))
  })
}

/** Grupos que se atrapalham: o mesmo, ou um que vale em qualquer tela. */
const seAtrapalham = (a, b) => a === b || a.global || b.global

/** Outro atalho que já usa `combo` e vale ao mesmo tempo que `id`, ou `undefined`. */
export function conflitoCom(id, combo, mapa = personalizados) {
  const minhas = new Set(ocupadas(id, [combo]))
  const grupo = grupoDa(id)
  return IDS_DE_ATALHOS.find(
    (outro) => outro !== id && seAtrapalham(grupo, grupoDa(outro)) && ocupadas(outro, bindsDe(outro, mapa)).some((c) => minhas.has(c)),
  )
}

/* -------------------------------------------------------------------- */
/* Para mostrar                                                          */
/* -------------------------------------------------------------------- */

const NOMES_DE_TECLA = () => ({ Space: t('Espaço'), Plus: '+', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' })

/** `Ctrl+Shift+F` → `['Ctrl', 'Shift', 'F']`; em série, o último vira "1 a 9". */
export function teclasDoCombo(combo, serie) {
  const nomes = NOMES_DE_TECLA()
  const teclas = partes(combo).map((p) => nomes[p] ?? p)
  if (serie) teclas[teclas.length - 1] = t('{a} a {b}', { a: serie[0], b: serie[1] })
  return teclas
}

/** Teclas que são palavra, e não símbolo, e por isso mudam de idioma. */
const traduzirTecla = (tecla) => (tecla === 'Espaço' ? t('Espaço') : tecla === 'clique' ? t('clique') : tecla)

/** Os itens de um grupo prontos para listar: `{ chave, texto, combos: [[teclas]], fixo }`. */
export function itensDoGrupo(grupo, mapa = personalizados) {
  return grupo.itens.map((item) =>
    item.fixo
      ? { chave: `${item.texto}:${item.fixo.join('+')}`, texto: item.texto, fixo: true, combos: [item.fixo.map(traduzirTecla)] }
      : { chave: item.id, id: item.id, texto: item.texto, combos: bindsDe(item.id, mapa).map((c) => teclasDoCombo(c, item.serie)) },
  )
}

// Por último: ler o que foi guardado precisa de `validar`, que usa as constantes de cima.
personalizados = lerGuardado()

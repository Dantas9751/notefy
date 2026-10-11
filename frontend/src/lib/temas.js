/**
 * Temas de cor: o claro e o escuro de sempre e paletas escuras no espírito
 * dos temas de editor de código (Midnight, Dracula, Nord...).
 *
 * Um tema troca a escala de cinzas `ink` inteira (fundos, bordas, texto),
 * que o Tailwind lê de variáveis CSS (`--ink-50` a `--ink-950`, em
 * index.css). O app escuro usa as pontas de baixo como fundo (950, 900) e
 * as de cima como texto (100, 200): é isso que cada tema redefine. Os de
 * fábrica são todos escuros — o fundo do claro é `bg-white` em dezenas de
 * telas; um tema claro (só os personalizados) troca o próprio `white` do
 * Tailwind, que também é uma variável (`--white`).
 *
 * `destaque` é a cor de destaque que vem com o tema; quem escolhe o tema
 * ganha ela, e pode trocar depois em "Cor de destaque".
 *
 * Os temas PERSONALIZADOS (Aparência → Criar tema) entram no mesmo formato:
 * a pessoa escolhe sete cores (os `PAPEIS`), `escalaDosPapeis` espalha as
 * sete pela escala de doze passos, e o resto do app não sabe a diferença.
 * Um tema personalizado pode ser escuro (a escala de baixo vira os fundos,
 * como acima) ou claro (a de cima vira os fundos, e o `--white` do Tailwind
 * passa a ser a cor de fundo, já que `bg-white` é o fundo do app claro).
 * Ficam neste aparelho, como o tema escolhido.
 */

import { t } from './i18n.js'
import { misturar, normalizarHex } from './cor.js'

const PASSOS = [50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950]

export const TEMAS = [
  {
    id: 'midnight',
    nome: 'Midnight',
    destaque: '#7AA2F7',
    ink: ['#f6f8fb', '#edf0f6', '#e2e6ef', '#d3d8e6', '#b3bbd1', '#8a94b0', '#5b6789', '#3a4566', '#27314f', '#1a2340', '#111831', '#0b1020'],
  },
  {
    id: 'dracula',
    nome: 'Dracula',
    destaque: '#BD93F9',
    ink: ['#f8f8f2', '#eef0f5', '#e4e6ef', '#d6d9e8', '#b4bad6', '#8a93bd', '#6272a4', '#565a74', '#44475a', '#343746', '#282a36', '#21222c'],
  },
  {
    id: 'nord',
    nome: 'Nord',
    destaque: '#88C0D0',
    ink: ['#f6f8fa', '#eceff4', '#e3e8ef', '#d8dee9', '#c0c7d4', '#9aa3b5', '#6b7589', '#4c566a', '#434c5e', '#3b4252', '#2e3440', '#242933'],
  },
  {
    id: 'one-dark',
    nome: 'One Dark',
    destaque: '#61AFEF',
    ink: ['#f0f1f3', '#e3e5e9', '#d7dae0', '#c8ccd4', '#abb2bf', '#8b919c', '#5c6370', '#4b5263', '#3e4451', '#2f343f', '#282c34', '#1e2127'],
  },
  {
    id: 'monokai',
    nome: 'Monokai',
    destaque: '#A6E22E',
    ink: ['#f8f8f2', '#f0efe7', '#e8e6dc', '#dcdacd', '#c2bfae', '#9d998a', '#75715e', '#49483e', '#3e3d32', '#33342d', '#272822', '#1e1f1c'],
  },
  {
    id: 'solarized',
    get nome() { return t('Solarized escuro') },
    destaque: '#268BD2',
    ink: ['#fdf6e3', '#eee8d5', '#dcdfd6', '#c4cdc9', '#93a1a1', '#839496', '#586e75', '#2f5763', '#0d4553', '#073642', '#002b36', '#00212b'],
  },
]

/* -------------------------------------------------------------------- */
/* Temas personalizados                                                  */
/* -------------------------------------------------------------------- */

/** As coisas que a pessoa pinta, na ordem em que aparecem no editor. */
export const PAPEIS = [
  { id: 'fundo', get nome() { return t('Fundo') }, get dica() { return t('A página atrás de tudo.') } },
  { id: 'painel', get nome() { return t('Painéis') }, get dica() { return t('Barra lateral, cartões, menus e janelas.') } },
  { id: 'realce', get nome() { return t('Realce') }, get dica() { return t('O fundo do que está sob o mouse ou selecionado.') } },
  { id: 'borda', get nome() { return t('Bordas') }, get dica() { return t('Linhas, divisórias e contornos de campo.') } },
  { id: 'texto', get nome() { return t('Texto') }, get dica() { return t('Títulos e o texto principal.') } },
  { id: 'textoSuave', get nome() { return t('Texto suave') }, get dica() { return t('Legendas, dicas e ícones.') } },
  { id: 'destaque', get nome() { return t('Destaque') }, get dica() { return t('Botões, links e o que estiver ativo.') } },
]

/** As cores de fábrica do app, escuro e claro: o ponto de partida de um tema novo. */
export const CORES_DE_PARTIDA = {
  dark: { fundo: '#0F0E0D', painel: '#1A1816', realce: '#2A2724', borda: '#403C36', texto: '#F4F2F0', textoSuave: '#A8A29B', destaque: '#70864C' },
  light: { fundo: '#FFFFFF', painel: '#FAF9F8', realce: '#F4F2F0', borda: '#E9E6E2', texto: '#2A2724', textoSuave: '#7C766E', destaque: '#70864C' },
}

/**
 * As sete cores espalhadas pelos doze passos da escala. Os passos que a
 * pessoa não escolheu ficam no meio do caminho entre os dois vizinhos que
 * ela escolheu, então a escala continua uma rampa, e não doze cores soltas.
 */
export function escalaDosPapeis(base, c) {
  const rampa = (de, ate, passos) => passos.map((_, i) => misturar(de, ate, (i + 1) / (passos.length + 1)))
  const e = new Array(12)
  if (base === 'light') {
    // 50 painel, 100 realce, 200 borda, 500 texto suave, 800 texto.
    e[0] = c.painel
    e[1] = c.realce
    e[3] = c.borda
    e[6] = c.textoSuave
    e[9] = c.texto
    e[2] = misturar(c.realce, c.borda, 0.5)
    ;[e[4], e[5]] = rampa(c.borda, c.textoSuave, [4, 5])
    ;[e[7], e[8]] = rampa(c.textoSuave, c.texto, [7, 8])
    e[10] = misturar(c.texto, '#000000', 0.3)
    e[11] = misturar(c.texto, '#000000', 0.6)
  } else {
    // 100 texto, 400 texto suave, 700 borda, 800 realce, 900 painel, 950 fundo.
    e[1] = c.texto
    e[5] = c.textoSuave
    e[8] = c.borda
    e[9] = c.realce
    e[10] = c.painel
    e[11] = c.fundo
    e[0] = misturar(c.texto, '#FFFFFF', 0.4)
    ;[e[2], e[3], e[4]] = rampa(c.texto, c.textoSuave, [2, 3, 4])
    ;[e[6], e[7]] = rampa(c.textoSuave, c.borda, [6, 7])
  }
  return e
}

/** Do que foi guardado ao tema inteiro, no formato dos de fábrica (mais `base`, `cores` e `personalizado`). */
export function resolverPersonalizado({ id, nome, base, cores }) {
  const partida = CORES_DE_PARTIDA[base]
  const completas = Object.fromEntries(PAPEIS.map(({ id: papel }) => [papel, normalizarHex(cores?.[papel]) ?? partida[papel]]))
  return { id, nome, base, cores: completas, destaque: completas.destaque, ink: escalaDosPapeis(base, completas), personalizado: true }
}

/** As sete cores de qualquer tema, para começar um tema novo a partir dele. */
export function coresDoTema(tema) {
  if (tema.personalizado) return { ...tema.cores }
  const [texto, textoSuave, borda, realce, painel, fundo] = [1, 5, 8, 9, 10, 11].map((i) => tema.ink[i])
  return { fundo, painel, realce, borda, texto, textoSuave, destaque: tema.destaque }
}

const CHAVE_PERSONALIZADOS = 'notefy.temasPersonalizados'
const ID_PERSONALIZADO = /^custom-[a-z0-9]{3,30}$/

/** Descarta o que não presta (id inventado, base desconhecida, nome vazio) em vez de quebrar o app inteiro. */
function lerPersonalizados() {
  let bruto
  try {
    bruto = JSON.parse(globalThis.localStorage?.getItem(CHAVE_PERSONALIZADOS) ?? '[]')
  } catch {
    return []
  }
  if (!Array.isArray(bruto)) return []
  return bruto
    .filter((x) => x && ID_PERSONALIZADO.test(x.id) && (x.base === 'dark' || x.base === 'light') && typeof x.nome === 'string' && x.nome.trim())
    .map((x) => ({ id: x.id, nome: x.nome.trim().slice(0, 40), base: x.base, cores: x.cores }))
}

let guardados = []
let personalizados = []
let versaoDosTemas = 0
const ouvintes = new Set()

function definir(lista) {
  guardados = lista
  personalizados = lista.map(resolverPersonalizado)
  try {
    if (lista.length) globalThis.localStorage?.setItem(CHAVE_PERSONALIZADOS, JSON.stringify(lista))
    else globalThis.localStorage?.removeItem(CHAVE_PERSONALIZADOS)
  } catch {
    // Sem armazenamento: o tema vale até fechar o app.
  }
  versaoDosTemas += 1
  ouvintes.forEach((avisar) => avisar())
}

/** Os temas que a pessoa criou, já com a escala. */
export const temasPersonalizados = () => personalizados

/** Cria (sem `id`) ou atualiza um tema personalizado e devolve o id. */
export function salvarTemaPersonalizado({ id, nome, base, cores }) {
  const novo = { id: id ?? `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nome: nome.trim().slice(0, 40), base, cores }
  definir(guardados.some((x) => x.id === novo.id) ? guardados.map((x) => (x.id === novo.id ? novo : x)) : [...guardados, novo])
  return novo.id
}

export const apagarTemaPersonalizado = (id) => definir(guardados.filter((x) => x.id !== id))

/** Para `useSyncExternalStore`: quem lista os temas redesenha quando eles mudam. */
export const assinarTemas = (avisar) => {
  ouvintes.add(avisar)
  return () => ouvintes.delete(avisar)
}
export const versaoDeTemas = () => versaoDosTemas

/* -------------------------------------------------------------------- */
/* Aplicar                                                               */
/* -------------------------------------------------------------------- */

export const temaPorId = (id) => TEMAS.find((tema) => tema.id === id) ?? personalizados.find((tema) => tema.id === id) ?? null

/** Escuro ou claro: os de fábrica são todos escuros. */
export const baseDoTema = (tema) => tema.base ?? 'dark'

/** Fundo, painel e texto do tema como aparecem na amostra (que não sabe qual ponta da escala é qual). */
export function amostraDoTema(tema) {
  return baseDoTema(tema) === 'light'
    ? { fundo: tema.cores.fundo, painel: tema.ink[0], texto: tema.ink[9] }
    : { fundo: tema.ink[11], painel: tema.ink[10], texto: tema.ink[2] }
}

const canais = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')

/** As variáveis do tema, para uma regra `:root`. Tema desconhecido: nada (vale o padrão do index.css). */
export function cssDoTema(id) {
  const tema = temaPorId(id)
  if (!tema) return ''
  const variaveis = PASSOS.map((passo, i) => `--ink-${passo}:${canais(tema.ink[i])};`)
  // O fundo do app claro é `bg-white`: num tema claro o branco passa a ser a cor de fundo escolhida.
  if (baseDoTema(tema) === 'light') variaveis.push(`--white:${canais(tema.cores.fundo)};`)
  return `:root{${variaveis.join('')}}`
}

/** Aplica o tema na página (uma <style> própria, como a cor de destaque) e devolve o tema, ou `null` se não é de cor. */
export function aplicarTema(id) {
  let estilo = document.getElementById('notefy-tema')
  if (!estilo) {
    estilo = document.createElement('style')
    estilo.id = 'notefy-tema'
    document.head.appendChild(estilo)
  }
  estilo.textContent = cssDoTema(id)
  return temaPorId(id)
}

// Por último: resolver o que foi guardado usa as funções de cima. Não regrava: só lê.
guardados = lerPersonalizados()
personalizados = guardados.map(resolverPersonalizado)

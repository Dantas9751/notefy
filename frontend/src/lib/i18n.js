import { enUS, ptBR } from 'date-fns/locale'
import EN_US from '../locales/en-US.js'

/**
 * Tradução do app: pt-BR e en-US.
 *
 * O texto em português é a própria chave: `t('Salvar')` mostra "Salvar"
 * em pt-BR e procura "Salvar" no dicionário inglês. Assim o código
 * continua legível, o português nunca fica "sem tradução" e quem escreve
 * uma tela nova não precisa inventar nome de chave.
 *
 * `t()` é uma função comum, que funciona também fora do React (mensagens de
 * erro, avisos) sem contexto nem hook. Trocar o idioma NÃO recarrega o app:
 * `idioma` muda, o evento `notefy:idioma` faz o App redesenhar as telas, e
 * texto guardado em constante de módulo é getter (`get label() { return
 * t(...) }`), lido de novo a cada desenho.
 *
 * Plural: cada forma é uma chave. `t(n === 1 ? '1 item' : '{n} itens', { n })`.
 * Português e inglês têm as mesmas duas formas (1 e o resto), então não
 * precisa de mais nada.
 */

const CHAVE = 'notefy.idioma'

export const IDIOMAS = [
  { codigo: 'pt-BR', nome: 'Português (Brasil)' },
  { codigo: 'en-US', nome: 'English (US)' },
]

const DICIONARIOS = { 'en-US': EN_US }

function lerGuardado() {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

/**
 * O idioma na ordem: o que a pessoa escolheu, o do sistema, português.
 * Fora do navegador (os testes do Node) é sempre português, para os
 * testes não mudarem de resultado conforme a máquina.
 */
function detectar() {
  if (typeof window === 'undefined') return 'pt-BR'
  const guardado = lerGuardado()
  if (IDIOMAS.some((i) => i.codigo === guardado)) return guardado
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US'
}

export let idioma = detectar()

/** Locale do date-fns do idioma atual. */
export let localeDatas = idioma === 'en-US' ? enUS : ptBR

export function trocarIdioma(codigo) {
  try {
    localStorage.setItem(CHAVE, codigo)
  } catch {
    // Sem armazenamento, a troca vale só até fechar o app.
  }
  if (!IDIOMAS.some((i) => i.codigo === codigo) || codigo === idioma) return
  idioma = codigo
  localeDatas = codigo === 'en-US' ? enUS : ptBR
  // Em inglês o relógio de 12 horas é o esperado; só o português fixa as 24.
  document.documentElement.lang = codigo === 'pt-BR' ? 'pt-BR-u-hc-h23' : codigo
  window.dispatchEvent(new CustomEvent('notefy:idioma', { detail: codigo }))
}

function interpolar(texto, vars) {
  if (!vars) return texto
  return texto.replace(/\{(\w+)\}/g, (inteiro, nome) =>
    nome in vars ? String(vars[nome]) : inteiro,
  )
}

/**
 * O mesmo texto em português pode pedir traduções diferentes ("Média" é
 * Medium na prioridade e Average no resumo da coluna). `@@contexto` no fim
 * da chave separa os dois: o português mostra só o texto, e o dicionário
 * inglês guarda a chave inteira.
 */
const semContexto = (texto) => texto.replace(/@@[\s\S]*$/, '')

/** Traduz um texto do app para `lingua` (padrão: o idioma atual). */
export function traduzir(lingua, texto, vars) {
  const dicionario = DICIONARIOS[lingua]
  const base = semContexto(texto)
  const traduzido = dicionario?.[texto] ?? dicionario?.[base] ?? base
  return interpolar(traduzido, vars)
}

export function t(texto, vars) {
  return traduzir(idioma, texto, vars)
}

/**
 * Chaves com `{variavel}` viram expressão regular, para traduzir uma
 * mensagem que chega PRONTA do servidor ("O arquivo passa de 50 MB.") e
 * não tem como ser montada por `t()`.
 */
const padroes = new Map()

function padroesDe(lingua) {
  if (!padroes.has(lingua)) {
    const lista = []
    for (const [chave, valor] of Object.entries(DICIONARIOS[lingua] ?? {})) {
      if (!chave.includes('{')) continue
      const nomes = []
      const fonte = chave
        .split(/(\{\w+\})/)
        .map((parte) => {
          const nome = /^\{(\w+)\}$/.exec(parte)?.[1]
          if (!nome) return parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          nomes.push(nome)
          return '(.+?)'
        })
        .join('')
      lista.push({ regex: new RegExp(`^${fonte}$`), nomes, valor, fixo: chave.replace(/\{\w+\}/g, '').length })
    }
    // O padrão com mais texto fixo vem primeiro: "{lista} e {ultimo}" casa
    // com qualquer frase que tenha um " e ", e não pode ganhar de uma
    // mensagem específica.
    lista.sort((a, b) => b.fixo - a.fixo)
    padroes.set(lingua, lista)
  }
  return padroes.get(lingua)
}

/** Traduz uma mensagem vinda do servidor; a desconhecida volta como veio. */
export function traduzirMensagem(texto, lingua = idioma) {
  const dicionario = DICIONARIOS[lingua]
  if (!dicionario || typeof texto !== 'string') return texto
  if (texto in dicionario) return dicionario[texto]
  for (const { regex, nomes, valor } of padroesDe(lingua)) {
    const achado = regex.exec(texto)
    if (achado) {
      // O que casou também passa pelo dicionário: "nesta pasta" dentro de
      // "Já existe uma pasta chamada “X” nesta pasta." é texto do servidor.
      const partes = nomes.map((n, i) => [n, traduzirMensagem(achado[i + 1], lingua)])
      return interpolar(valor, Object.fromEntries(partes))
    }
  }
  return texto
}

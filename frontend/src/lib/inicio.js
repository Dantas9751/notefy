/**
 * Como a pessoa montou o Início: capa, blocos (quais, em que ordem, com
 * que largura) e o jeito de desenhar os itens.
 *
 * Fica nas preferências do servidor (`home_layout`), conferido por
 * `backend/users/inicio.py`. Aqui mora a parte que a tela precisa e que dá
 * para testar sem navegador: o padrão, a mescla do que foi salvo com os
 * blocos que existem hoje, e as capas.
 */

import { t } from './i18n.js'

/** Os blocos do Início, na ordem padrão. */
export const BLOCOS = [
  { id: 'resumo', get nome() { return t('Resumo') }, get dica() { return t('Quantos itens, pastas e tarefas abertas') }, largura: 'inteira' },
  { id: 'notas', get nome() { return t('Itens recentes e favoritos') }, get dica() { return t('O que você mexeu por último, ou o que tem estrela') }, largura: 'inteira' },
  { id: 'tarefas', get nome() { return t('Minhas tarefas') }, get dica() { return t('Tarefas abertas, para marcar ou criar sem sair daqui') }, largura: 'metade' },
  { id: 'agenda', get nome() { return t('Agenda') }, get dica() { return t('O dia, com o que está marcado nele') }, largura: 'metade' },
  { id: 'rascunho', get nome() { return t('Bloco de rascunho') }, get dica() { return t('Um papel para anotar rápido e virar nota depois') }, largura: 'metade' },
  { id: 'arquivos', get nome() { return t('Arquivos recentes') }, get dica() { return t('Imagens e documentos enviados por último') }, largura: 'metade' },
  { id: 'categorias', get nome() { return t('Categorias') }, get dica() { return t('O primeiro nível das suas pastas') }, largura: 'inteira' },
]

export const LAYOUTS_DE_ITENS = [
  { id: 'cartoes', get nome() { return t('Cartões') } },
  { id: 'pilha', get nome() { return t('Pilha') } },
  { id: 'lista', get nome() { return t('Lista') } },
]

/**
 * Capas: materiais de quem estuda, e não degradês de cartaz. Papel pautado,
 * quadriculado, lousa, kraft e o tecido de encadernação de caderno — tudo em
 * CSS (linhas e tramas finas), sem imagem nem requisição.
 *
 * `texto` é a cor da saudação por cima: escura no papel, clara no resto.
 */
const trama = (cor) =>
  `repeating-linear-gradient(0deg, rgb(255 255 255 / 0.04) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 3px), ${cor}`

export const CAPAS = [
  { id: 'acento', get nome() { return t('Cor do app') }, texto: 'claro', fundo: trama('rgb(var(--accent-700))') },
  {
    id: 'caderno',
    get nome() { return t('Caderno') },
    texto: 'escuro',
    fundo:
      'linear-gradient(90deg, transparent 56px, rgb(205 92 86 / 0.5) 56px 57px, transparent 57px), repeating-linear-gradient(180deg, transparent 0 27px, rgb(110 150 196 / 0.4) 27px 28px), #f5f6f3',
  },
  {
    id: 'quadriculado',
    get nome() { return t('Quadriculado') },
    texto: 'escuro',
    fundo:
      'repeating-linear-gradient(0deg, rgb(100 140 180 / 0.25) 0 1px, transparent 1px 20px), repeating-linear-gradient(90deg, rgb(100 140 180 / 0.25) 0 1px, transparent 1px 20px), #f3f5f6',
  },
  {
    id: 'lousa',
    get nome() { return t('Lousa') },
    texto: 'claro',
    fundo:
      'radial-gradient(ellipse at 25% 35%, rgb(255 255 255 / 0.08), transparent 55%), radial-gradient(ellipse at 80% 75%, rgb(255 255 255 / 0.05), transparent 50%), #27362e',
  },
  {
    id: 'kraft',
    get nome() { return t('Kraft') },
    texto: 'escuro',
    fundo:
      'repeating-linear-gradient(75deg, rgb(0 0 0 / 0.04) 0 2px, transparent 2px 7px), repeating-linear-gradient(-15deg, rgb(255 255 255 / 0.06) 0 1px, transparent 1px 5px), #b9925f',
  },
  { id: 'tecido-azul', get nome() { return t('Encadernação azul') }, texto: 'claro', fundo: trama('#22374f') },
  { id: 'tecido-vinho', get nome() { return t('Encadernação vinho') }, texto: 'claro', fundo: trama('#5a2329') },
  { id: 'grafite', get nome() { return t('Grafite') }, texto: 'claro', fundo: 'linear-gradient(160deg, rgb(255 255 255 / 0.07), transparent 55%), #34373a' },
]

export const CAPA_PADRAO = { tipo: 'gradiente', id: 'acento' }

/**
 * O layout que a tela usa: o salvo, completado com o que falta.
 *
 * Bloco salvo que não existe mais cai fora; bloco novo (que não existia
 * quando a pessoa montou o Início) entra no fim, visível — senão ninguém
 * descobriria que ele existe.
 */
export function layoutDoInicio(salvo) {
  const base = salvo && typeof salvo === 'object' ? salvo : {}
  const conhecidos = new Map(BLOCOS.map((b) => [b.id, b]))
  const vistos = new Set()
  const blocos = []
  for (const b of Array.isArray(base.blocos) ? base.blocos : []) {
    if (!b || !conhecidos.has(b.id) || vistos.has(b.id)) continue
    vistos.add(b.id)
    blocos.push({
      id: b.id,
      visivel: b.visivel !== false,
      largura: b.largura === 'metade' || b.largura === 'inteira' ? b.largura : conhecidos.get(b.id).largura,
    })
  }
  for (const b of BLOCOS) {
    if (!vistos.has(b.id)) blocos.push({ id: b.id, visivel: true, largura: b.largura })
  }
  return {
    capa: base.capa?.tipo ? base.capa : CAPA_PADRAO,
    blocos,
    itens: LAYOUTS_DE_ITENS.some((l) => l.id === base.itens) ? base.itens : 'cartoes',
    aba_notas: base.aba_notas === 'favoritos' ? 'favoritos' : 'recentes',
    aba_arquivos: ['imagens', 'documentos', 'todos'].includes(base.aba_arquivos) ? base.aba_arquivos : 'imagens',
  }
}

/** Sobe ou desce um bloco na ordem. */
export function moverBlocoDoInicio(blocos, id, passo) {
  const i = blocos.findIndex((b) => b.id === id)
  const j = i + passo
  if (i === -1 || j < 0 || j >= blocos.length) return blocos
  const proximos = [...blocos]
  ;[proximos[i], proximos[j]] = [proximos[j], proximos[i]]
  return proximos
}

/** Título da nota que nasce do rascunho: a primeira linha com texto, curta. */
export function tituloDoRascunho(texto) {
  const linha = String(texto ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return linha.length > 80 ? `${linha.slice(0, 77)}...` : linha
}

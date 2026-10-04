/**
 * Os modelos que vêm com o Notefy.
 *
 * Moram aqui, e não no banco, porque são texto de interface: traduzidos
 * junto com o resto do app, e iguais para todo mundo. Os que a pessoa
 * salva ("salvar como modelo") ficam no servidor, em `/api/templates/`.
 *
 * Cada modelo é uma FUNÇÃO que monta o conteúdo na hora: a data do dia
 * entra no diário e na ata, e os ids nascem novos a cada uso — dois itens
 * criados do mesmo modelo não podem dividir id de seção.
 *
 * O conteúdo segue o formato de `backend/content/schemas.py`; o teste
 * `modelos.test.mjs` confere que cada um passaria na validação de lá.
 */

import { escaparTexto } from './sanitizar.js'
import { idioma, t } from './i18n.js'

let sequencia = 0
const id = (prefixo) => `${prefixo}${Date.now().toString(36)}${(sequencia += 1).toString(36)}`

const hojeLongo = () =>
  new Date().toLocaleDateString(idioma, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const hojeCurto = () => new Date().toLocaleDateString(idioma, { day: '2-digit', month: '2-digit', year: 'numeric' })

// Pedaços de HTML a partir de texto já traduzido, sempre escapado.
const h2 = (texto) => `<h2>${escaparTexto(texto)}</h2>`
const h3 = (texto) => `<h3>${escaparTexto(texto)}</h3>`
const p = (texto = '') => (texto ? `<p>${escaparTexto(texto)}</p>` : '<p><br></p>')
const campo = (rotulo, valor = '') => `<p><strong>${escaparTexto(rotulo)}:</strong> ${escaparTexto(valor)}</p>`
const ul = (itens) => `<ul>${itens.map((i) => `<li>${i ? escaparTexto(i) : '<br>'}</li>`).join('')}</ul>`
const ol = (itens) => `<ol>${itens.map((i) => `<li>${i ? escaparTexto(i) : '<br>'}</li>`).join('')}</ol>`

const texto = (...partes) => ({ id: id('s'), type: 'text', html: partes.join('') })
const lista = (...itens) => ({
  id: id('s'),
  type: 'checklist',
  items: itens.map((textoDoItem) => ({ id: id('i'), text: textoDoItem, done: false })),
})
const tabela = (...linhas) => ({ id: id('s'), type: 'table', rows: linhas })

/** Planilha: colunas com tipo e linhas com células por id de coluna. */
function planilha(colunas, linhas) {
  const cols = colunas.map((c, i) => ({ id: `c${i + 1}`, width: 160, ...c }))
  return {
    columns: cols,
    rows: linhas.map((valores, i) => ({
      id: `r${i + 1}`,
      cells: Object.fromEntries(valores.map((v, k) => [cols[k].id, v]).filter(([, v]) => v !== '' && v != null)),
    })),
    sort: null,
    filters: [],
    frozen_columns: 1,
  }
}

export const MODELOS_PRONTOS = [
  {
    id: 'notefy:aula',
    kind: 'note',
    get nome() { return t('Anotações de aula') },
    get descricao() { return t('Disciplina, tópicos, anotações e o que revisar depois.') },
    titulo: () => t('Aula — {data}', { data: hojeCurto() }),
    dados: () => ({
      sections: [
        texto(campo(t('Disciplina')), campo(t('Professor(a)')), campo(t('Data'), hojeCurto()), h2(t('Tópicos de hoje')), ul(['', '']), h2(t('Anotações')), p()),
        lista(t('Revisar a matéria'), t('Fazer os exercícios')),
        texto(h2(t('Dúvidas para a próxima aula')), p()),
      ],
    }),
  },
  {
    id: 'notefy:reuniao',
    kind: 'note',
    get nome() { return t('Ata de reunião') },
    get descricao() { return t('Pauta, decisões e quem faz o quê até quando.') },
    titulo: () => t('Reunião — {data}', { data: hojeCurto() }),
    dados: () => ({
      sections: [
        texto(campo(t('Data'), hojeCurto()), campo(t('Participantes')), h2(t('Pauta')), ol(['', '']), h2(t('Discussão')), p(), h2(t('Decisões')), ul([''])),
        texto(h2(t('Próximos passos'))),
        tabela([t('Ação'), t('Responsável'), t('Prazo')], ['', '', ''], ['', '', '']),
        texto(h2(t('Próxima reunião')), p()),
      ],
    }),
  },
  {
    id: 'notefy:diario',
    kind: 'note',
    get nome() { return t('Diário') },
    get descricao() { return t('Uma página por dia: como foi, o que aprendeu e o que vem amanhã.') },
    titulo: () => hojeCurto(),
    dados: () => ({
      sections: [
        texto(h2(hojeLongo()), h3(t('Como estou hoje')), p(), h3(t('Três coisas boas')), ol(['', '', '']), h3(t('O que aprendi')), p(), h3(t('Prioridades de amanhã'))),
        lista('', ''),
      ],
    }),
  },
  {
    id: 'notefy:estudos',
    kind: 'note',
    get nome() { return t('Plano de estudos') },
    get descricao() { return t('Objetivo, cronograma da semana e metas para marcar.') },
    titulo: () => t('Plano de estudos'),
    dados: () => ({
      sections: [
        texto(h2(t('Objetivo')), p(), h2(t('Cronograma'))),
        tabela(
          [t('Dia'), t('Matéria'), t('Tópico'), t('Tempo')],
          [t('Segunda'), '', '', ''],
          [t('Terça'), '', '', ''],
          [t('Quarta'), '', '', ''],
          [t('Quinta'), '', '', ''],
          [t('Sexta'), '', '', ''],
        ),
        texto(h2(t('Metas da semana'))),
        lista('', '', ''),
        texto(h2(t('Revisões')), p()),
      ],
    }),
  },
  {
    id: 'notefy:tarefas',
    kind: 'note',
    get nome() { return t('Lista de tarefas') },
    get descricao() { return t('Hoje, esta semana e algum dia.') },
    titulo: () => t('Tarefas'),
    dados: () => ({
      sections: [texto(h2(t('Hoje'))), lista('', ''), texto(h2(t('Esta semana'))), lista(''), texto(h2(t('Algum dia'))), lista('')],
    }),
  },
  {
    id: 'notefy:fichamento',
    kind: 'note',
    get nome() { return t('Fichamento') },
    get descricao() { return t('Obra, ideia central, citações e o que você pensa dela.') },
    titulo: () => t('Fichamento'),
    dados: () => ({
      sections: [
        texto(
          campo(t('Obra')),
          campo(t('Autor(a)')),
          campo(t('Referência')),
          h2(t('Ideia central')),
          p(),
          h2(t('Citações')),
          `<blockquote>${escaparTexto(t('Cole aqui um trecho e a página'))}</blockquote>`,
          h2(t('Comentários')),
          p(),
        ),
      ],
    }),
  },
  {
    id: 'notefy:projeto',
    kind: 'note',
    get nome() { return t('Projeto') },
    get descricao() { return t('Resumo, objetivos, etapas com prazo e entregas.') },
    titulo: () => t('Projeto'),
    dados: () => ({
      sections: [
        texto(h2(t('Resumo')), p(), h2(t('Objetivos')), ul(['', '']), h2(t('Etapas'))),
        tabela([t('Etapa'), t('Responsável'), t('Prazo'), t('Situação')], ['', '', '', ''], ['', '', '', '']),
        texto(h2(t('Entregas'))),
        lista('', ''),
        texto(h2(t('Riscos')), p()),
      ],
    }),
  },
  {
    id: 'notefy:receita',
    kind: 'note',
    get nome() { return t('Receita') },
    get descricao() { return t('Ingredientes para marcar e o modo de preparo.') },
    titulo: () => t('Receita'),
    dados: () => ({
      sections: [
        texto(campo(t('Rende')), campo(t('Tempo')), h2(t('Ingredientes'))),
        lista('', '', ''),
        texto(h2(t('Modo de preparo')), ol(['', '', ''])),
      ],
    }),
  },
  {
    id: 'notefy:semana',
    kind: 'note',
    get nome() { return t('Planejamento semanal') },
    get descricao() { return t('Compromissos de cada dia e as metas da semana.') },
    titulo: () => t('Semana de {data}', { data: hojeCurto() }),
    dados: () => ({
      sections: [
        texto(h2(t('Semana'))),
        tabela(
          [t('Dia'), t('Compromissos'), t('Tarefas')],
          [t('Segunda'), '', ''],
          [t('Terça'), '', ''],
          [t('Quarta'), '', ''],
          [t('Quinta'), '', ''],
          [t('Sexta'), '', ''],
          [t('Sábado'), '', ''],
          [t('Domingo'), '', ''],
        ),
        texto(h2(t('Metas da semana'))),
        lista('', ''),
        texto(h2(t('Anotações')), p()),
      ],
    }),
  },
  {
    id: 'notefy:notas',
    kind: 'spreadsheet',
    get nome() { return t('Controle de notas') },
    get descricao() { return t('Disciplinas, provas e a média de cada coluna.') },
    titulo: () => t('Notas do semestre'),
    dados: () =>
      planilha(
        [
          { name: t('Disciplina'), type: 'text', width: 220 },
          { name: t('Prova 1'), type: 'number', aggregate: 'avg', width: 110 },
          { name: t('Prova 2'), type: 'number', aggregate: 'avg', width: 110 },
          { name: t('Trabalho'), type: 'number', aggregate: 'avg', width: 110 },
          { name: t('Aprovado'), type: 'checkbox', aggregate: 'percent_filled', width: 110 },
        ],
        [[''], [''], [''], ['']],
      ),
  },
  {
    id: 'notefy:orcamento',
    kind: 'spreadsheet',
    get nome() { return t('Orçamento do mês') },
    get descricao() { return t('Gastos por categoria, com total e o que já foi pago.') },
    titulo: () => t('Orçamento do mês'),
    dados: () =>
      planilha(
        [
          { name: t('Descrição'), type: 'text', width: 220 },
          { name: t('Categoria'), type: 'select', options: [t('Moradia'), t('Mercado'), t('Transporte'), t('Lazer'), t('Estudos'), t('Outros')], width: 140 },
          { name: t('Valor'), type: 'currency', currency: 'BRL', aggregate: 'sum', width: 130 },
          { name: t('Vencimento'), type: 'date', width: 130 },
          { name: t('Pago'), type: 'checkbox', aggregate: 'percent_filled', width: 90 },
        ],
        [[t('Aluguel'), t('Moradia')], [t('Mercado'), t('Mercado')], [t('Transporte'), t('Transporte')], ['']],
      ),
  },
  {
    id: 'notefy:fluxograma',
    kind: 'diagram',
    get nome() { return t('Fluxograma') },
    get descricao() { return t('Início, etapas, uma decisão e o fim, já ligados.') },
    titulo: () => t('Fluxograma'),
    dados: () => ({
      nodes: [
        { id: 'n1', type: 'terminator', x: 160, y: 40, width: 160, height: 56, text: t('Início') },
        { id: 'n2', type: 'process', x: 160, y: 150, width: 160, height: 60, text: t('Primeira etapa') },
        { id: 'n3', type: 'decision', x: 160, y: 265, width: 160, height: 90, text: t('Deu certo?') },
        { id: 'n4', type: 'process', x: 400, y: 280, width: 160, height: 60, text: t('Corrigir') },
        { id: 'n5', type: 'terminator', x: 160, y: 410, width: 160, height: 56, text: t('Fim') },
      ],
      edges: [
        { id: 'e1', type: 'flow', from: 'n1', to: 'n2' },
        { id: 'e2', type: 'flow', from: 'n2', to: 'n3' },
        { id: 'e3', type: 'flow', from: 'n3', to: 'n5', label: t('Sim') },
        { id: 'e4', type: 'flow', from: 'n3', to: 'n4', label: t('Não') },
        { id: 'e5', type: 'flow', from: 'n4', to: 'n2' },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      theme: 'system',
    }),
  },
  {
    id: 'notefy:mapa-mental',
    kind: 'canvas',
    get nome() { return t('Mapa mental') },
    get descricao() { return t('Um tema no centro e quatro ramos para começar.') },
    titulo: () => t('Mapa mental'),
    dados: () => ({
      nodes: [
        { id: 'c1', type: 'heading', x: 300, y: 220, width: 220, height: 56, text: t('Tema central') },
        { id: 'c2', type: 'sticky', x: 40, y: 60, width: 180, height: 120, text: t('Ideia 1') },
        { id: 'c3', type: 'sticky', x: 600, y: 60, width: 180, height: 120, text: t('Ideia 2') },
        { id: 'c4', type: 'sticky', x: 40, y: 340, width: 180, height: 120, text: t('Ideia 3') },
        { id: 'c5', type: 'sticky', x: 600, y: 340, width: 180, height: 120, text: t('Ideia 4') },
      ],
      edges: [
        { id: 'ce1', type: 'curve', from: 'c1', to: 'c2' },
        { id: 'ce2', type: 'curve', from: 'c1', to: 'c3' },
        { id: 'ce3', type: 'curve', from: 'c1', to: 'c4' },
        { id: 'ce4', type: 'curve', from: 'c1', to: 'c5' },
      ],
      strokes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      background: 'grid',
      theme: 'system',
    }),
  },
]

export const modeloPronto = (chave) => MODELOS_PRONTOS.find((m) => m.id === chave) ?? null

/** Primeiras palavras do conteúdo, para o cartão do modelo. */
export function resumoDoModelo(kind, dados) {
  if (kind === 'note') {
    return (dados?.sections ?? [])
      .map((s) =>
        s.type === 'checklist'
          ? (s.items ?? []).map((i) => i.text).join(' ')
          : s.type === 'table'
            ? (s.rows ?? []).flat().join(' ')
            : s.type === 'code'
              ? s.code ?? ''
              : String(s.html ?? '').replace(/<[^>]+>/g, ' '),
      )
      .join(' ')
      .replace(/&nbsp;|\s+/g, ' ')
      .trim()
  }
  if (kind === 'spreadsheet') return (dados?.columns ?? []).map((c) => c.name).join(' · ')
  return (dados?.nodes ?? []).map((n) => n.text).filter(Boolean).join(' · ')
}

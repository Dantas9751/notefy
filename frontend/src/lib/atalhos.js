/**
 * Os atalhos do app, para o painel do Ctrl+/.
 *
 * Cada linha aqui foi conferida contra o handler que a implementa. Esta
 * lista NÃO liga atalho nenhum: ela só descreve. Quem mudar uma tecla no
 * código muda aqui também, ou o painel passa a mentir, e um atalho
 * anunciado que não funciona é pior que atalho nenhum.
 *
 * Onde mora cada um:
 * - Geral e abas: `AppLayout.jsx` e `TabBar.jsx`
 * - Editor: `DocumentEditor.jsx` e `lib/history.js`
 * - Nota: `NoteEditor.jsx` e os blocos (`ChecklistSection`, `TableSection`, `CodeSection`)
 * - Canvas e diagrama: `GraphEditor.jsx`
 * - Design: `editors/design/DesignEditor.jsx`
 * - Planilha: `SpreadsheetEditor.jsx`
 * - Barra lateral e listas: `Sidebar.jsx`, `useMultiSelect.js`
 */

import { t } from './i18n.js'

export const GRUPOS_DE_ATALHOS = [
  {
    get titulo() { return t('Geral') },
    get itens() { return [
      [['Ctrl', 'K'], t('Buscar')],
      [['Ctrl', 'J'], t('Abrir o Laviel')],
      [['Ctrl', '.'], t('Modo zen (tela cheia; no app, F11 também)')],
      [['Ctrl', '\\'], t('Fechar o painel ao lado')],
      [['Ctrl', '/'], t('Esta lista')],
    ] },
  },
  {
    get titulo() { return t('Abas') },
    get itens() { return [
      [['Ctrl', 'Q'], t('Fechar a aba')],
      [['Alt', t('1 a 9')], t('Ir para a aba')],
    ] },
  },
  {
    get titulo() { return t('Editor') },
    get itens() { return [
      [['Ctrl', 'S'], t('Salvar')],
      [['Ctrl', 'Z'], t('Desfazer')],
      [['Ctrl', 'Y'], t('Refazer')],
      [['Ctrl', 'Shift', 'F'], t('Favoritar')],
    ] },
  },
  {
    get titulo() { return t('Nota') },
    get itens() { return [
      [['/'], t('Inserir: checklist, tabela, código, título...')],
      [['[ ]', t('Espaço')], t('Checklist')],
      [['#', t('Espaço')], t('Título (## e ### para os menores)')],
      [['-', t('Espaço')], t('Lista')],
      [['1.', t('Espaço')], t('Lista numerada')],
      [['```'], t('Bloco de código')],
      [['---', 'Enter'], t('Divisor')],
      [['Ctrl', 'Shift', '9'], t('Checklist')],
      [['Ctrl', 'Shift', '8'], t('Lista')],
      [['Ctrl', 'Shift', '7'], t('Lista numerada')],
      [['Ctrl', 'Alt', t('0 a 3')], t('Texto normal e títulos')],
      [['Ctrl', 'Enter'], t('Sair do bloco para o texto')],
      [['Ctrl', 'Enter'], t('No código JavaScript ou Python, executa (Esc sai)')],
      [['Enter'], t('No item vazio, encerra o checklist')],
    ] },
  },
  {
    get titulo() { return t('Canvas e diagrama') },
    get itens() { return [
      [['V'], t('Selecionar')],
      [['A'], t('Selecionar área')],
      [['T'], t('Texto')],
      [['P', 'M', 'H'], t('Caneta, marcador, destaque (canvas)')],
      [['E'], t('Borracha (canvas)')],
      [['R', 'O', 'L'], t('Retângulo, elipse, linha (canvas)')],
      [['Ctrl', 'C'], t('Copiar')],
      [['Ctrl', 'V'], t('Colar, inclusive imagem')],
      [['Delete'], t('Apagar a seleção')],
    ] },
  },
  {
    get titulo() { return t('Design') },
    get itens() { return [
      [['V', 'H'], t('Mover, mão')],
      [['F', 'R', 'O', 'L', 'T'], t('Frame, retângulo, elipse, linha, texto')],
      [['Shift', 'A'], t('Auto layout')],
      [['Ctrl', 'G'], t('Agrupar (com Shift: desagrupar)')],
      [['Ctrl', 'Alt', 'G'], t('Criar frame com a seleção')],
      [['Ctrl', 'D'], t('Duplicar (Alt+arrastar também)')],
      [['Ctrl', ']'], t('Trazer para frente (com Shift: para o topo)')],
      [['Alt', 'A'], t('Alinhar à esquerda (D, W, S, H, V: os outros lados)')],
      [['Enter'], t('Entrar nos filhos; no texto, editar')],
      [['Shift', 'Enter'], t('Selecionar o pai')],
      [['Ctrl', t('clique')], t('Selecionar a camada mais funda')],
      [['Shift', '1'], t('Enquadrar tudo (2: a seleção, 0: 100%)')],
      [['Espaço'], t('Segurar e arrastar move a vista')],
      [['Ctrl', 'Shift', 'H'], t('Ocultar (L: travar)')],
    ] },
  },
  {
    get titulo() { return t('Planilha') },
    get itens() { return [
      [['Enter'], t('Editar a célula; de novo, grava e desce')],
      [['F2'], t('Editar a célula sem apagar o que tem')],
      [['Tab'], t('Grava e vai para a direita')],
      [['Ctrl', '↓'], t('Ir até a borda da planilha')],
      [['Shift', '↓'], t('Estender a seleção')],
      [['Ctrl', 'A'], t('Selecionar tudo')],
      [['Ctrl', 'C'], t('Copiar células')],
      [['Delete'], t('Limpar células')],
      [['Ctrl', 'B'], t('Negrito (também I e U)')],
      [['Alt', '='], t('Soma automática')],
      [['Ctrl', 'Shift', '$'], t('Formato de moeda (% para porcentagem)')],
    ] },
  },
  {
    get titulo() { return t('Barra lateral e listas') },
    get itens() { return [
      [['F2'], t('Renomear')],
      [['Esc'], t('Limpar a seleção')],
    ] },
  },
]

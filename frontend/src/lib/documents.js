import {
  CalendarDays,
  Clock,
  FileText,
  Folder,
  GanttChartSquare,
  Home,
  Kanban,
  LayoutDashboard,
  LayoutTemplate,
  Paperclip,
  Table2,
  Tag,
  Trash2,
  Workflow,
} from 'lucide-react'
import { t } from './i18n.js'

/**
 * Metadados de cada tipo de documento.
 *
 * Único lugar do frontend que sabe o que é uma nota, uma planilha ou um
 * canvas: ícone, rótulo, cor e rota do editor. Qualquer tela que liste
 * documentos lê daqui, então um tipo novo aparece na sidebar, nos cards,
 * nos filtros e na busca sem edição espalhada.
 */
export const DOCUMENT_KINDS = {
  note: {
    get label() { return t('Nota') },
    get plural() { return t('Notas') },
    icon: FileText,
    route: '/notes',
    accent: '#6366F1',
    get description() { return t('Texto rico para estudos e anotações.') },
  },
  spreadsheet: {
    get label() { return t('Planilha') },
    get plural() { return t('Planilhas') },
    icon: Table2,
    route: '/sheets',
    accent: '#10B981',
    get description() { return t('Tabela com fórmulas e formatação, como no Excel.') },
  },
  diagram: {
    get label() { return t('Diagrama') },
    get plural() { return t('Diagramas') },
    icon: Workflow,
    route: '/diagrams',
    accent: '#F59E0B',
    get description() { return t('Modelagem UML com formas e setas.') },
  },
  canvas: {
    get label() { return t('Canvas') },
    get plural() { return t('Canvas') },
    icon: LayoutDashboard,
    route: '/canvas',
    accent: '#EC4899',
    get description() { return t('Quadro livre para conectar ideias.') },
  },
  file: {
    get label() { return t('Arquivo') },
    get plural() { return t('Arquivos') },
    icon: Paperclip,
    route: '/files',
    accent: '#64748B',
    get description() { return t('PDF, imagem, áudio e outros anexos.') },
  },
}

/** Tipos que o usuário cria dentro do app (arquivo entra por upload). */
export const CREATABLE_KINDS = ['note', 'spreadsheet', 'diagram', 'canvas']

/**
 * Metadados das páginas que abrem como aba: dashboard, categoria, pasta e
 * as telas de gestão (quadro, calendário, recentes...). O `TabBar` usa
 * isto para desenhar a aba com o ícone certo — antes de existirem, abrir
 * uma categoria como aba mostrava o ícone de nota, porque o kind não
 * existia no mapa de documentos.
 */
export const PAGE_KINDS = {
  home: {
    get label() { return t('Início') },
    icon: Home,
    route: '/',
    accent: '#6366F1',
  },
  category: {
    get label() { return t('Categoria') },
    icon: Tag,
    route: '/categories',
    accent: '#8B5CF6',
  },
  folder: {
    get label() { return t('Pasta') },
    icon: Folder,
    route: '/folders',
    accent: '#F59E0B',
  },
  board: {
    get label() { return t('Quadro') },
    icon: Kanban,
    route: '/board',
    accent: '#10B981',
  },
  calendar: {
    get label() { return t('Calendário') },
    icon: CalendarDays,
    route: '/calendar',
    accent: '#EC4899',
  },
  recent: {
    get label() { return t('Recentes') },
    icon: Clock,
    route: '/recent',
    accent: '#0EA5E9',
  },
  trash: {
    get label() { return t('Lixeira') },
    icon: Trash2,
    route: '/trash',
    accent: '#64748B',
  },
  roadmap: {
    get label() { return t('Roadmap') },
    icon: GanttChartSquare,
    route: '/roadmap',
    accent: '#8B5CF6',
  },
  files: {
    get label() { return t('Arquivos') },
    icon: Paperclip,
    route: '/files',
    accent: '#64748B',
  },
  templates: {
    get label() { return t('Modelos') },
    icon: LayoutTemplate,
    route: '/templates',
    accent: '#0EA5E9',
  },
}

export const kindMeta = (kind) => DOCUMENT_KINDS[kind] ?? PAGE_KINDS[kind] ?? DOCUMENT_KINDS.note

/** Rota do editor de um documento. Arquivo abre em visualização. */
export function documentPath(doc) {
  return `${kindMeta(doc.kind).route}/${doc.id}`
}

export const DOCUMENT_STATUS = {
  draft: {
    get label() { return t('Rascunho') },
    className: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  },
  in_progress: {
    get label() { return t('Em progresso') },
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  done: {
    get label() { return t('Finalizado') },
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
}

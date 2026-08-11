import {
  FileText,
  LayoutDashboard,
  Paperclip,
  Table2,
  Workflow,
} from 'lucide-react'

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
    label: 'Nota',
    plural: 'Notas',
    icon: FileText,
    route: '/notes',
    accent: '#6366F1',
    description: 'Texto rico para estudos e anotações.',
  },
  spreadsheet: {
    label: 'Planilha',
    plural: 'Planilhas',
    icon: Table2,
    route: '/sheets',
    accent: '#10B981',
    description: 'Tabela com colunas tipadas e fórmulas.',
  },
  diagram: {
    label: 'Diagrama',
    plural: 'Diagramas',
    icon: Workflow,
    route: '/diagrams',
    accent: '#F59E0B',
    description: 'Modelagem UML com formas e setas.',
  },
  canvas: {
    label: 'Canvas',
    plural: 'Canvas',
    icon: LayoutDashboard,
    route: '/canvas',
    accent: '#EC4899',
    description: 'Quadro livre para conectar ideias.',
  },
  file: {
    label: 'Arquivo',
    plural: 'Arquivos',
    icon: Paperclip,
    route: '/files',
    accent: '#64748B',
    description: 'PDF, imagem, áudio e outros anexos.',
  },
}

/** Tipos que o usuário cria dentro do app (arquivo entra por upload). */
export const CREATABLE_KINDS = ['note', 'spreadsheet', 'diagram', 'canvas']

export const kindMeta = (kind) => DOCUMENT_KINDS[kind] ?? DOCUMENT_KINDS.note

/** Rota do editor de um documento. Arquivo abre em visualização. */
export function documentPath(doc) {
  return `${kindMeta(doc.kind).route}/${doc.id}`
}

export const DOCUMENT_STATUS = {
  draft: {
    label: 'Rascunho',
    className: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  },
  in_progress: {
    label: 'Em progresso',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  done: {
    label: 'Finalizado',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
}

import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Junta classes condicionais. Substitui clsx para não adicionar dependência. */
export function cn(...parts) {
  return parts.flat(Infinity).filter(Boolean).join(' ')
}

export function formatDate(value, pattern = "d 'de' MMM, yyyy") {
  if (!value) return ''
  return format(new Date(value), pattern, { locale: ptBR })
}

export function formatRelative(value) {
  if (!value) return ''
  const date = new Date(value)
  if (isToday(date)) return `hoje, ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `ontem, ${format(date, 'HH:mm')}`
  if (isTomorrow(date)) return `amanhã, ${format(date, 'HH:mm')}`
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR })
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Contraste do texto sobre uma cor de fundo arbitrária.
 *
 * As categorias têm cor livre escolhida pelo usuário; sem este cálculo,
 * um badge amarelo com texto branco ficaria ilegível.
 */
export function readableTextColor(hex) {
  if (!hex) return '#1a1816'
  let color = hex.replace('#', '')
  if (color.length === 3) color = color.split('').map((c) => c + c).join('')
  const r = parseInt(color.slice(0, 2), 16)
  const g = parseInt(color.slice(2, 4), 16)
  const b = parseInt(color.slice(4, 6), 16)
  // Luminância relativa aproximada (coeficientes ITU-R BT.601).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1a1816' : '#ffffff'
}

export function hexWithAlpha(hex, alpha) {
  if (!hex) return 'transparent'
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `${hex}${a}`
}

export const NOTE_STATUS = {
  draft: { label: 'Rascunho', className: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300' },
  in_progress: { label: 'Em progresso', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  done: { label: 'Finalizado', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
}

/** Três colunas: o status é o lugar da tarefa no quadro. */
export const TASK_STATUS = {
  todo: {
    label: 'A fazer',
    className: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    accent: '#64748B',
  },
  in_progress: {
    label: 'Em progresso',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    accent: '#0EA5E9',
  },
  done: {
    label: 'Concluída',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    accent: '#10B981',
  },
}

export const TASK_PRIORITY = {
  0: { label: 'Baixa', className: 'text-ink-400' },
  1: { label: 'Média', className: 'text-blue-500' },
  2: { label: 'Alta', className: 'text-amber-500' },
  3: { label: 'Urgente', className: 'text-red-500' },
}

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

/**
 * Remove o raciocínio interno dos modelos "thinking".
 *
 * Modelos de raciocínio devolvem `<think>...</think>` dentro do próprio
 * conteúdo. Isso é rascunho do modelo, não resposta: aparecia no chat e
 * ia parar dentro da nota do usuário.
 *
 * A tag ABERTA sem fechamento também some: durante o streaming ela chega
 * primeiro, e mostrar o rascunho "até fechar a tag" é pior do que esperar.
 */
export function removerThink(texto) {
  if (!texto) return texto
  return texto
    // Bloco fechado, inclusive vazio e multilinha.
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Abertura órfã: o que vem depois ainda é raciocínio.
    .replace(/<think>[\s\S]*$/i, '')
    // Fechamento órfão (o bloco começou antes do pedaço que chegou).
    .replace(/^[\s\S]*?<\/think>/i, '')
    .trim()
}

/**
 * Remove formatação markdown do texto de IA.
 *
 * O Notefy não renderiza markdown no chat — os símbolos aparecem como
 * lixo visual. Esta função aplica o que deveria ser o comportamento do
 * modelo (que costuma ignorar a instrução de não usar markdown).
 */
export function limparMarkdown(texto) {
  if (!texto) return texto
  return (
    removerThink(texto)
      // Bloco de código: ```linguagem\n...\n```
      .replace(/```[\s\S]*?```/g, (bloco) => bloco.replace(/```\w*\n?/g, '').replace(/```/g, '').trim())
      // Código inline: `código`
      .replace(/`([^`\n]+)`/g, '$1')
      // Negrito/itálico misto: ***algo*** ou **_algo_**
      .replace(/\*{3}[_*]*([^*_]+)[_*]*\*{3}/g, '$1')
      // Negrito: **algo** ou __algo__
      .replace(/\*{2}([^*\n]+)\*{2}/g, '$1')
      .replace(/__([^_\n]+)__/g, '$1')
      // Itálico: *algo* ou _algo_
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
      // Títulos: ### Título ou # Título
      .replace(/^#{1,6}\s+/gm, '')
      // Citação: > texto
      .replace(/^>\s*/gm, '')
      // Horizontal rule: --- ou *** ou ___
      .replace(/^[\-*_]{3,}\s*$/gm, '')
      // Imagem: ![alt](url) — remove inteira
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // Link: [texto](url) → só o texto
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Tachado: ~~algo~~
      .replace(/~~([^~]+)~~/g, '$1')
      // Lista marcada com - no início da linha → mantém o texto, sem o traço
      .replace(/^[-*+]\s+/gm, '')
      // Listas numéricas: garante que "1. texto" vira "1. texto" (ok)
      // Espaços extras entre linhas: no máximo uma linha em branco
      .replace(/\n{3,}/g, '\n\n')
      // Caracteres de outros alfabetos soltos (chinês, japonês, etc.)
      // que o modelo injeta por alucinação. Remove sequências de 2+
      // caracteres não-latinos (mantém acentos como é, ñ, ç).
      .replace(/[^\x00-\x7F\u00C0-\u024F\s]{2,}/g, '')
      .trim()
  )
}

/**
 * Paleta oferecida por qualquer coisa que o usuário possa colorir.
 *
 * Uma lista só: com uma cópia por modal, quadro e pasta não ofereciam o
 * mesmo conjunto e a mesma cor tinha nomes diferentes em telas diferentes.
 * Quem aceita "sem cor" usa `['', ...PRESET_COLORS]`.
 */
export const PRESET_COLORS = [
  '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#8B5CF6', '#64748B',
]

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

import {
  CalendarDays,
  Clock,
  GanttChartSquare,
  Home,
  Kanban,
  LayoutTemplate,
  Lightbulb,
  Paperclip,
  Search,
  Star,
  Timer,
  Trash2,
} from 'lucide-react'
import { t } from '@/lib/i18n'

/**
 * O que a barra lateral desenha para cada id de `lib/barraLateral`: a barra
 * e a janela de personalizá-la leem daqui, e um atalho novo nasce num lugar só.
 */

// Favoritos não é atalho: a seção mais abaixo JÁ É a lista, e um item de
// navegação levaria a uma tela com os mesmos nomes que já estão à vista.
export const ATALHOS = {
  inicio: { to: '/', get label() { return t('Início') }, icon: Home, end: true },
  recentes: { to: '/recent', get label() { return t('Recentes') }, icon: Clock },
  arquivos: { to: '/files', get label() { return t('Arquivos') }, icon: Paperclip },
  buscar: { to: '/search', get label() { return t('Buscar') }, icon: Search },
  quadro: { to: '/board', get label() { return t('Quadro') }, icon: Kanban },
  calendario: { to: '/calendar', get label() { return t('Calendário') }, icon: CalendarDays },
  roadmap: { to: '/roadmap', get label() { return t('Roadmap') }, icon: GanttChartSquare },
  modelos: { to: '/templates', get label() { return t('Modelos') }, icon: LayoutTemplate },
  lixeira: { to: '/trash', get label() { return t('Lixeira') }, icon: Trash2 },
}

export const SECOES = {
  favoritos: { get label() { return t('Favoritos') }, icon: Star },
  estudo: { get label() { return t('Tempo de estudo') }, icon: Timer },
  dica: { get label() { return t('Dica de uso') }, icon: Lightbulb },
}

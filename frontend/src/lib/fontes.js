/**
 * As fontes que a pessoa escolhe em Aparência: a do app e a das notas.
 *
 * Só pilhas do sistema, como o resto do app (ver `tailwind.config.js`):
 * nenhuma fonte baixada, então o desktop sem internet e o Android desenham
 * igual. Candara/Corbel vêm com o Windows; no Android cada pilha cai na fonte
 * do sistema do mesmo estilo.
 *
 * Valem por CSS: `--fonte-app` (o `font-sans` do Tailwind) e `--fonte-nota`
 * (a folha da nota). Quem aplica é o `UIContext`.
 */

import { t } from './i18n.js'

const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
const HUMANISTA = "Candara, Corbel, 'Segoe UI', 'Trebuchet MS', Roboto, sans-serif"
const SERIFADA = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Noto Serif', serif"
const GEORGIA = "Georgia, Cambria, 'Noto Serif', serif"
const MONO = "'JetBrains Mono', Consolas, 'SFMono-Regular', Menlo, monospace"

export const FONTES_DO_APP = [
  { id: 'padrao', get nome() { return t('Padrão') }, pilha: SANS },
  { id: 'humanista', get nome() { return t('Humanista') }, pilha: HUMANISTA },
  { id: 'serifada', get nome() { return t('Serifada') }, pilha: SERIFADA },
]

export const FONTES_DA_NOTA = [
  { id: 'app', get nome() { return t('A mesma do app') }, pilha: 'var(--fonte-app)' },
  { id: 'serifada', get nome() { return t('Serifada') }, pilha: SERIFADA },
  { id: 'georgia', nome: 'Georgia', pilha: GEORGIA },
  { id: 'humanista', get nome() { return t('Humanista') }, pilha: HUMANISTA },
  { id: 'mono', get nome() { return t('Monoespaçada') }, pilha: MONO },
]

/** A pilha de uma escolha guardada, com a padrão para o que não existe mais. */
export const pilha = (lista, id) => (lista.find((f) => f.id === id) ?? lista[0]).pilha

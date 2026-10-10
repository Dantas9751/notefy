/**
 * Temas de cor: o claro e o escuro de sempre e paletas escuras no espírito
 * dos temas de editor de código (Midnight, Dracula, Nord...).
 *
 * Um tema troca a escala de cinzas `ink` inteira (fundos, bordas, texto),
 * que o Tailwind lê de variáveis CSS (`--ink-50` a `--ink-950`, em
 * index.css). O app escuro usa as pontas de baixo como fundo (950, 900) e
 * as de cima como texto (100, 200): é isso que cada tema redefine. Só
 * temas escuros por enquanto — o fundo do claro é `bg-white` em dezenas de
 * telas, e um claro colorido pediria trocar todas.
 *
 * `destaque` é a cor de destaque que vem com o tema; quem escolhe o tema
 * ganha ela, e pode trocar depois em "Cor de destaque".
 */

import { t } from './i18n.js'

const PASSOS = [50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950]

export const TEMAS = [
  {
    id: 'midnight',
    nome: 'Midnight',
    destaque: '#7AA2F7',
    ink: ['#f6f8fb', '#edf0f6', '#e2e6ef', '#d3d8e6', '#b3bbd1', '#8a94b0', '#5b6789', '#3a4566', '#27314f', '#1a2340', '#111831', '#0b1020'],
  },
  {
    id: 'dracula',
    nome: 'Dracula',
    destaque: '#BD93F9',
    ink: ['#f8f8f2', '#eef0f5', '#e4e6ef', '#d6d9e8', '#b4bad6', '#8a93bd', '#6272a4', '#565a74', '#44475a', '#343746', '#282a36', '#21222c'],
  },
  {
    id: 'nord',
    nome: 'Nord',
    destaque: '#88C0D0',
    ink: ['#f6f8fa', '#eceff4', '#e3e8ef', '#d8dee9', '#c0c7d4', '#9aa3b5', '#6b7589', '#4c566a', '#434c5e', '#3b4252', '#2e3440', '#242933'],
  },
  {
    id: 'one-dark',
    nome: 'One Dark',
    destaque: '#61AFEF',
    ink: ['#f0f1f3', '#e3e5e9', '#d7dae0', '#c8ccd4', '#abb2bf', '#8b919c', '#5c6370', '#4b5263', '#3e4451', '#2f343f', '#282c34', '#1e2127'],
  },
  {
    id: 'monokai',
    nome: 'Monokai',
    destaque: '#A6E22E',
    ink: ['#f8f8f2', '#f0efe7', '#e8e6dc', '#dcdacd', '#c2bfae', '#9d998a', '#75715e', '#49483e', '#3e3d32', '#33342d', '#272822', '#1e1f1c'],
  },
  {
    id: 'solarized',
    get nome() { return t('Solarized escuro') },
    destaque: '#268BD2',
    ink: ['#fdf6e3', '#eee8d5', '#dcdfd6', '#c4cdc9', '#93a1a1', '#839496', '#586e75', '#2f5763', '#0d4553', '#073642', '#002b36', '#00212b'],
  },
]

export const temaPorId = (id) => TEMAS.find((tema) => tema.id === id) ?? null

const canais = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')

/** As variáveis do tema, para uma regra `:root`. Tema desconhecido: nada (vale o padrão do index.css). */
export function cssDoTema(id) {
  const tema = temaPorId(id)
  if (!tema) return ''
  return `:root{${PASSOS.map((passo, i) => `--ink-${passo}:${canais(tema.ink[i])};`).join('')}}`
}

/** Aplica o tema na página (uma <style> própria, como a cor de destaque) e diz se ele é escuro. */
export function aplicarTema(id) {
  let estilo = document.getElementById('notefy-tema')
  if (!estilo) {
    estilo = document.createElement('style')
    estilo.id = 'notefy-tema'
    document.head.appendChild(estilo)
  }
  estilo.textContent = cssDoTema(id)
  return !!temaPorId(id)
}

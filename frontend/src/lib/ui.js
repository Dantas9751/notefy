/**
 * Tokens de interface que o Tailwind não guarda.
 *
 * Cor, raio, sombra e fonte moram em `tailwind.config.js` e `index.css`.
 * O que sobrava sem dono — tamanho de ícone e duração de animação — vivia
 * espalhado como número solto (`size={13}`, `size={15}`, `size={16}` na
 * mesma tela), e é por isso que a Busca e o Início não pareciam o mesmo
 * aplicativo.
 */

/**
 * Escala de ícone. Três degraus, não sete: cada tamanho extra é uma
 * decisão nova em cada tela, e é assim que 13, 14, 15 e 16 acabam
 * convivendo na mesma lista.
 *
 * O TRAÇO é único e mora no CSS (`svg.lucide`, em index.css) — repetir
 * `strokeWidth` em 43 arquivos divergiria de novo na primeira pressa.
 */
export const ICONE = {
  /** Dentro de texto corrido, chip, metadado. */
  sm: 13,
  /** Padrão: menu, botão, item de lista, navegação. */
  md: 15,
  /** Cabeçalho de página e estado vazio. */
  lg: 18,
}

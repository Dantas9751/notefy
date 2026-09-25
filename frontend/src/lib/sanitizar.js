import DOMPurify from 'dompurify'

/**
 * Limpa o HTML de uma nota antes de ele entrar no DOM.
 *
 * O corpo de uma nota é HTML e vai para a tela por `innerHTML` (é um
 * `contentEditable`, não há como fugir disso). O backend guarda esse
 * campo sem tocar nele — `_validate_note` só confere que é `str` — então
 * qualquer coisa que chegue ao `data.sections[].html` é executada na
 * próxima vez que a nota abrir. E o token JWT mora no `localStorage`,
 * então script injetado ali lê a sessão inteira.
 *
 * Três caminhos levam HTML de fora para dentro desse campo:
 *
 * - **Importar backup.** O .zip vem de qualquer lugar e recria as notas
 *   direto no banco. É o caminho de atacante para vítima mais direto.
 * - **A IA.** O endereço do provedor é escolhido pelo usuário
 *   (`ai_base_url`), então a resposta vem de um servidor que o app não
 *   controla — e `DocumentEditor` montava `<p>${resposta}</p>` sem
 *   escapar nada.
 * - **Colar** de uma página web dentro do editor.
 *
 * Por que DOMPurify e não algo escrito aqui
 * -----------------------------------------
 * O projeto evita dependência nova por princípio, e esta é uma exceção
 * deliberada. Higienizar HTML à mão é um dos jeitos mais conhecidos de
 * publicar uma falha sem perceber: mXSS, confusão de namespace,
 * `<noscript>`, `<template>` e uma lista longa de casos que só aparecem
 * quando alguém procura. O `html5lib` já instalado (vem do xhtml2pdf)
 * tem um sanitizador, mas o próprio módulo dele se declara DEPRECIADO e
 * recomenda não depender dele.
 *
 * A configuração é a PADRÃO do DOMPurify, de propósito: ela já permite
 * o HTML de texto rico que a barra do editor gera (`<font color>`,
 * `style` de alinhamento, listas, links, imagens) e já remove `<script>`,
 * todo atributo `on*` e URLs `javascript:`. Uma lista de permitidos
 * própria quebraria formatação e viraria dívida para manter.
 */
export function limparHtml(html) {
  if (!html) return ''
  return DOMPurify.sanitize(String(html))
}

/**
 * Texto puro -> HTML seguro, para quando se MONTA markup com um texto
 * que veio de fora.
 *
 * `DocumentEditor` fazia `` `<p>${resposta}</p>` `` com a saída da IA.
 * O `merge.js`, que faz a mesma coisa no caminho vizinho, já escapava —
 * eram dois lugares construindo o mesmo HTML com regras diferentes.
 */
export function escaparTexto(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

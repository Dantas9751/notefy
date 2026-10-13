/**
 * Tamanho, densidade e leitura das notas: as escolhas de Aparência que mexem
 * no espaço, e não na cor.
 *
 * São do APARELHO (localStorage, no `UIContext`), como o tema e as fontes:
 * o monitor grande de casa e o notebook pedem coisas diferentes da mesma
 * pessoa. A leitura de uma nota em particular é da nota (`data.leitura`) e
 * vale por cima do padrão daqui.
 */

import { t } from './i18n.js'

/** Tamanho da interface, em %: o zoom da janela, como o Ctrl + do navegador. */
export const TAMANHOS = [90, 100, 110, 125]
export const TAMANHO_PADRAO = 100

export const DENSIDADES = ['confortavel', 'compacta']

/** Largura da folha da nota. A média é a de antes: uma página A4 na tela. */
export const LARGURAS_DA_FOLHA = { estreita: '680px', media: '816px', inteira: 'none' }
export const ENTRELINHAS = { compacta: 1.5, normal: 1.75, ampla: 2.05 }
export const LEITURA_PADRAO = { largura: 'media', entrelinha: 'normal' }

/** Os nomes de cada opção, na ordem em que aparecem (Aparência e o "Leitura" da nota). */
export const NOMES_DAS_LARGURAS = {
  get estreita() { return t('Estreita') },
  get media() { return t('Média') },
  get inteira() { return t('Inteira') },
}
export const NOMES_DAS_ENTRELINHAS = {
  get compacta() { return t('Compacto') },
  get normal() { return t('Normal') },
  get ampla() { return t('Amplo') },
}

/** Um valor da lista, ou o padrão: o que vem do disco pode ser qualquer coisa. */
export const umDe = (valor, opcoes, padrao) => (opcoes.includes(valor) ? valor : padrao)

/** A leitura de uma nota: o que ela escolheu, por cima do padrão da pessoa. */
export function leituraDaNota(padrao, daNota) {
  const base = {
    largura: umDe(padrao?.largura, Object.keys(LARGURAS_DA_FOLHA), LEITURA_PADRAO.largura),
    entrelinha: umDe(padrao?.entrelinha, Object.keys(ENTRELINHAS), LEITURA_PADRAO.entrelinha),
  }
  const propria = daNota && typeof daNota === 'object' ? daNota : {}
  return {
    largura: umDe(propria.largura, Object.keys(LARGURAS_DA_FOLHA), base.largura),
    entrelinha: umDe(propria.entrelinha, Object.keys(ENTRELINHAS), base.entrelinha),
  }
}

/**
 * A escolha da nota com `chave` trocada. `null` volta a seguir o padrão e
 * tira a chave; sem chave nenhuma, a nota não guarda `leitura` (`undefined`).
 */
export function mudarLeitura(daNota, chave, valor) {
  const proxima = { ...(daNota && typeof daNota === 'object' ? daNota : {}) }
  if (valor) proxima[chave] = valor
  else delete proxima[chave]
  return Object.keys(proxima).length ? proxima : undefined
}

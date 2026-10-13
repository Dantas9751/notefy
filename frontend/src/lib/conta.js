/**
 * De quem é o que o navegador guarda.
 *
 * O que é DA CONTA (tempo de estudo, abas abertas, painel ao lado, pastas
 * expandidas) leva o id dela no nome da chave: `notefy.tabs@<id>`. Sem isso,
 * entrar com outra conta no mesmo aparelho herdava a lista de estudo, as abas
 * e o painel da anterior — e abrir um desses itens dava erro, porque ele é de
 * outra pessoa. Tema, idioma, tamanhos e posições são do APARELHO e ficam sem
 * dono, de propósito.
 *
 * A conta é uma variável de módulo, e não um contexto: quem lê é código de
 * armazenamento chamado fora do React (o cronômetro de estudo, a cada
 * segundo), e ela precisa valer ANTES de as telas da conta montarem — o
 * `AuthContext` a define no mesmo passo em que guarda o usuário.
 */

let conta = null

export function definirConta(id) {
  conta = id ? String(id) : null
}

/** `chave@<conta>`, ou `null` sem conta: aí não se guarda nada (nem se lê o que é de outra). */
export const chaveDaConta = (chave) => (conta ? `${chave}@${conta}` : null)

/**
 * As chaves de antes de terem dono. Não dá para saber de qual conta são (e
 * guardam ids de itens dela), então saem: abrir a aba ou a pasta de outra
 * pessoa é o defeito que isto conserta. O estudo tem a sua própria adoção,
 * em `estudo.js`, porque ali perder o histórico custa mais que uma aba.
 */
const SEM_DONO = [
  ['localStorage', 'notefy.expanded'],
  ['sessionStorage', 'notefy.tabs'],
  ['sessionStorage', 'notefy.split'],
]

export function descartarSemDono(ambiente = globalThis) {
  for (const [onde, chave] of SEM_DONO) {
    try {
      ambiente[onde]?.removeItem(chave)
    } catch {
      /* sem storage: nada a limpar */
    }
  }
}

import { useLayoutEffect, useRef, useState } from 'react'

/** Respiro mínimo entre o menu e a borda da janela. */
const MARGEM = 8

/**
 * Decide se um menu ancorado abre para baixo ou para cima.
 *
 * Os dropdowns do app usavam `top-full` puro: abriam para baixo sempre,
 * sem perguntar se havia espaço. Perto do rodapé o menu saía da janela e
 * as últimas opções ficavam inalcançáveis — o mesmo defeito que os
 * submenus do menu de contexto tinham, só que sem ninguém reclamar
 * porque esses botões costumam ficar no topo da tela.
 *
 * A medida sai com o menu já desenhado PARA BAIXO, que é a única posição
 * em que a altura real é conhecida. O efeito depende só de `aberto`, então
 * não roda de novo depois de virar — sem isso ele oscilaria entre as duas
 * posições a cada render.
 *
 * Devolve `ref`, que vai no menu, e `paraCima`, que escolhe a classe.
 */
export function useMenuSuspenso(aberto) {
  const ref = useRef(null)
  const [paraCima, setParaCima] = useState(false)

  useLayoutEffect(() => {
    if (!aberto) {
      // Volta ao padrão: reabrir noutra posição da tela precisa medir de
      // novo, e não herdar a decisão da vez passada.
      setParaCima(false)
      return
    }
    if (!ref.current) return

    const caixa = ref.current.getBoundingClientRect()
    const passaDaBorda = caixa.bottom > window.innerHeight - MARGEM
    // Só sobe se couber em cima: sem isso, um menu alto numa janela baixa
    // trocaria "cortado embaixo" por "cortado em cima".
    const cabeAcima = caixa.top - caixa.height - MARGEM > 0

    setParaCima(passaDaBorda && cabeAcima)
  }, [aberto])

  return { ref, paraCima }
}

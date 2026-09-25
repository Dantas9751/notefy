import { useEffect, useRef } from 'react'

/**
 * Escuta um evento no `window` sem re-registrar a cada render.
 *
 * Três lugares faziam isto com `useEffect` SEM array de dependências —
 * atalhos do quadro, colar imagem e o F2 das listagens. Funcionava por
 * um acidente feliz: sem array, o efeito roda em todo render, então o
 * fechamento está sempre fresco. O preço é remover e re-adicionar o
 * listener a cada quadro; no `GraphEditor`, que re-renderiza a cada
 * movimento do ponteiro, isso acontece centenas de vezes por segundo
 * enquanto se desenha um traço.
 *
 * Aqui o handler mora numa ref atualizada em todo render, e o listener é
 * registrado UMA vez. O fechamento continua sempre fresco — que era a
 * propriedade que valia a pena — sem o churn.
 *
 * `opcoes` precisa ser estável (um objeto literal criaria um registro
 * novo por render, que é justamente o que isto evita), então só o que
 * for constante deve ir ali.
 */
export default function useListenerDeJanela(evento, handler, opcoes) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    // O listener registrado é este invólucro, que nunca muda; quem muda
    // é o que ele encontra dentro da ref na hora de disparar.
    const disparar = (e) => handlerRef.current?.(e)
    window.addEventListener(evento, disparar, opcoes)
    return () => window.removeEventListener(evento, disparar, opcoes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento])
}

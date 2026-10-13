import { useRef, useState } from 'react'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { caixaInicial, guardarNoAparelho, lerDoAparelho, prenderNaTela } from '@/lib/flutuante'

const tela = () => ({ w: window.innerWidth, h: window.innerHeight })

/** Arrastar começando num controle (botão, campo, link) não move a caixa: o clique é dele. */
const CONTROLES = 'button, a, input, textarea, select, [contenteditable="true"]'

/**
 * Uma caixa solta sobre o app (relógio, Laviel): posição e tamanho, que
 * nunca saem da janela e ficam guardados no aparelho em `chave`.
 *
 * - `alca`: espalhar na parte que arrasta a caixa (a caixa toda, no relógio;
 *   o cabeçalho, no Laviel, para o texto da conversa continuar selecionável);
 * - `canto`: espalhar no canto que muda o tamanho;
 * - `acompanhar`: espalhar na própria caixa — recebe o movimento do ponteiro,
 *   que a alça e o canto capturam.
 */
export default function useCaixaFlutuante(chave, limites) {
  const [caixa, setCaixa] = useState(() =>
    prenderNaTela(lerDoAparelho(chave, null) ?? caixaInicial(limites, tela()), tela(), limites),
  )
  const gesto = useRef(null)

  // A janela encolheu: a caixa vem junto, em vez de ficar fora de vista.
  useListenerDeJanela('resize', () => setCaixa((c) => prenderNaTela(c, tela(), limites)))

  const comecar = (tipo) => (e) => {
    if (e.button !== 0 || (tipo === 'mover' && e.target.closest(CONTROLES))) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    gesto.current = { tipo, x: e.clientX, y: e.clientY, inicio: caixa }
  }
  const mover = (e) => {
    const g = gesto.current
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    const proxima =
      g.tipo === 'mover'
        ? { ...g.inicio, x: g.inicio.x + dx, y: g.inicio.y + dy }
        : { ...g.inicio, w: g.inicio.w + dx, h: g.inicio.h + dy }
    setCaixa(prenderNaTela(proxima, tela(), limites))
  }
  const soltar = () => {
    if (!gesto.current) return
    gesto.current = null
    setCaixa((c) => {
      guardarNoAparelho(chave, c)
      return c
    })
  }

  return {
    caixa,
    estilo: { left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h },
    alca: { onPointerDown: comecar('mover') },
    canto: { onPointerDown: comecar('tamanho') },
    acompanhar: { onPointerMove: mover, onPointerUp: soltar, onPointerCancel: soltar },
  }
}

/**
 * Toque longo = o mesmo `contextmenu` do botão direito, e com ele todos os
 * menus do app.
 *
 * O Android dispara isso sozinho, mas nem todo navegador de toque dispara (o
 * Chrome com toque emulado não), e sem menu o celular não teria como
 * renomear, mover ou excluir. Se o nativo chega antes, este não dispara.
 *
 * Devolve a função que desliga tudo.
 */
export function ligarToqueLongo(janela = window, { espera = 550, folga = 10 } = {}) {
  let toque = null
  const esquecer = () => {
    clearTimeout(toque?.timer)
    toque = null
  }

  const aoDescer = (e) => {
    esquecer()
    if (e.pointerType !== 'touch' || !e.isPrimary) return
    // Em campo de texto o toque longo é do sistema: selecionar e colar.
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
    const alvo = e.target
    const t = { x: e.clientX, y: e.clientY, disparou: false }
    t.timer = setTimeout(() => {
      t.disparou = true
      alvo.dispatchEvent(
        new janela.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: t.x, clientY: t.y }),
      )
    }, espera)
    toque = t
  }

  // Dedo que anda é rolagem ou arraste, não pedido de menu.
  const aoMover = (e) => {
    if (toque && !toque.disparou && Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > folga) esquecer()
  }
  const aoSubir = () => {
    if (toque && !toque.disparou) esquecer()
  }
  const aoMenuNativo = (e) => {
    if (e.isTrusted && toque && !toque.disparou) esquecer()
  }
  // Soltar o dedo depois do menu gera mousedown e clique: o mousedown caía no
  // véu do menu recém-aberto e o fechava. Cancelar o touchend corta os dois.
  const aoSoltar = (e) => {
    if (toque?.disparou) e.preventDefault()
    esquecer()
  }

  const captura = { capture: true }
  const ouvintes = [
    ['pointerdown', aoDescer, captura],
    ['pointermove', aoMover, captura],
    ['pointerup', aoSubir, captura],
    ['pointercancel', esquecer, captura],
    ['contextmenu', aoMenuNativo, captura],
    ['touchend', aoSoltar, { capture: true, passive: false }],
  ]
  ouvintes.forEach(([tipo, f, opcoes]) => janela.addEventListener(tipo, f, opcoes))
  return () => {
    esquecer()
    ouvintes.forEach(([tipo, f, opcoes]) => janela.removeEventListener(tipo, f, opcoes))
  }
}

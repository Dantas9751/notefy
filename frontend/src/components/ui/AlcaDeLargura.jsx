import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

const prender = (n, min, max) => Math.min(max, Math.max(min, n))

/**
 * Largura de um painel à esquerda que a pessoa ajusta puxando a borda
 * direita dele. Fica no aparelho (localStorage): é conforto de tela, e um
 * monitor largo e um notebook pedem larguras diferentes.
 *
 * Durante o gesto só o `style` do painel muda (via `painelRef`); o estado
 * vem no fim. Um render do editor inteiro a cada pixel arrastado pesava no
 * Design com muitas camadas.
 *
 * `max` pode ser função: lida no começo do gesto, porque o espaço que sobra
 * para o quadro muda com a janela.
 */
export function useLarguraDoPainel(chave, { padrao, min, max }) {
  const lerMax = () => Math.max(min, typeof max === 'function' ? max() : max)
  const [salva, setSalva] = useState(() => {
    try {
      const lida = Number(localStorage.getItem(chave))
      return lida > 0 ? lida : padrao
    } catch {
      return padrao
    }
  })
  const largura = Math.max(min, salva)
  const painelRef = useRef(null)
  const gestoRef = useRef(null)
  const [arrastando, setArrastando] = useState(false)

  const gravar = (valor) => {
    setSalva(valor)
    try {
      localStorage.setItem(chave, String(Math.round(valor)))
    } catch {
      /* modo privado: vale só nesta sessão */
    }
  }

  const alca = {
    onPointerDown(e) {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      gestoRef.current = { x: e.clientX, largura: painelRef.current?.offsetWidth ?? salva, max: lerMax(), atual: null }
      setArrastando(true)
    },
    onPointerMove(e) {
      const g = gestoRef.current
      if (!g) return
      g.atual = prender(g.largura + e.clientX - g.x, min, g.max)
      if (painelRef.current) painelRef.current.style.width = `${g.atual}px`
    },
    onPointerUp() {
      const g = gestoRef.current
      gestoRef.current = null
      setArrastando(false)
      if (g?.atual != null) gravar(g.atual)
    },
    onLostPointerCapture() {
      if (gestoRef.current) alca.onPointerUp()
    },
    // Duplo clique volta à largura de fábrica, como nas divisórias dos editores de código.
    onDoubleClick: () => gravar(padrao),
    onKeyDown(e) {
      const passo = e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : 0
      if (!passo) return
      e.preventDefault()
      gravar(prender(largura + passo, min, lerMax()))
    },
  }

  return { largura, painelRef, alca, arrastando, min }
}

/** A borda que se puxa: último filho do painel (que precisa ser posicionado), por cima do conteúdo dele. */
export default function AlcaDeLargura({ painel, className }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Largura do painel')}
      aria-valuenow={Math.round(painel.largura)}
      aria-valuemin={painel.min}
      tabIndex={0}
      title={t('Arraste para mudar a largura · duplo clique volta ao padrão')}
      {...painel.alca}
      className={cn(
        'absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize touch-none transition',
        painel.arrastando ? 'bg-accent-500/40' : 'hover:bg-accent-500/20 focus-visible:bg-accent-500/30',
        className,
      )}
    />
  )
}

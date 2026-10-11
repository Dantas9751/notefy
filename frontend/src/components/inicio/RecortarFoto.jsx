import { useEffect, useRef, useState } from 'react'
import { Move, ZoomIn, ZoomOut } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { recorteAoMover, recorteDa, recorteParaSalvar } from '@/lib/inicio'
import { t } from '@/lib/i18n'
import { FotoDaCapa } from './Capa'

const SETAS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
const prender = (n, min, max) => Math.min(max, Math.max(min, n))

/**
 * Enquadrar uma foto do Início (capa, fundo da página ou relógio).
 *
 * A caixa tem o FORMATO do lugar onde a foto vai ficar (`proporcao`,
 * largura/altura, medida na tela na hora de abrir): o que aparece dentro
 * dela é o que vai aparecer lá. Arrastar (mouse ou dedo) move a foto, a
 * roda e o controle aproximam, as setas movem (Shift: passo maior), Enter
 * salva. `children` vai por cima da foto, sem pegar clique — a saudação
 * da capa, a hora do relógio —, para enquadrar sabendo onde fica o texto.
 */
export default function RecortarFoto({ open, titulo, foto, proporcao, escurecer = true, onSalvar, onCancelar, children }) {
  const [recorte, setRecorte] = useState(() => recorteDa(foto))
  const imgRef = useRef(null)
  const areaRef = useRef(null)
  const ultimo = useRef(null)

  // Cada abertura parte do recorte salvo da foto que chegou.
  useEffect(() => {
    if (open) setRecorte(recorteDa(foto))
  }, [open, foto])

  const mover = (dx, dy) =>
    setRecorte((r) => {
      const img = imgRef.current
      const caixa = areaRef.current?.getBoundingClientRect()
      return recorteAoMover(r, dx, dy, { w: img?.naturalWidth, h: img?.naturalHeight }, { w: caixa?.width, h: caixa?.height })
    })

  // Por função: vários giros da roda no mesmo instante somam, em vez de
  // cada um partir do zoom de antes do primeiro.
  const zoom = (valor) => setRecorte((r) => ({ ...r, zoom: prender(typeof valor === 'function' ? valor(r.zoom) : valor, 1, 3) }))
  const salvar = () => onSalvar(recorteParaSalvar(recorte))

  return (
    <Modal
      open={open && !!foto?.url}
      onClose={onCancelar}
      title={titulo}
      size="lg"
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-ink-500">
            <ZoomOut size={15} aria-hidden />
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={recorte.zoom}
              onChange={(e) => zoom(Number(e.target.value))}
              aria-label={t('Zoom')}
              className="w-28 accent-accent-600 sm:w-40"
            />
            <ZoomIn size={15} aria-hidden />
          </label>
          <Button variant="secondary" onClick={onCancelar}>
            {t('Cancelar')}
          </Button>
          <Button onClick={salvar}>{t('Salvar')}</Button>
        </>
      }
    >
      <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
        <Move size={13} aria-hidden />
        {t('Arraste a foto para enquadrar. A caixa tem o formato do lugar onde ela vai ficar.')}
      </p>
      {/* Largura limitada pela altura da tela: uma faixa larga cabe inteira,
          e uma caixa alta (o relógio estreito) não estoura o popup. */}
      <div className="flex justify-center">
        <div
          ref={areaRef}
          role="application"
          tabIndex={0}
          aria-label={t('Recortar: arraste a foto ou use as setas. Enter salva, Esc cancela.')}
          style={{ aspectRatio: proporcao, width: `min(100%, calc(55vh * ${proporcao}))` }}
          className="relative cursor-grab touch-none select-none overflow-hidden rounded-md outline-none ring-1 ring-ink-200 focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing dark:ring-ink-700"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            ultimo.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerMove={(e) => {
            if (!ultimo.current) return
            mover(e.clientX - ultimo.current.x, e.clientY - ultimo.current.y)
            ultimo.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={() => {
            ultimo.current = null
          }}
          onPointerCancel={() => {
            ultimo.current = null
          }}
          onWheel={(e) => zoom((atual) => atual - e.deltaY * 0.002)}
          onKeyDown={(e) => {
            const seta = SETAS[e.key]
            if (seta) {
              e.preventDefault()
              const px = e.shiftKey ? 60 : 15
              mover(seta[0] * px, seta[1] * px)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              salvar()
            }
          }}
        >
          {foto?.url && <FotoDaCapa capa={foto} recorte={recorte} imgRef={imgRef} escurecer={escurecer} />}
          {children && <div className="pointer-events-none absolute inset-0">{children}</div>}
        </div>
      </div>
    </Modal>
  )
}

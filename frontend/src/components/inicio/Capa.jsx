import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Move, ZoomIn, ZoomOut } from 'lucide-react'
import api from '@/lib/api'
import { Button } from '@/components/ui'
import { CAPAS } from '@/lib/inicio'
import { urlDeMedia } from '@/lib/fileMedia'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/** O fundo CSS de uma capa de material. A foto é desenhada por `FotoDaCapa`. */
export const fundoDaCapa = (capa) =>
  capa?.tipo === 'imagem' ? undefined : (CAPAS.find((c) => c.id === capa?.id) ?? CAPAS[0]).fundo

/** Texto escuro por cima do papel, claro por cima do resto (e das fotos). */
export const textoDaCapa = (capa) =>
  capa?.tipo === 'imagem' ? 'claro' : (CAPAS.find((c) => c.id === capa?.id) ?? CAPAS[0]).texto

/** Envia a foto da capa (do computador ou arrastada) e devolve o endereço. */
export async function enviarCapa(arquivo) {
  const corpo = new FormData()
  corpo.append('imagem', arquivo)
  const { data } = await api.post('/me/cover/', corpo)
  return data.url
}

/** A primeira imagem de um arraste, se houver. */
export const imagemDoArraste = (evento) =>
  [...(evento.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/')) ?? null

const temArquivo = (evento) => [...(evento.dataTransfer?.types ?? [])].includes('Files')

/** Recorte salvo da foto: o ponto que a faixa segue (em %) e o zoom. */
const recorteDa = (capa) => ({ x: capa?.x ?? 50, y: capa?.y ?? 50, zoom: capa?.zoom ?? 1 })

/**
 * A foto da capa, recortada. `object-position` põe o ponto (x%, y%) da foto
 * no mesmo ponto da faixa, e o zoom cresce em volta dele: o recorte vale em
 * qualquer largura, do celular ao monitor, sem guardar pixel nenhum.
 */
export function FotoDaCapa({ capa, recorte = recorteDa(capa), imgRef }) {
  const { x, y, zoom } = recorte
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-ink-800">
      <img
        ref={imgRef}
        src={urlDeMedia(capa.url)}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
        style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }}
      />
      {/* Escurece embaixo para o nome em branco ler sobre qualquer foto. */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.55))' }} />
    </div>
  )
}

const SETAS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * Recorta a foto no lugar, como a capa de perfil das redes: arrastar (mouse
 * ou dedo) move a foto, o controle aproxima, as setas também movem. Enter
 * salva e Esc cancela. Na própria capa, e não numa prévia: a largura dela
 * muda com a tela, e o recorte que importa é o que fica atrás da saudação.
 */
function Recortar({ capa, onSalvar, onCancelar }) {
  const [recorte, setRecorte] = useState(() => recorteDa(capa))
  const imgRef = useRef(null)
  const areaRef = useRef(null)
  const ultimo = useRef(null)

  // Foco na área já ao abrir: setas, Enter e Esc funcionam sem clicar antes.
  // (`autoFocus` não serve: o React só o aplica em campo e botão.)
  useEffect(() => {
    areaRef.current?.focus()
  }, [])

  // Arrastar d px leva a foto d px: em %, d sobre o quanto a foto passa da faixa.
  const mover = (dx, dy) =>
    setRecorte((r) => {
      const img = imgRef.current
      const faixa = img?.parentElement.getBoundingClientRect()
      if (!img?.naturalWidth || !faixa) return r
      const escala = Math.max(faixa.width / img.naturalWidth, faixa.height / img.naturalHeight) * r.zoom
      const passo = (atual, d, sobra) => (sobra > 1 ? Math.min(100, Math.max(0, atual - (d / sobra) * 100)) : atual)
      return {
        ...r,
        x: passo(r.x, dx, img.naturalWidth * escala - faixa.width),
        y: passo(r.y, dy, img.naturalHeight * escala - faixa.height),
      }
    })

  const salvar = () =>
    onSalvar({ x: Math.round(recorte.x * 10) / 10, y: Math.round(recorte.y * 10) / 10, zoom: Math.round(recorte.zoom * 100) / 100 })

  return (
    <>
      <FotoDaCapa capa={capa} recorte={recorte} imgRef={imgRef} />
      <div
        ref={areaRef}
        role="application"
        tabIndex={0}
        aria-label={t('Recortar a capa: arraste a foto ou use as setas. Enter salva, Esc cancela.')}
        className="absolute inset-0 z-10 cursor-grab touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 active:cursor-grabbing"
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
        onKeyDown={(e) => {
          const seta = SETAS[e.key]
          if (seta) {
            e.preventDefault()
            const px = e.shiftKey ? 60 : 15
            mover(seta[0] * px, seta[1] * px)
          } else if (e.key === 'Enter') {
            salvar()
          } else if (e.key === 'Escape') {
            onCancelar()
          }
        }}
      />
      {/* A faixa não pega o toque: arrastar começando entre os botões também move a foto. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-3">
        {/* No celular a dica não cabe ao lado dos botões, e arrastar a foto já é o gesto esperado. */}
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-black/50 px-2.5 text-xs font-medium text-white max-sm:hidden">
          <Move size={14} aria-hidden />
          {t('Arraste a foto para enquadrar')}
        </span>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <label className="inline-flex h-8 items-center gap-1.5 rounded-md bg-black/50 px-2.5 text-white">
            <ZoomOut size={14} aria-hidden />
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={recorte.zoom}
              onChange={(e) => setRecorte((r) => ({ ...r, zoom: Number(e.target.value) }))}
              aria-label={t('Zoom')}
              className="w-20 accent-white sm:w-24"
            />
            <ZoomIn size={14} aria-hidden />
          </label>
          <Button size="sm" variant="secondary" onClick={onCancelar}>
            {t('Cancelar')}
          </Button>
          <Button size="sm" onClick={salvar}>
            {t('Salvar')}
          </Button>
        </div>
      </div>
    </>
  )
}

/**
 * Capa do Início: a faixa com a saudação, como a foto no topo do Evernote.
 * A pessoa escolhe em "Personalizar", ou arrasta uma foto para cima dela.
 */
export default function Capa({ capa, saudacao, data, acoes, onSoltarImagem, recortando, onSalvarRecorte, onCancelarRecorte }) {
  const [arrastando, setArrastando] = useState(false)
  const escuro = textoDaCapa(capa) === 'escuro'
  const foto = capa?.tipo === 'imagem'
  const soltar = recortando ? null : onSoltarImagem

  return (
    <div
      className="relative"
      style={{ background: fundoDaCapa(capa) }}
      onDragOver={(e) => {
        if (!soltar || !temArquivo(e)) return
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setArrastando(false)
      }}
      onDrop={(e) => {
        if (!soltar) return
        e.preventDefault()
        setArrastando(false)
        const imagem = imagemDoArraste(e)
        if (imagem) soltar(imagem)
      }}
    >
      {foto && recortando ? (
        <Recortar key={capa.url} capa={capa} onSalvar={onSalvarRecorte} onCancelar={onCancelarRecorte} />
      ) : (
        foto && <FotoDaCapa capa={capa} />
      )}

      <div className="relative flex flex-wrap items-end gap-3 px-6 pb-5 pt-16 sm:pt-24">
        {/* Largura mínima: no celular os botões descem para baixo da saudação
            em vez de cortá-la ("Boa tarde, ..."). */}
        <div
          className={cn(
            'min-w-[min(100%,15rem)] flex-1',
            escuro ? 'text-ink-900' : 'text-white [text-shadow:0_1px_14px_rgb(0_0_0/0.35)]',
          )}
        >
          <p className={cn('text-[13px] first-letter:uppercase', escuro ? 'text-ink-600' : 'text-white/85')}>{data}</p>
          <h1 className="mt-0.5 truncate font-serif text-[30px] leading-tight sm:text-[36px]">{saudacao}</h1>
        </div>
        {!recortando && <div className="flex shrink-0 items-center gap-2">{acoes(escuro)}</div>}
      </div>

      {arrastando && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/80 bg-black/40 text-sm font-medium text-white">
          <ImagePlus size={18} />
          {t('Solte a imagem para usar como capa')}
        </div>
      )}
    </div>
  )
}

/** Botão por cima da capa: translúcido, claro ou escuro conforme o fundo. */
export function BotaoDaCapa({ icon: Icon, escuro = false, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium backdrop-blur transition [@media(pointer:coarse)]:py-2.5',
        escuro
          ? 'border-ink-900/15 bg-white/60 text-ink-800 hover:bg-white/80'
          : 'border-white/25 bg-white/15 text-white hover:bg-white/25',
      )}
      {...props}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  )
}

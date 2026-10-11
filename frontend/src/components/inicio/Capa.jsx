import { useLayoutEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import api from '@/lib/api'
import { CAPAS, recorteDa } from '@/lib/inicio'
import { urlDeMedia } from '@/lib/fileMedia'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/** O fundo CSS de uma capa de material. A foto é desenhada por `FotoDaCapa`. */
export const fundoDaCapa = (capa) =>
  capa?.tipo === 'imagem' ? undefined : (CAPAS.find((c) => c.id === capa?.id) ?? CAPAS[0]).fundo

/** Texto escuro por cima do papel, claro por cima do resto (e das fotos). */
export const textoDaCapa = (capa) =>
  capa?.tipo === 'imagem' ? 'claro' : (CAPAS.find((c) => c.id === capa?.id) ?? CAPAS[0]).texto

/** Envia uma foto do Início (do computador ou arrastada) e devolve o endereço. `para`: capa, fundo ou foto. */
export async function enviarCapa(arquivo, para = 'capa') {
  const corpo = new FormData()
  corpo.append('imagem', arquivo)
  const { data } = await api.post('/me/cover/', corpo, { params: { para } })
  return data.url
}

/** A primeira imagem de um arraste, se houver. */
export const imagemDoArraste = (evento) =>
  [...(evento.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/')) ?? null

const temArquivo = (evento) => [...(evento.dataTransfer?.types ?? [])].includes('Files')

/**
 * A foto da capa, recortada. `object-position` põe o ponto (x%, y%) da foto
 * no mesmo ponto da faixa, e o zoom cresce em volta dele: o recorte vale em
 * qualquer largura, do celular ao monitor, sem guardar pixel nenhum.
 */
export function FotoDaCapa({ capa, recorte = recorteDa(capa), imgRef, escurecer = true }) {
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
      {/* Escurece embaixo para o nome em branco ler sobre qualquer foto. O
          papel de parede não precisa: ele já tem o véu da página por cima. */}
      {escurecer && (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.55))' }} />
      )}
    </div>
  )
}

/**
 * A área visível da página: o contêiner que rola em volta do Início. É o
 * "lugar" do fundo — a proporção que o recorte do fundo usa.
 */
export function areaDaPagina(el) {
  for (let atual = el?.parentElement; atual; atual = atual.parentElement) {
    const { overflowY } = getComputedStyle(atual)
    if (overflowY === 'auto' || overflowY === 'scroll') return atual
  }
  return null
}

/** A caixa útil da área (sem a faixa da barra de rolagem), na tela. */
export function caixaUtil(area) {
  const r = area.getBoundingClientRect()
  return { left: r.left + area.clientLeft, top: r.top + area.clientTop, width: area.clientWidth, height: area.clientHeight }
}

/**
 * A foto do fundo da página, recortada e parada enquanto a página rola.
 *
 * Uma camada fixa do tamanho EXATO da área visível (medida e acompanhada),
 * e não `background-attachment: fixed`: esse mede a janela inteira, com a
 * barra lateral, e não aceita o zoom do recorte — o que se enquadrava não
 * era o que aparecia.
 */
export function PapelDeParede({ foto, paginaRef }) {
  const [caixa, setCaixa] = useState(null)

  useLayoutEffect(() => {
    const area = areaDaPagina(paginaRef.current)
    if (!area) return undefined
    const medir = () => setCaixa(caixaUtil(area))
    medir()
    // A largura muda sem `resize` (menu recolhido, painel ao lado).
    const observador = new ResizeObserver(medir)
    observador.observe(area)
    window.addEventListener('resize', medir)
    return () => {
      observador.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [paginaRef])

  if (!caixa) return null
  return (
    <div aria-hidden className="pointer-events-none fixed" style={caixa}>
      <FotoDaCapa capa={foto} escurecer={false} />
    </div>
  )
}

/**
 * Capa do Início: a faixa com a saudação, como a foto no topo do Evernote.
 * A pessoa escolhe em "Personalizar", ou arrasta uma foto para cima dela
 * (que abre o recorte, como toda foto nova do Início).
 */
export default function Capa({ capa, saudacao, data, acoes, onSoltarImagem }) {
  const [arrastando, setArrastando] = useState(false)
  const escuro = textoDaCapa(capa) === 'escuro'
  const foto = capa?.tipo === 'imagem'

  return (
    <div
      data-capa
      className="relative"
      style={{ background: fundoDaCapa(capa) }}
      onDragOver={(e) => {
        if (!onSoltarImagem || !temArquivo(e)) return
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setArrastando(false)
      }}
      onDrop={(e) => {
        if (!onSoltarImagem) return
        e.preventDefault()
        setArrastando(false)
        const imagem = imagemDoArraste(e)
        if (imagem) onSoltarImagem(imagem)
      }}
    >
      {foto && <FotoDaCapa capa={capa} />}

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
        <div className="flex shrink-0 items-center gap-2">{acoes(escuro)}</div>
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

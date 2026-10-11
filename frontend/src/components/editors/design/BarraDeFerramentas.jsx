import { useRef } from 'react'
import { Circle, Frame, Hand, ImagePlus, MousePointer2, PanelLeft, PanelRight, Slash, Square, Type } from 'lucide-react'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Barra flutuante embaixo do quadro, como a do Figma (UI3): ferramentas no
 * meio, zoom à direita. Os botões de painel só aparecem na tela estreita,
 * onde os painéis viram gavetas.
 */

const FERRAMENTAS = [
  [
    { id: 'move', icon: MousePointer2, get titulo() { return t('Mover (V)') } },
    { id: 'hand', icon: Hand, get titulo() { return t('Mão (H)') } },
  ],
  [
    { id: 'frame', icon: Frame, get titulo() { return t('Frame (F)') } },
    { id: 'rect', icon: Square, get titulo() { return t('Retângulo (R)') } },
    { id: 'ellipse', icon: Circle, get titulo() { return t('Elipse (O)') } },
    { id: 'line', icon: Slash, get titulo() { return t('Linha (L)') } },
    { id: 'text', icon: Type, get titulo() { return t('Texto (T)') } },
  ],
]

function Botao({ titulo, ativo, onClick, children, className }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 min-w-[30px] shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-ink-600 transition dark:text-ink-300 sm:min-w-9 sm:px-2 [@media(pointer:coarse)]:h-11',
        ativo ? 'bg-accent-600 text-white dark:text-white' : 'hover:bg-ink-100 dark:hover:bg-ink-800',
        className,
      )}
    >
      {children}
    </button>
  )
}

const Divisoria = () => <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-ink-200 dark:bg-ink-700 sm:mx-1" />

export default function BarraDeFerramentas({
  ferramenta,
  onFerramenta,
  onImagens,
  zoom,
  onZoom,
  somenteLeitura,
  onPainel,
  //: Editor estreito: os painéis são gavetas e a barra ganha os botões que as abrem.
  compacto,
}) {
  const arquivoRef = useRef(null)
  const { menu, openMenu, closeMenu } = useContextMenu()

  const itensDeZoom = [
    { label: t('Aproximar'), atalho: 'Ctrl +', onClick: () => onZoom('mais') },
    { label: t('Afastar'), atalho: 'Ctrl −', onClick: () => onZoom('menos') },
    { separator: true },
    { label: t('Enquadrar tudo'), atalho: 'Shift 1', onClick: () => onZoom('tudo') },
    { label: t('Enquadrar seleção'), atalho: 'Shift 2', onClick: () => onZoom('selecao') },
    { label: t('Zoom em 50%'), onClick: () => onZoom(0.5) },
    { label: t('Zoom em 100%'), atalho: 'Shift 0', onClick: () => onZoom(1) },
    { label: t('Zoom em 200%'), onClick: () => onZoom(2) },
  ]

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-2 sm:px-3">
      {/* Os eventos param aqui: subindo até o quadro, o pointerdown capturava o
          ponteiro e o clique nunca chegava ao botão. */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        className="pointer-events-auto flex max-w-full items-center overflow-x-auto rounded-xl border border-ink-200 bg-white/95 p-1 shadow-pop backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
        {compacto && (
          <Botao titulo={t('Camadas')} onClick={() => onPainel('camadas')}>
            <PanelLeft size={17} />
          </Botao>
        )}
        {FERRAMENTAS.map((grupo, i) => (
          <div key={i} className="flex items-center">
            {(i > 0 || compacto) && <Divisoria />}
            {grupo
              .filter((f) => !somenteLeitura || f.id === 'move' || f.id === 'hand')
              .map((f) => (
                // No celular a vista anda com dois dedos: a Mão só ocuparia espaço.
                <Botao key={f.id} titulo={f.titulo} ativo={ferramenta === f.id} onClick={() => onFerramenta(f.id)} className={f.id === 'hand' ? '[@media(pointer:coarse)]:hidden' : undefined}>
                  <f.icon size={17} />
                </Botao>
              ))}
          </div>
        ))}
        {!somenteLeitura && (
          <>
            <Botao titulo={t('Imagem')} onClick={() => arquivoRef.current?.click()}>
              <ImagePlus size={17} />
            </Botao>
            <input
              ref={arquivoRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const arquivos = [...(e.target.files ?? [])]
                e.target.value = ''
                if (arquivos.length) onImagens(arquivos)
              }}
            />
          </>
        )}
        <Divisoria />
        <button
          type="button"
          onClick={(e) => {
            const caixa = e.currentTarget.getBoundingClientRect()
            openMenu({ clientX: caixa.left, clientY: caixa.top, preventDefault() {}, stopPropagation() {} }, null)
          }}
          title={t('Zoom')}
          className="h-9 min-w-11 rounded-md px-1.5 text-xs tabular-nums sm:min-w-14 sm:px-2 [@media(pointer:coarse)]:h-11 text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          {Math.round(zoom * 100)}%
        </button>
        {compacto && (
          <Botao titulo={t('Propriedades')} onClick={() => onPainel('propriedades')}>
            <PanelRight size={17} />
          </Botao>
        )}
      </div>
      <ContextMenu open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={closeMenu} items={itensDeZoom} />
    </div>
  )
}

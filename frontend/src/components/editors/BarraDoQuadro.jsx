import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BoxSelect,
  Brush,
  Check,
  ChevronDown,
  Circle,
  Eraser,
  Highlighter,
  MousePointer2,
  PenLine,
  Shapes,
  Slash,
  Spline,
  Square,
  Triangle,
  Type,
} from 'lucide-react'
import ColorWheel from '@/components/ui/ColorWheel'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * A barra do quadro branco: flutua no alto do próprio quadro, como nos
 * editores de whiteboard, em vez da coluna lateral que o canvas dividia com
 * o diagrama. Lá ela empilhava ferramentas, cores, uma lista comprida de
 * formas e conectores, roubava a largura do desenho e repetia o título
 * ("Conector / Conectores"). O diagrama continua com a lateral: lá ela é o
 * catálogo das notações (UML, ER...), e o catálogo precisa de espaço.
 *
 * O que só vale para uma ferramenta (espessura, opacidade, raio) aparece
 * numa segunda faixa logo abaixo, só enquanto ela está escolhida.
 */

const GRUPOS_DE_FERRAMENTAS = [
  [
    { id: 'select', icon: MousePointer2, get titulo() { return t('Selecionar (V)') } },
    { id: 'select-area', icon: BoxSelect, get titulo() { return t('Selecionar área (A): arraste para marcar vários') } },
  ],
  [
    { id: 'pen', icon: PenLine, get titulo() { return t('Caneta (P)') } },
    { id: 'marker', icon: Brush, get titulo() { return t('Marcador (M)') } },
    { id: 'highlighter', icon: Highlighter, get titulo() { return t('Marca-texto (H)') } },
    { id: 'eraser', icon: Eraser, get titulo() { return t('Borracha (E)') } },
  ],
  [
    { id: 'text', icon: Type, get titulo() { return t('Texto (T): clique para escrever') } },
    { id: 'rect', icon: Square, get titulo() { return t('Retângulo (R): arraste para desenhar') } },
    { id: 'ellipse', icon: Circle, get titulo() { return t('Elipse (O): arraste para desenhar') } },
    { id: 'triangle', icon: Triangle, get titulo() { return t('Triângulo: arraste para desenhar') } },
    { id: 'line_shape', icon: Slash, get titulo() { return t('Linha (L): arraste para desenhar') } },
  ],
]

const ESTILO_DA_BARRA =
  'pointer-events-auto flex items-center gap-0.5 rounded-lg border border-ink-200 bg-white/95 p-1 shadow-pop backdrop-blur dark:border-ink-700 dark:bg-ink-900/95'

function Divisoria() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-ink-200 dark:bg-ink-700" />
}

function Botao({ titulo, ativo, onClick, children, className }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-ink-500 transition',
        ativo ? 'bg-accent-600 text-white' : 'hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-800 dark:hover:text-ink-100',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * Botão que abre uma lista logo abaixo dele; um clique fora fecha.
 *
 * Fora, e não com um véu `fixed inset-0`: a barra tem `backdrop-blur`, e
 * `backdrop-filter` vira a referência do `position: fixed` dos filhos — o
 * véu cobria só a barra e engolia o clique no botão vizinho.
 */
function Menu({ titulo, rotulo, aberto, onAlternar, onFechar, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => !ref.current?.contains(e.target) && onFechar()
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto, onFechar])

  return (
    <div ref={ref} className="relative">
      <Botao titulo={titulo} ativo={aberto} onClick={onAlternar} className={aberto ? '' : 'text-ink-600 dark:text-ink-300'}>
        {rotulo}
        <ChevronDown size={11} className="opacity-60" />
      </Botao>
      {aberto && (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-20 mt-1.5 max-h-[60vh] w-52 -translate-x-1/2 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900"
        >
          {children}
        </div>
      )}
    </div>
  )
}

function ItemDoMenu({ ativo, onClick, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-ink-100 dark:hover:bg-ink-800',
        ativo ? 'font-medium text-accent-700 dark:text-accent-300' : 'text-ink-600 dark:text-ink-300',
      )}
    >
      <span className="flex-1">{children}</span>
      {ativo && <Check size={12} />}
    </button>
  )
}

function Faixa({ rotulo, min, max, valor, sufixo, onMudar }) {
  return (
    <label className="flex items-center gap-2 px-1.5">
      <span className="shrink-0 text-[10px] text-ink-400">{rotulo}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => onMudar(Number(e.target.value))}
        aria-label={rotulo}
        className="h-1 w-24 accent-accent-600"
      />
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-ink-400">
        {valor}
        {sufixo}
      </span>
    </label>
  )
}

export default function BarraDoQuadro({
  tool,
  onTool,
  cores,
  espessuras,
  tinta,
  onTinta,
  larguras,
  onLarguras,
  opacidade,
  onOpacidade,
  raio,
  onRaio,
  palette,
  onAdicionar,
  conector,
  onConector,
}) {
  //: Qual lista está aberta: 'formas', 'conector', 'cor' ou nenhuma.
  const [aberto, setAberto] = useState(null)
  const alternar = (qual) => setAberto((atual) => (atual === qual ? null : qual))
  const fechar = useCallback(() => setAberto(null), [])
  const ehTraco = ['pen', 'marker', 'highlighter'].includes(tool)

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-col items-center gap-1.5">
      <div role="toolbar" aria-label={t('Ferramentas do quadro')} className={cn(ESTILO_DA_BARRA, 'max-w-full flex-wrap justify-center')}>
        {GRUPOS_DE_FERRAMENTAS.map((grupo, i) => (
          <div key={i} className="flex items-center gap-0.5">
            {i > 0 && <Divisoria />}
            {grupo.map((item) => (
              <Botao key={item.id} titulo={item.titulo} ativo={tool === item.id} onClick={() => onTool(item.id)}>
                <item.icon size={15} />
              </Botao>
            ))}
          </div>
        ))}

        <Divisoria />

        <Menu titulo={t('Cor da tinta')} rotulo={<span className="h-4 w-4 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: tinta }} />} aberto={aberto === 'cor'} onAlternar={() => alternar('cor')} onFechar={fechar}>
          <div className="grid grid-cols-5 gap-1.5 p-1.5">
            {cores.map((cor) => (
              <button
                key={cor}
                type="button"
                onClick={() => {
                  onTinta(cor)
                  setAberto(null)
                }}
                style={{ backgroundColor: cor }}
                aria-label={t('Tinta {color}', { color: cor })}
                className={cn('h-7 w-7 rounded-full border-2 transition hover:scale-110', tinta === cor ? 'border-accent-500' : 'border-transparent')}
              />
            ))}
            <ColorWheel value={tinta} onChange={onTinta} selected={!cores.includes(tinta)} className="h-7 w-7" title={t('Tinta personalizada')} />
          </div>
        </Menu>

        <Menu titulo={t('Inserir forma')} rotulo={<Shapes size={15} />} aberto={aberto === 'formas'} onAlternar={() => alternar('formas')} onFechar={fechar}>
          {palette.groups.map((grupo) => (
            <div key={grupo.id} className="mb-1 last:mb-0">
              <p className="px-2 pb-0.5 pt-1.5 secao">{grupo.label}</p>
              {Object.entries(grupo.types).map(([tipo, preset]) => (
                <ItemDoMenu
                  key={tipo}
                  onClick={() => {
                    onAdicionar(tipo)
                    setAberto(null)
                  }}
                >
                  {preset.label}
                </ItemDoMenu>
              ))}
            </div>
          ))}
        </Menu>

        <Menu titulo={t('Tipo de conector')} rotulo={<Spline size={15} />} aberto={aberto === 'conector'} onAlternar={() => alternar('conector')} onFechar={fechar}>
          <p className="px-2 pb-1 pt-1 text-[10px] leading-snug text-ink-400">
            {t('Vale para as próximas ligações: puxe a bolinha de um objeto até outro.')}
          </p>
          {palette.edgeGroups.flatMap((grupo) =>
            Object.entries(grupo.types).map(([tipo, preset]) => (
              <ItemDoMenu
                key={tipo}
                ativo={conector === tipo}
                onClick={() => {
                  onConector(tipo)
                  setAberto(null)
                }}
              >
                {preset.label}
              </ItemDoMenu>
            )),
          )}
        </Menu>
      </div>

      {/* O que só existe para a ferramenta escolhida. */}
      {(ehTraco || tool === 'eraser') && (
        <div className={ESTILO_DA_BARRA}>
          {ehTraco && (
            <>
              <span className="px-1.5 text-[10px] text-ink-400">{t('Espessura')}</span>
              {espessuras.map((largura) => (
                <Botao
                  key={largura}
                  titulo={t('Espessura {width}', { width: largura })}
                  ativo={larguras[tool] === largura}
                  onClick={() => onLarguras({ ...larguras, [tool]: largura })}
                  className="h-7 min-w-7"
                >
                  <span className="rounded-full bg-current" style={{ width: Math.min(largura, 12), height: Math.min(largura, 12) }} />
                </Botao>
              ))}
            </>
          )}
          {tool === 'highlighter' && (
            <>
              <Divisoria />
              <Faixa rotulo={t('Opacidade')} min={10} max={80} valor={opacidade} sufixo="%" onMudar={onOpacidade} />
            </>
          )}
          {tool === 'eraser' && <Faixa rotulo={t('Raio')} min={10} max={80} valor={raio} sufixo="px" onMudar={onRaio} />}
        </div>
      )}
    </div>
  )
}

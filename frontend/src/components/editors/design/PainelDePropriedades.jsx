import { useState } from 'react'
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpToLine,
  CaseUpper,
  Check,
  Copy,
  FoldVertical,
  Italic,
  Minus,
  MoveHorizontal,
  MoveVertical,
  RotateCw,
  Scan,
  Square,
  Strikethrough,
  Underline,
  WrapText,
} from 'lucide-react'
import { FONTES_SUGERIDAS, PESOS_DE_FONTE, PRESETS_DE_FRAME, cssDaCamada, noFluxo, temLayout } from '@/lib/design'
import { copiarTexto } from '@/lib/desktop'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'
import { BotaoIcone, CampoCor, CampoNumero, Escolha, LinhaDeItem, Secao } from './campos'
import { nomeDaCamada } from './PainelDeCamadas'

/**
 * Direita do editor: "Design" (propriedades) e "Código" (o CSS da camada).
 *
 * Os campos mostram o valor comum da seleção, ou "Misto". Mudar um campo
 * vale para todas as camadas selecionadas: `editar(fn)` aplica `fn` em
 * cada uma, e o editor cuida de restrições, grupos e do desfazer.
 */

/** O valor de `ler` se for igual em todas; senão `null` (Misto). */
function comum(itens, ler) {
  if (!itens.length) return null
  const primeiro = ler(itens[0])
  return itens.every((i) => JSON.stringify(ler(i)) === JSON.stringify(primeiro)) ? primeiro : null
}

const PESOS = {
  100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black',
}

const novaPintura = () => ({ type: 'solid', color: '#D9D9D9', opacity: 1 })
const novoEfeito = () => ({ type: 'drop', x: 0, y: 4, blur: 4, spread: 0, color: '#000000', opacity: 0.25 })

function Grade({ children, colunas = 2 }) {
  return <div className={cn('grid gap-1.5', colunas === 2 ? 'grid-cols-2' : colunas === 3 ? 'grid-cols-3' : 'grid-cols-4')}>{children}</div>
}

function Segmentado({ opcoes, valor, onChange }) {
  return (
    <div className="flex h-7 items-center rounded-md bg-ink-100 p-0.5 dark:bg-ink-800">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          title={o.titulo}
          aria-label={o.titulo}
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'flex h-6 flex-1 items-center justify-center rounded px-1.5 text-[11px] transition',
            valor === o.valor ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-100',
          )}
        >
          {o.icone ? <o.icone size={13} /> : o.rotulo}
        </button>
      ))}
    </div>
  )
}

/** Uma pintura (preenchimento): sólido, gradiente ou imagem. */
function EditorDePintura({ pintura, onChange, onTrocarImagem, soSolido }) {
  const tipos = [
    { valor: 'solid', rotulo: t('Sólido') },
    { valor: 'linear', rotulo: t('Gradiente') },
    { valor: 'image', rotulo: t('Imagem') },
  ]
  const trocarTipo = (tipo) => {
    if (tipo === pintura.type) return
    if (tipo === 'solid') onChange({ type: 'solid', color: pintura.stops?.[0]?.color ?? '#D9D9D9', opacity: 1 })
    else if (tipo === 'linear')
      onChange({
        type: 'linear',
        angle: 180,
        stops: [
          { at: 0, color: pintura.color ?? '#FFFFFF', opacity: 1 },
          { at: 1, color: '#000000', opacity: 1 },
        ],
      })
    else onTrocarImagem()
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {!soSolido && <Escolha valor={pintura.type} opcoes={tipos} onChange={trocarTipo} titulo={t('Tipo de preenchimento')} className="w-full" />}
      {pintura.type === 'solid' && (
        <CampoCor
          cor={pintura.color}
          opacidade={pintura.opacity ?? 1}
          onChange={(color) => onChange({ ...pintura, color })}
          onOpacidade={(opacity) => onChange({ ...pintura, opacity })}
        />
      )}
      {pintura.type === 'linear' && (
        <>
          {(pintura.stops ?? []).map((parada, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-[10px] text-ink-400">{Math.round((parada.at ?? 0) * 100)}%</span>
              <CampoCor
                cor={parada.color}
                opacidade={parada.opacity ?? 1}
                onChange={(color) => onChange({ ...pintura, stops: pintura.stops.map((p, j) => (j === i ? { ...p, color } : p)) })}
                onOpacidade={(opacity) => onChange({ ...pintura, stops: pintura.stops.map((p, j) => (j === i ? { ...p, opacity } : p)) })}
              />
            </div>
          ))}
          <CampoNumero rotulo={<RotateCw size={11} />} titulo={t('Ângulo')} valor={pintura.angle ?? 180} sufixo="°" casas={0} onChange={(angle) => onChange({ ...pintura, angle })} />
        </>
      )}
      {pintura.type === 'image' && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTrocarImagem}
            title={t('Trocar imagem')}
            className="h-7 w-10 shrink-0 rounded border border-ink-200 bg-ink-100 bg-cover bg-center dark:border-ink-700 dark:bg-ink-800"
            style={pintura.src ? { backgroundImage: `url("${pintura.src}")` } : undefined}
          />
          <Escolha
            valor={pintura.fit ?? 'fill'}
            titulo={t('Ajuste da imagem')}
            onChange={(fit) => onChange({ ...pintura, fit })}
            opcoes={[
              { valor: 'fill', rotulo: t('Preencher') },
              { valor: 'fit', rotulo: t('Caber') },
              { valor: 'stretch', rotulo: t('Esticar') },
              { valor: 'tile', rotulo: t('Repetir') },
            ]}
            className="flex-1"
          />
        </div>
      )}
    </div>
  )
}

/** Lista de pinturas (preenchimento ou borda) de uma propriedade da camada. */
function ListaDePinturas({ titulo, campo, itens, editar, onTrocarImagem, soSolido, extra }) {
  const lista = comum(itens, (i) => i.camada[campo] ?? [])
  const definir = (fn) => editar((c) => ({ ...c, [campo]: fn(c[campo] ?? []) }))
  return (
    <Secao titulo={titulo} vazio={lista?.length === 0} onAdicionar={() => definir((l) => [...l, soSolido ? { type: 'solid', color: '#000000', opacity: 1 } : novaPintura()])}>
      {lista == null && <p className="text-[11px] text-ink-400">{t('Clique em + para substituir os valores mistos.')}</p>}
      {/* A de cima na lista é a de cima na pilha, como no Figma. */}
      {lista &&
        [...lista.keys()].reverse().map((i) => (
          <LinhaDeItem
            key={i}
            visivel={lista[i].visible !== false}
            onVisivel={() => definir((l) => l.map((p, j) => (j === i ? { ...p, visible: p.visible === false } : p)))}
            onRemover={() => definir((l) => l.filter((_, j) => j !== i))}
          >
            <EditorDePintura
              pintura={lista[i]}
              soSolido={soSolido}
              onChange={(nova) => definir((l) => l.map((p, j) => (j === i ? nova : p)))}
              onTrocarImagem={() => onTrocarImagem((src) => definir((l) => l.map((p, j) => (j === i ? { type: 'image', src, fit: p.fit ?? 'fill' } : p))))}
            />
          </LinhaDeItem>
        ))}
      {extra}
    </Secao>
  )
}

function SecaoDeEfeitos({ itens, editar }) {
  const lista = comum(itens, (i) => i.camada.effects ?? [])
  const definir = (fn) => editar((c) => ({ ...c, effects: fn(c.effects ?? []) }))
  const tipos = [
    { valor: 'drop', rotulo: t('Sombra') },
    { valor: 'inner', rotulo: t('Sombra interna') },
    { valor: 'blur', rotulo: t('Desfoque da camada') },
    { valor: 'bgblur', rotulo: t('Desfoque do fundo') },
  ]
  return (
    <Secao titulo={t('Efeitos')} vazio={lista?.length === 0} onAdicionar={() => definir((l) => [...l, novoEfeito()])}>
      {lista?.map((e, i) => {
        const mudar = (campos) => definir((l) => l.map((x, j) => (j === i ? { ...x, ...campos } : x)))
        const sombra = e.type === 'drop' || e.type === 'inner'
        return (
          <div key={i} className="mb-1.5">
            <LinhaDeItem visivel={e.visible !== false} onVisivel={() => mudar({ visible: e.visible === false })} onRemover={() => definir((l) => l.filter((_, j) => j !== i))}>
              <Escolha valor={e.type} opcoes={tipos} onChange={(type) => mudar({ type })} titulo={t('Tipo de efeito')} className="w-full" />
            </LinhaDeItem>
            {sombra ? (
              <>
                <Grade colunas={4}>
                  <CampoNumero rotulo="X" valor={e.x ?? 0} onChange={(x) => mudar({ x })} casas={1} />
                  <CampoNumero rotulo="Y" valor={e.y ?? 4} onChange={(y) => mudar({ y })} casas={1} />
                  <CampoNumero rotulo="B" titulo={t('Desfoque')} valor={e.blur ?? 4} min={0} onChange={(blur) => mudar({ blur })} casas={1} />
                  <CampoNumero rotulo="S" titulo={t('Espalhamento')} valor={e.spread ?? 0} onChange={(spread) => mudar({ spread })} casas={1} />
                </Grade>
                <div className="mt-1.5 flex">
                  <CampoCor cor={e.color ?? '#000000'} opacidade={e.opacity ?? 0.25} onChange={(color) => mudar({ color })} onOpacidade={(opacity) => mudar({ opacity })} />
                </div>
              </>
            ) : (
              <CampoNumero rotulo={t('Desfoque')} valor={e.blur ?? 4} min={0} onChange={(blur) => mudar({ blur })} casas={1} />
            )}
          </div>
        )
      })}
    </Secao>
  )
}

function SecaoDeAutoLayout({ itens, editar, onAutoLayout }) {
  const frames = itens.filter((i) => i.camada.type === 'frame')
  if (!frames.length || frames.length !== itens.length) return null
  const comLayout = frames.every((i) => temLayout(i.camada))
  if (!comLayout) {
    return <Secao titulo={t('Auto layout')} vazio onAdicionar={onAutoLayout} tituloAdicionar={t('Adicionar auto layout (Shift+A)')} />
  }
  const l = (ler) => comum(frames, (i) => ler(i.camada.layout))
  const mudar = (campos) => editar((c) => ({ ...c, layout: { ...c.layout, ...campos } }))
  const modo = l((x) => x.mode)
  const padding = comum(frames, (i) => i.camada.layout.padding ?? [0, 0, 0, 0])
  const justify = l((x) => x.justify ?? 'start')
  const align = l((x) => x.align ?? 'start')
  const eixos = ['start', 'center', 'end']
  return (
    <Secao
      titulo={t('Auto layout')}
      acoes={
        <BotaoIcone titulo={t('Remover auto layout')} onClick={() => editar((c) => ({ ...c, layout: { ...c.layout, mode: 'none' } }))}>
          <Minus size={14} />
        </BotaoIcone>
      }
    >
      <div className="flex gap-1.5">
        <div className="flex-1">
          <Segmentado
            valor={modo}
            onChange={(mode) => mudar({ mode })}
            opcoes={[
              { valor: 'column', icone: ArrowDown, titulo: t('Vertical') },
              { valor: 'row', icone: ArrowRight, titulo: t('Horizontal') },
            ]}
          />
        </div>
        <BotaoIcone titulo={t('Quebrar linha')} ativo={l((x) => !!x.wrap) === true} onClick={() => mudar({ wrap: !l((x) => !!x.wrap) })}>
          <WrapText size={14} />
        </BotaoIcone>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {/* Caixa 3x3 do Figma: onde os filhos se juntam dentro do frame. */}
        <div className="grid h-[62px] w-[62px] shrink-0 grid-cols-3 gap-px rounded-md bg-ink-100 p-1 dark:bg-ink-800">
          {eixos.flatMap((linha) =>
            eixos.map((coluna) => {
              const [principal, cruzado] = modo === 'row' ? [coluna, linha] : [linha, coluna]
              const ativo = (justify === principal || (justify === 'between' && principal === 'start')) && align === cruzado
              return (
                <button
                  key={`${linha}${coluna}`}
                  type="button"
                  aria-label={`${linha} ${coluna}`}
                  onClick={() => mudar({ justify: justify === 'between' ? 'between' : principal, align: cruzado })}
                  className="flex items-center justify-center rounded-sm hover:bg-white dark:hover:bg-ink-700"
                >
                  <span className={cn('rounded-full', ativo ? 'h-2 w-2 bg-accent-600' : 'h-1 w-1 bg-ink-400')} />
                </button>
              )
            }),
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <CampoNumero
            rotulo={<MoveHorizontal size={11} className={modo === 'column' ? 'rotate-90' : ''} />}
            titulo={t('Espaço entre os itens')}
            valor={justify === 'between' ? null : l((x) => x.gap ?? 0)}
            min={0}
            casas={0}
            disabled={justify === 'between'}
            onChange={(gap) => mudar({ gap })}
          />
          <BotaoIcone
            titulo={t('Espaço distribuído')}
            ativo={justify === 'between'}
            onClick={() => mudar({ justify: justify === 'between' ? 'start' : 'between' })}
            className="w-full justify-start gap-1.5 px-1.5 text-[11px]"
          >
            <FoldVertical size={13} className={modo === 'row' ? 'rotate-90' : ''} />
            {t('Distribuir')}
          </BotaoIcone>
        </div>
      </div>
      <div className="mt-1.5">
        <Grade colunas={4}>
          {[
            ['↑', t('Margem interna de cima')],
            ['→', t('Margem interna da direita')],
            ['↓', t('Margem interna de baixo')],
            ['←', t('Margem interna da esquerda')],
          ].map(([seta, titulo], lado) => (
            <CampoNumero
              key={lado}
              rotulo={seta}
              titulo={titulo}
              valor={padding ? padding[lado] : null}
              min={0}
              casas={0}
              onChange={(n) =>
                editar((c) => {
                  const atual = [...(c.layout.padding ?? [0, 0, 0, 0])]
                  atual[lado] = n
                  return { ...c, layout: { ...c.layout, padding: atual } }
                })
              }
            />
          ))}
        </Grade>
      </div>
    </Secao>
  )
}

function SecaoDeTexto({ itens, editar }) {
  const textos = itens.filter((i) => i.camada.type === 'text')
  if (!textos.length || textos.length !== itens.length) return null
  const f = (ler) => comum(textos, (i) => ler(i.camada.font ?? {}))
  const mudar = (campos) => editar((c) => ({ ...c, font: { ...c.font, ...campos } }))
  const autoSize = comum(textos, (i) => i.camada.autoSize ?? 'width')
  const alturaDaLinha = f((x) => x.lineHeight ?? 'auto')
  return (
    <Secao titulo={t('Texto')}>
      <input
        list="design-fontes"
        defaultValue={f((x) => x.family ?? 'Segoe UI') ?? ''}
        key={f((x) => x.family ?? 'Segoe UI') ?? 'misto'}
        placeholder={t('Misto')}
        onBlur={(e) => e.target.value.trim() && mudar({ family: e.target.value.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label={t('Fonte')}
        className="mb-1.5 h-7 w-full rounded-md border border-transparent bg-ink-100 px-2 text-xs outline-none focus:border-accent-500 dark:bg-ink-800"
      />
      <datalist id="design-fontes">
        {FONTES_SUGERIDAS.map((nome) => (
          <option key={nome} value={nome} />
        ))}
      </datalist>
      <Grade>
        <Escolha
          valor={f((x) => String(x.weight ?? 400))}
          titulo={t('Peso')}
          onChange={(v) => mudar({ weight: Number(v) })}
          opcoes={PESOS_DE_FONTE.map((p) => ({ valor: String(p), rotulo: PESOS[p] }))}
        />
        <CampoNumero valor={f((x) => x.size ?? 16)} titulo={t('Tamanho')} min={1} max={1000} casas={1} onChange={(size) => mudar({ size })} sufixo="px" />
        <CampoNumero
          rotulo={<span className="text-[10px]">↕</span>}
          titulo={t('Altura da linha (vezes o tamanho; vazio = automática)')}
          valor={alturaDaLinha === 'auto' ? null : alturaDaLinha}
          vazio={alturaDaLinha === 'auto' ? t('Auto') : undefined}
          min={0.5}
          max={5}
          passo={0.05}
          onChange={(lineHeight) => mudar({ lineHeight })}
        />
        <CampoNumero rotulo={<span className="text-[10px]">|A|</span>} titulo={t('Espaço entre letras')} valor={f((x) => x.letterSpacing ?? 0)} passo={0.1} casas={1} sufixo="px" onChange={(letterSpacing) => mudar({ letterSpacing })} />
      </Grade>
      <div className="mt-1.5 flex gap-1.5">
        <div className="flex-1">
          <Segmentado
            valor={f((x) => x.align ?? 'left')}
            onChange={(align) => mudar({ align })}
            opcoes={[
              { valor: 'left', icone: AlignLeft, titulo: t('Alinhar à esquerda') },
              { valor: 'center', icone: AlignCenter, titulo: t('Centralizar') },
              { valor: 'right', icone: AlignRight, titulo: t('Alinhar à direita') },
              { valor: 'justify', icone: AlignJustify, titulo: t('Justificar') },
            ]}
          />
        </div>
        <Segmentado
          valor={f((x) => x.valign ?? 'top')}
          onChange={(valign) => editar((c) => ({ ...c, autoSize: 'fixed', font: { ...c.font, valign } }))}
          opcoes={[
            { valor: 'top', icone: ArrowUpToLine, titulo: t('Topo') },
            { valor: 'middle', icone: AlignCenterHorizontal, titulo: t('Meio') },
            { valor: 'bottom', icone: ArrowDownToLine, titulo: t('Base') },
          ]}
        />
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <div className="flex-1">
          <Segmentado
            valor={autoSize}
            onChange={(v) => editar((c) => ({ ...c, autoSize: v }))}
            opcoes={[
              { valor: 'width', icone: MoveHorizontal, titulo: t('Largura automática') },
              { valor: 'height', icone: MoveVertical, titulo: t('Altura automática') },
              { valor: 'fixed', icone: Square, titulo: t('Tamanho fixo') },
            ]}
          />
        </div>
      </div>
      <div className="mt-1.5 flex gap-0.5">
        <BotaoIcone titulo={t('Itálico')} ativo={f((x) => !!x.italic) === true} onClick={() => mudar({ italic: !f((x) => !!x.italic) })}>
          <Italic size={14} />
        </BotaoIcone>
        <BotaoIcone titulo={t('Sublinhado')} ativo={f((x) => x.decoration) === 'underline'} onClick={() => mudar({ decoration: f((x) => x.decoration) === 'underline' ? 'none' : 'underline' })}>
          <Underline size={14} />
        </BotaoIcone>
        <BotaoIcone titulo={t('Tachado')} ativo={f((x) => x.decoration) === 'line-through'} onClick={() => mudar({ decoration: f((x) => x.decoration) === 'line-through' ? 'none' : 'line-through' })}>
          <Strikethrough size={14} />
        </BotaoIcone>
        <BotaoIcone titulo={t('Maiúsculas')} ativo={f((x) => x.case) === 'uppercase'} onClick={() => mudar({ case: f((x) => x.case) === 'uppercase' ? 'none' : 'uppercase' })}>
          <CaseUpper size={14} />
        </BotaoIcone>
      </div>
    </Secao>
  )
}

const RESTRICOES_H = [
  { valor: 'left', get rotulo() { return t('Esquerda') } },
  { valor: 'right', get rotulo() { return t('Direita') } },
  { valor: 'leftright', get rotulo() { return t('Esquerda e direita') } },
  { valor: 'center', get rotulo() { return t('Centro') } },
  { valor: 'scale', get rotulo() { return t('Escala') } },
]
const RESTRICOES_V = [
  { valor: 'top', get rotulo() { return t('Topo') } },
  { valor: 'bottom', get rotulo() { return t('Base') } },
  { valor: 'topbottom', get rotulo() { return t('Topo e base') } },
  { valor: 'center', get rotulo() { return t('Centro') } },
  { valor: 'scale', get rotulo() { return t('Escala') } },
]

function AbaDesign({ itens, editar, acoes, pagina, ferramenta }) {
  const [escala, setEscala] = useState('2')
  const [formato, setFormato] = useState('png')
  const [cantos, setCantos] = useState(false)

  if (!itens.length) {
    return (
      <>
        {ferramenta === 'frame' && (
          <Secao titulo={t('Tamanhos de frame')}>
            {PRESETS_DE_FRAME.map((g) => (
              <div key={g.grupo} className="mb-2">
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">{g.grupo}</p>
                {g.itens.map((p) => (
                  <button
                    key={p.nome}
                    type="button"
                    onClick={() => acoes.criarFrame(p)}
                    className="flex h-7 w-full items-center justify-between rounded-md px-1.5 text-xs text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                  >
                    <span>{p.nome}</span>
                    <span className="tabular-nums text-ink-400">
                      {`${p.w}\u00D7${p.h}`}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </Secao>
        )}
        <Secao titulo={t('Página')}>
          <div className="flex items-center gap-1.5">
            <CampoCor cor={pagina?.background ?? null} comOpacidade={false} vazio={t('Tema')} onChange={(cor) => acoes.fundoDaPagina(cor)} />
            {pagina?.background && (
              <BotaoIcone titulo={t('Voltar à cor do tema')} onClick={() => acoes.fundoDaPagina(null)}>
                <Minus size={14} />
              </BotaoIcone>
            )}
          </div>
          {!pagina?.background && <p className="mt-1 text-[11px] text-ink-400">{t('Sem cor: o fundo segue o tema do app.')}</p>}
        </Secao>
      </>
    )
  }

  const so = (tipos) => itens.every((i) => tipos.includes(i.camada.type))
  const algumNoFluxo = itens.some((i) => noFluxo(i.camada, i.pai))
  const linhas = so(['line'])
  const raio = comum(itens, (i) => i.camada.radius ?? 0)
  const comRaio = so(['rect', 'frame'])
  const dentroDeFrame = itens.every((i) => i.pai?.type === 'frame' && !noFluxo(i.camada, i.pai))
  const opacidade = comum(itens, (i) => i.camada.opacity ?? 1)
  const paiTemLayout = itens.every((i) => noFluxo(i.camada, i.pai) || (i.camada.absolute && temLayout(i.pai)))

  /** Muda o tamanho de um eixo; texto e auto layout deixam de se ajustar sozinhos nele. */
  const tamanho = (eixo, valor) =>
    acoes.redimensionar((c) => {
      const campos = { [eixo]: valor }
      if (c.type === 'text') campos.autoSize = eixo === 'w' && c.autoSize === 'width' ? 'height' : 'fixed'
      if (c.sizing?.[eixo === 'w' ? 'h' : 'v'] && c.sizing[eixo === 'w' ? 'h' : 'v'] !== 'fixed') {
        campos.sizing = { ...c.sizing, [eixo === 'w' ? 'h' : 'v']: 'fixed' }
      }
      return campos
    })

  return (
    <>
      <Secao titulo={t('Posição')}>
        <div className="mb-1.5 flex items-center justify-between">
          {[
            ['esquerda', AlignStartVertical, t('Alinhar à esquerda (Alt+A)')],
            ['centroH', AlignCenterVertical, t('Centralizar na horizontal (Alt+H)')],
            ['direita', AlignEndVertical, t('Alinhar à direita (Alt+D)')],
            ['topo', AlignStartHorizontal, t('Alinhar ao topo (Alt+W)')],
            ['centroV', AlignCenterHorizontal, t('Centralizar na vertical (Alt+V)')],
            ['base', AlignEndHorizontal, t('Alinhar à base (Alt+S)')],
          ].map(([modo, Icone, titulo]) => (
            <BotaoIcone key={modo} titulo={titulo} disabled={algumNoFluxo} onClick={() => acoes.alinhar(modo)}>
              <Icone size={15} />
            </BotaoIcone>
          ))}
          <BotaoIcone titulo={t('Distribuir na horizontal')} disabled={itens.length < 3 || algumNoFluxo} onClick={() => acoes.distribuir('x')}>
            <AlignHorizontalDistributeCenter size={15} />
          </BotaoIcone>
          <BotaoIcone titulo={t('Distribuir na vertical')} disabled={itens.length < 3 || algumNoFluxo} onClick={() => acoes.distribuir('y')}>
            <AlignVerticalDistributeCenter size={15} />
          </BotaoIcone>
        </div>
        <Grade>
          <CampoNumero rotulo="X" valor={comum(itens, (i) => i.camada.x)} disabled={algumNoFluxo} onChange={(x) => acoes.mover({ x })} />
          <CampoNumero rotulo="Y" valor={comum(itens, (i) => i.camada.y)} disabled={algumNoFluxo} onChange={(y) => acoes.mover({ y })} />
          <CampoNumero rotulo={linhas ? t('C') : 'W'} titulo={linhas ? t('Comprimento') : t('Largura')} valor={comum(itens, (i) => i.camada.w)} min={linhas ? 0 : 1} onChange={(v) => tamanho('w', v)} />
          {!linhas && <CampoNumero rotulo="H" titulo={t('Altura')} valor={comum(itens, (i) => i.camada.h)} min={1} onChange={(v) => tamanho('h', v)} />}
          <CampoNumero
            rotulo={<RotateCw size={11} />}
            titulo={t('Rotação')}
            valor={comum(itens, (i) => i.camada.rotation ?? 0)}
            sufixo="°"
            casas={1}
            onChange={(rotation) => editar((c) => ({ ...c, rotation: ((((rotation + 180) % 360) + 360) % 360) - 180 }))}
          />
          {comRaio && !cantos && (
            <CampoNumero
              rotulo={<Scan size={11} />}
              titulo={t('Raio dos cantos')}
              valor={Array.isArray(raio) ? null : raio}
              min={0}
              casas={1}
              onChange={(radius) => editar((c) => ({ ...c, radius }))}
            />
          )}
        </Grade>
        {comRaio && (
          <>
            {cantos && (
              <div className="mt-1.5">
                <Grade colunas={4}>
                  {[0, 1, 2, 3].map((i) => (
                    <CampoNumero
                      key={i}
                      titulo={[t('Superior esquerdo'), t('Superior direito'), t('Inferior direito'), t('Inferior esquerdo')][i]}
                      valor={raio == null ? null : Array.isArray(raio) ? raio[i] : raio}
                      min={0}
                      casas={1}
                      onChange={(n) =>
                        editar((c) => {
                          const atual = Array.isArray(c.radius) ? [...c.radius] : Array(4).fill(c.radius ?? 0)
                          atual[i] = n
                          return { ...c, radius: atual }
                        })
                      }
                    />
                  ))}
                </Grade>
              </div>
            )}
            <button type="button" onClick={() => setCantos((v) => !v)} className="mt-1 text-[11px] text-accent-700 hover:underline dark:text-accent-300">
              {cantos ? t('Mesmo raio nos quatro cantos') : t('Raio por canto')}
            </button>
          </>
        )}
        {so(['frame']) && (
          <label className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-600 dark:text-ink-300">
            <input
              type="checkbox"
              checked={comum(itens, (i) => !!i.camada.clip) === true}
              onChange={(e) => editar((c) => ({ ...c, clip: e.target.checked }))}
              className="accent-[rgb(var(--accent-600))]"
            />
            {t('Recortar conteúdo')}
          </label>
        )}
      </Secao>

      <SecaoDeAutoLayout itens={itens} editar={editar} onAutoLayout={acoes.autoLayout} />

      {(algumNoFluxo || so(['frame']) || paiTemLayout) && (
        <Secao titulo={t('Dimensionamento')}>
          <Grade>
            {['h', 'v'].map((eixo) => {
              const opcoes = [{ valor: 'fixed', rotulo: eixo === 'h' ? t('Largura fixa') : t('Altura fixa') }]
              if (itens.every((i) => temLayout(i.camada) || i.camada.type === 'text')) opcoes.push({ valor: 'hug', rotulo: t('Abraçar conteúdo') })
              if (algumNoFluxo) opcoes.push({ valor: 'fill', rotulo: t('Preencher') })
              return (
                <Escolha
                  key={eixo}
                  valor={comum(itens, (i) => i.camada.sizing?.[eixo] ?? 'fixed')}
                  titulo={eixo === 'h' ? t('Largura') : t('Altura')}
                  opcoes={opcoes}
                  onChange={(v) =>
                    editar((c) => ({
                      ...c,
                      sizing: { ...c.sizing, [eixo]: v },
                      ...(c.type === 'text' && v === 'hug' ? { autoSize: eixo === 'h' ? 'width' : c.autoSize === 'fixed' ? 'height' : c.autoSize } : {}),
                    }))
                  }
                />
              )
            })}
          </Grade>
          {paiTemLayout && (
            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-600 dark:text-ink-300">
              <input
                type="checkbox"
                checked={comum(itens, (i) => !!i.camada.absolute) === true}
                onChange={(e) => editar((c) => ({ ...c, absolute: e.target.checked }))}
                className="accent-[rgb(var(--accent-600))]"
              />
              {t('Posição absoluta (fora do auto layout)')}
            </label>
          )}
        </Secao>
      )}

      {dentroDeFrame && (
        <Secao titulo={t('Restrições')}>
          <Grade>
            <Escolha
              valor={comum(itens, (i) => i.camada.constraints?.h ?? 'left')}
              titulo={t('Horizontal')}
              opcoes={RESTRICOES_H}
              onChange={(h) => editar((c) => ({ ...c, constraints: { ...{ h: 'left', v: 'top' }, ...c.constraints, h } }))}
            />
            <Escolha
              valor={comum(itens, (i) => i.camada.constraints?.v ?? 'top')}
              titulo={t('Vertical')}
              opcoes={RESTRICOES_V}
              onChange={(v) => editar((c) => ({ ...c, constraints: { ...{ h: 'left', v: 'top' }, ...c.constraints, v } }))}
            />
          </Grade>
        </Secao>
      )}

      <Secao titulo={t('Camada')}>
        <CampoNumero
          rotulo={t('Opacidade')}
          valor={opacidade == null ? null : Math.round(opacidade * 100)}
          min={0}
          max={100}
          casas={0}
          sufixo="%"
          onChange={(n) => editar((c) => ({ ...c, opacity: n / 100 }))}
        />
      </Secao>

      <SecaoDeTexto itens={itens} editar={editar} />

      {!so(['group']) && !linhas && (
        <ListaDePinturas titulo={so(['text']) ? t('Cor do texto') : t('Preenchimento')} campo="fills" itens={itens} editar={editar} onTrocarImagem={acoes.escolherImagem} soSolido={so(['text'])} />
      )}
      {!so(['group']) && (
        <ListaDePinturas
          titulo={linhas ? t('Traço') : t('Borda')}
          campo="strokes"
          itens={itens}
          editar={editar}
          soSolido
          extra={
            comum(itens, (i) => i.camada.strokes?.length ?? 0) !== 0 && (
              <Grade>
                <CampoNumero rotulo={<Minus size={11} />} titulo={t('Espessura')} valor={comum(itens, (i) => i.camada.strokeWidth ?? 1)} min={0} casas={1} onChange={(strokeWidth) => editar((c) => ({ ...c, strokeWidth }))} />
                {!linhas && !so(['text']) && (
                  <Escolha
                    valor={comum(itens, (i) => i.camada.strokeAlign ?? 'inside')}
                    titulo={t('Posição da borda')}
                    onChange={(strokeAlign) => editar((c) => ({ ...c, strokeAlign }))}
                    opcoes={[
                      { valor: 'inside', rotulo: t('Dentro') },
                      { valor: 'center', rotulo: t('Centro') },
                      { valor: 'outside', rotulo: t('Fora') },
                    ]}
                  />
                )}
              </Grade>
            )
          }
        />
      )}
      {!so(['group']) && <SecaoDeEfeitos itens={itens} editar={editar} />}

      <Secao titulo={t('Exportar')}>
        <div className="flex gap-1.5">
          <Escolha
            valor={escala}
            titulo={t('Escala')}
            onChange={setEscala}
            opcoes={['0.5', '1', '2', '3', '4'].map((v) => ({ valor: v, rotulo: `${v}x` }))}
            className="w-16"
          />
          <Escolha
            valor={formato}
            titulo={t('Formato')}
            onChange={setFormato}
            opcoes={[
              { valor: 'png', rotulo: 'PNG' },
              { valor: 'jpg', rotulo: 'JPG' },
              { valor: 'svg', rotulo: 'SVG' },
            ]}
            className="flex-1"
          />
        </div>
        <button
          type="button"
          onClick={() => acoes.exportar({ formato, escala: Number(escala) })}
          className="mt-1.5 h-7 w-full rounded-md border border-ink-200 text-xs font-medium text-ink-700 transition hover:bg-ink-100 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
        >
          {itens.length === 1 ? t('Exportar {nome}', { nome: nomeDaCamada(itens[0].camada) }) : t('Exportar seleção')}
        </button>
      </Secao>
    </>
  )
}

function AbaCodigo({ itens }) {
  const [copiado, setCopiado] = useState(null)
  if (!itens.length) return <p className="px-3 py-3 text-[11px] leading-relaxed text-ink-400">{t('Selecione uma camada para ver o CSS dela.')}</p>
  return itens.slice(0, 10).map(({ camada, pai }) => {
    const css = cssDaCamada(camada, pai)
    return (
      <section key={camada.id} className="border-b border-ink-200 px-3 py-2.5 dark:border-ink-800">
        <header className="mb-1.5 flex items-center justify-between">
          <h3 className="truncate text-[11px] font-semibold text-ink-700 dark:text-ink-200">{nomeDaCamada(camada)}</h3>
          <BotaoIcone
            titulo={t('Copiar CSS')}
            onClick={() => {
              copiarTexto(css)
              setCopiado(camada.id)
              setTimeout(() => setCopiado(null), 1200)
            }}
          >
            {copiado === camada.id ? <Check size={13} /> : <Copy size={13} />}
          </BotaoIcone>
        </header>
        <pre className="overflow-x-auto whitespace-pre rounded-md bg-ink-100 p-2 font-mono text-[11px] leading-relaxed text-ink-700 dark:bg-ink-800 dark:text-ink-200">{css}</pre>
        {camada.type === 'text' && camada.text && (
          <pre className="mt-1.5 whitespace-pre-wrap rounded-md bg-ink-100 p-2 text-[11px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">{camada.text}</pre>
        )}
      </section>
    )
  })
}

export default function PainelDePropriedades({ itens, editar, acoes, pagina, ferramenta, somenteLeitura }) {
  const [aba, setAba] = useState('design')
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-ink-200 px-2 dark:border-ink-800">
        {[
          ['design', t('Design')],
          ['codigo', t('Código')],
        ].map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={cn(
              'h-7 rounded-md px-2 text-[11px] font-semibold transition',
              aba === id ? 'bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-ink-50' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-100',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {aba === 'codigo' || somenteLeitura ? (
          <AbaCodigo itens={itens} />
        ) : (
          <AbaDesign itens={itens} editar={editar} acoes={acoes} pagina={pagina} ferramenta={ferramenta} />
        )}
      </div>
    </div>
  )
}

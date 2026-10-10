import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CalendarDays,
  Check,
  ChevronDown,
  Code2,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  PaintBucket,
  Quote,
  Redo2,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react'
import ColorWheel from '@/components/ui/ColorWheel'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * A barra de funções da nota — o "cabeçalho de funções" do Word.
 *
 * Uma só, fixa no topo da página, agindo sobre o trecho onde o cursor
 * está. Antes cada trecho de texto tinha a sua, que só aparecia com foco:
 * a formatação mudava de lugar a cada clique, e o que não era texto
 * (checklist, tabela, código) só nascia clicando entre os blocos.
 *
 * Tudo aqui também tem caminho de teclado (`lib/atalhos.js`, grupo Nota):
 * a barra é para quem prefere ver, e para o toque, onde não há teclado.
 *
 * Os botões não roubam o foco (`mousedown` cancelado): a seleção continua
 * no texto e o comando cai nela. Os `<select>` roubam por natureza, então
 * pedem antes que o trecho guarde a seleção.
 */

const BLOCOS = [
  { value: 'p', get label() { return t('Texto normal') } },
  { value: 'h1', get label() { return t('Título 1') } },
  { value: 'h2', get label() { return t('Título 2') } },
  { value: 'h3', get label() { return t('Título 3') } },
  { value: 'blockquote', get label() { return t('Citação') } },
]

/**
 * Fontes pelo nome, como no Word, cada uma escrita nela mesma na lista.
 * São as que vêm no Windows; num aparelho sem a fonte o texto cai na
 * fonte das notas. "Padrão" (vazio) é a fonte das notas, de Aparência.
 */
const FONTES = [
  '', 'Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Garamond',
  'Georgia', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
]

/** Tamanhos em pt, os mesmos da lista do Word. */
const TAMANHOS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

/**
 * Cores de letra em duas fileiras, como no Word: em cima os tons do Notefy
 * (os mesmos da cor de destaque e das pastas), embaixo as "cores padrão" do
 * próprio Word, para quem quer o vermelho de sempre. "Automática" é a cor do
 * tema — preto e branco puros sumiriam num dos dois.
 */
const CORES_DE_TEXTO = [
  '#70864C', '#3E6A8A', '#2F7A6B', '#B08A3E', '#8A3B44', '#A0526D', '#6E5A8A', '#5B6470', '#9A5B3C', '#8C8A86',
  '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
]

const CORES_DE_DESTAQUE = [
  '#FEF08A', '#FED7AA', '#FECACA', '#FBCFE8', '#DDD6FE', '#BFDBFE', '#A5F3FC', '#BBF7D0', '#D9F99D', '#E5E7EB',
]

const ALINHAMENTOS = [
  { cmd: 'justifyLeft', icon: AlignLeft, get label() { return t('Alinhar à esquerda') } },
  { cmd: 'justifyCenter', icon: AlignCenter, get label() { return t('Centralizar') } },
  { cmd: 'justifyRight', icon: AlignRight, get label() { return t('Alinhar à direita') } },
  { cmd: 'justifyFull', icon: AlignJustify, get label() { return t('Justificar') } },
]

/** Última cor usada: é a que o clique no "A" aplica, como no Word. Fica por aparelho. */
function lembrar(chave, padrao) {
  try {
    return localStorage.getItem(chave) || padrao
  } catch {
    return padrao
  }
}
function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    /* modo privado: fica só nesta sessão */
  }
}

const naoRoubaFoco = (event) => event.preventDefault()

// As peças da barra são as mesmas na planilha (`BarraDaPlanilha`): as duas
// barras têm de parecer a mesma ferramenta.
export function Botao({ icon: Icon, rotulo, ativo = false, desligado = false, onClick, children, className }) {
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ativo}
      disabled={desligado}
      onMouseDown={naoRoubaFoco}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded px-1.5 text-ink-500 transition',
        'hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100',
        'disabled:pointer-events-none disabled:opacity-35',
        '[@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:min-w-10',
        ativo && 'bg-ink-100 text-accent-700 dark:bg-ink-800 dark:text-accent-300',
        className,
      )}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  )
}

export function Divisoria() {
  return <span aria-hidden className="mx-px h-5 w-px shrink-0 bg-ink-200 dark:bg-ink-700" />
}

export function Escolha({ valor, opcoes, rotulo, desligado, onEscolher, onAntes, className }) {
  return (
    <select
      value={valor}
      disabled={desligado}
      aria-label={rotulo}
      title={rotulo}
      onMouseDown={onAntes}
      onFocus={onAntes}
      onChange={(e) => onEscolher(e.target.value)}
      className={cn(
        // A setinha é a do próprio <select>: padding à direita só somaria
        // espaço vazio e cortaria o nome do estilo.
        'h-8 shrink-0 cursor-pointer rounded border-0 bg-transparent py-0 pl-1.5 pr-1 text-xs text-ink-600 transition',
        'hover:bg-ink-100 focus:ring-1 focus:ring-accent-400 disabled:opacity-35 dark:text-ink-300 dark:hover:bg-ink-800',
        '[@media(pointer:coarse)]:h-10',
        className,
      )}
    >
      {opcoes.map((o) => (
        <option key={o.value} value={o.value} style={o.estilo}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/**
 * Tamanho da fonte como no Word: digita o número (13, 15, 100...) e Enter,
 * ou abre a lista pela setinha. Fora do foco, o campo mostra o tamanho de
 * onde está o cursor.
 *
 * A lista é do app, e não um `<datalist>`: aquele filtrava pelo que já
 * estava escrito (digitar "1" deixava só 10 a 18) e não tinha setinha —
 * não havia como ver os tamanhos-padrão sem apagar o campo.
 */
function TamanhoDaFonte({ tamanho, desligado, onAntes, onAplicar }) {
  const ancora = useRef(null)
  const [aberto, setAberto] = useState(false)
  const [rascunho, setRascunho] = useState(null)
  const aplicar = (valor) => {
    const n = Math.round(Number(String(valor).replace(',', '.')))
    setRascunho(null)
    setAberto(false)
    if (n >= 1 && n <= 400 && n !== tamanho) onAplicar(n)
  }
  return (
    <div ref={ancora} className="flex shrink-0 items-center">
      <input
        type="text"
        inputMode="numeric"
        value={rascunho ?? String(tamanho)}
        disabled={desligado}
        aria-label={t('Tamanho da fonte')}
        title={t('Tamanho da fonte')}
        onMouseDown={onAntes}
        onFocus={(e) => {
          onAntes?.()
          e.currentTarget.select()
        }}
        onChange={(e) => setRascunho(e.target.value.replace(/[^\d,.]/g, '').slice(0, 3))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            aplicar(e.currentTarget.value)
          } else if (e.key === 'Escape') {
            setRascunho(null)
          } else if (e.key === 'ArrowDown' && e.altKey) {
            e.preventDefault()
            setAberto(true)
          }
        }}
        onBlur={(e) => rascunho !== null && aplicar(e.currentTarget.value)}
        className={cn(
          'h-8 w-9 shrink-0 rounded-l border-0 bg-transparent px-1.5 text-xs tabular-nums text-ink-600 transition',
          'hover:bg-ink-100 focus:bg-white focus:ring-1 focus:ring-accent-400 disabled:opacity-35 dark:text-ink-300 dark:hover:bg-ink-800 dark:focus:bg-ink-900',
          '[@media(pointer:coarse)]:h-10',
        )}
      />
      <Botao
        rotulo={t('Tamanhos da fonte')}
        desligado={desligado}
        ativo={aberto}
        onClick={() => {
          onAntes?.()
          setAberto((v) => !v)
        }}
        className="min-w-5 rounded-l-none px-0.5 [@media(pointer:coarse)]:min-w-7"
      >
        <ChevronDown size={11} />
      </Botao>
      <Painel ancora={ancora} aberto={aberto} onFechar={() => setAberto(false)} largura={88}>
        <div className="max-h-72 overflow-y-auto">
          {TAMANHOS.map((n) => (
            <button
              key={n}
              type="button"
              role="menuitemradio"
              aria-checked={n === tamanho}
              onMouseDown={naoRoubaFoco}
              onClick={() => aplicar(n)}
              className={cn(
                'flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs tabular-nums text-ink-700 transition hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
                '[@media(pointer:coarse)]:py-2',
                n === tamanho && 'font-semibold text-accent-700 dark:text-accent-300',
              )}
            >
              {n}
              {n === tamanho && <Check size={12} />}
            </button>
          ))}
        </div>
      </Painel>
    </div>
  )
}

/**
 * Painel que abre de um botão da barra.
 *
 * Posição FIXA, calculada do botão: no celular a barra rola de lado
 * (`overflow-x-auto`), e um painel `absolute` dentro dela seria cortado
 * pela própria barra.
 */
export function Painel({ ancora, aberto, onFechar, children, largura = 'auto' }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!aberto || !ancora.current || !ref.current) return
    const botao = ancora.current.getBoundingClientRect()
    const painel = ref.current.getBoundingClientRect()
    const cabeEmbaixo = botao.bottom + 4 + painel.height <= window.innerHeight - 8
    setPos({
      top: cabeEmbaixo ? botao.bottom + 4 : Math.max(8, botao.top - 4 - painel.height),
      left: Math.min(Math.max(8, botao.left), window.innerWidth - painel.width - 8),
    })
  }, [aberto, ancora])

  if (!aberto) return null
  // Em portal: a barra mora num contêiner com `backdrop-blur`, e
  // `backdrop-filter` vira a referência do `position: fixed` — o painel
  // abria deslocado pela largura da barra lateral, longe do botão.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onMouseDown={onFechar} aria-hidden />
      <div
        ref={ref}
        role="menu"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: largura }}
        className="fixed z-[71] animate-fade-in rounded-lg border border-ink-200 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-900"
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

/**
 * Cor da letra (ou do marca-texto): botão dividido, como no Word.
 *
 * O lado esquerdo aplica a ÚLTIMA cor usada — pintar cinco palavras de
 * vermelho são cinco cliques, e não quinze. A setinha abre a paleta, com
 * "Automática" (volta à cor do tema) e o quadrado cromático para qualquer
 * outra cor, como o círculo das outras paletas do app.
 */
const SELETORES_DE_COR = {
  texto: {
    chave: 'notefy.nota.corDoTexto',
    padrao: '#C00000',
    cores: CORES_DE_TEXTO,
    get rotulo() { return t('Cor da letra') },
    get mais() { return t('Mais cores de letra') },
    get nenhuma() { return t('Automática') },
  },
  destaque: {
    chave: 'notefy.nota.corDoDestaque',
    padrao: '#FEF08A',
    cores: CORES_DE_DESTAQUE,
    icone: Highlighter,
    get rotulo() { return t('Marca-texto') },
    get mais() { return t('Mais cores de marca-texto') },
    get nenhuma() { return t('Sem marca-texto') },
  },
  // O balde do Excel, para o fundo da célula. Tons claros, como os do
  // marca-texto: a letra continua legível por cima nos dois temas.
  preenchimento: {
    chave: 'notefy.planilha.corDoPreenchimento',
    padrao: '#FEF08A',
    cores: CORES_DE_DESTAQUE,
    icone: PaintBucket,
    get rotulo() { return t('Cor de preenchimento') },
    get mais() { return t('Mais cores de preenchimento') },
    get nenhuma() { return t('Sem preenchimento') },
  },
}

export function SeletorDeCor({ tipo, desligado, onAplicar, onAntes }) {
  const ancora = useRef(null)
  const [aberto, setAberto] = useState(false)
  const config = SELETORES_DE_COR[tipo]
  const { chave, cores, icone: Icone } = config
  const [ultima, setUltima] = useState(() => lembrar(chave, config.padrao))
  const rotulo = config.rotulo

  const aplicar = (cor) => {
    if (cor) {
      setUltima(cor)
      guardar(chave, cor)
    }
    setAberto(false)
    onAplicar(cor)
  }

  return (
    <div ref={ancora} className="flex shrink-0 items-center">
      <Botao
        rotulo={`${rotulo} (${ultima})`}
        desligado={desligado}
        onClick={() => aplicar(ultima)}
        className="rounded-r-none pr-1"
      >
        <span className="flex flex-col items-center leading-none">
          {Icone ? <Icone size={14} /> : <span className="text-[14px] font-semibold">A</span>}
          <span className="mt-0.5 h-[3px] w-4 rounded-full" style={{ backgroundColor: ultima }} />
        </span>
      </Botao>
      <Botao
        rotulo={config.mais}
        desligado={desligado}
        ativo={aberto}
        onClick={() => {
          onAntes?.()
          setAberto((v) => !v)
        }}
        className="min-w-5 rounded-l-none px-0.5 [@media(pointer:coarse)]:min-w-7"
      >
        <ChevronDown size={11} />
      </Botao>

      <Painel ancora={ancora} aberto={aberto} onFechar={() => setAberto(false)} largura={tipo === 'texto' ? 262 : 238}>
        <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onMouseDown={naoRoubaFoco}
          onClick={() => aplicar(null)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          <span
            className={cn(
              'h-4 w-4 shrink-0 rounded border border-ink-300 dark:border-ink-600',
              tipo === 'texto' ? 'bg-ink-800 dark:bg-ink-100' : 'bg-[linear-gradient(45deg,transparent_45%,#ef4444_45%,#ef4444_55%,transparent_55%)]',
            )}
          />
          {config.nenhuma}
        </button>
        {/* Qualquer outra cor: o quadrado cromático, como o círculo das
            outras paletas do app (e não um texto "Cor personalizada"). */}
        <ColorWheel
          quadrado
          value={/^#[0-9a-f]{6}$/i.test(ultima) ? ultima : undefined}
          selected={!cores.some((c) => c.toLowerCase() === ultima.toLowerCase())}
          // Aplicar a cada movimento fechava a paleta (e o seletor junto) no
          // primeiro toque: a cor escolhida de fato só entrava clicando no "A".
          onChange={setUltima}
          onConfirmar={aplicar}
          className="h-[22px] w-[22px] shrink-0"
        />
        </div>
        <div className={cn('grid gap-1', tipo === 'texto' ? 'grid-cols-10' : 'grid-cols-5')}>
          {cores.map((cor) => (
            <button
              key={cor}
              type="button"
              title={cor}
              aria-label={cor}
              onMouseDown={naoRoubaFoco}
              onClick={() => aplicar(cor)}
              style={{ backgroundColor: cor }}
              className={cn(
                'relative h-[22px] w-[22px] rounded border border-black/10 transition hover:scale-110 dark:border-white/10',
                tipo !== 'texto' && 'h-8 w-full',
                '[@media(pointer:coarse)]:h-7',
              )}
            >
              {cor.toLowerCase() === ultima.toLowerCase() && (
                <Check size={12} className="absolute inset-0 m-auto text-white mix-blend-difference" />
              )}
            </button>
          ))}
        </div>
      </Painel>
    </div>
  )
}

/**
 * Menu de um botão: alinhamento e "mais itens para inserir".
 *
 * `{ separator: true }` na lista desenha uma divisória entre grupos.
 */
export function MenuDaBarra({ icon, rotulo, itens, desligado, ativo: ligado = false, largura = 220, className }) {
  const ancora = useRef(null)
  const [aberto, setAberto] = useState(false)
  return (
    <div ref={ancora} className="flex shrink-0">
      <Botao rotulo={rotulo} ativo={aberto || ligado} desligado={desligado} onClick={() => setAberto((v) => !v)} className={className}>
        {icon}
        <ChevronDown size={11} className={icon ? '-ml-0.5' : undefined} />
      </Botao>
      <Painel ancora={ancora} aberto={aberto} onFechar={() => setAberto(false)} largura={largura}>
        {itens.map(({ icon: Icon, label, atalho, ativo, onClick, disabled, separator }, i) =>
          separator ? (
            <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-ink-100 dark:bg-ink-800" />
          ) : (
          <button
            key={label}
            type="button"
            role="menuitem"
            disabled={disabled}
            onMouseDown={naoRoubaFoco}
            onClick={() => {
              setAberto(false)
              onClick()
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] text-ink-700 transition hover:bg-ink-100 disabled:opacity-40 dark:text-ink-200 dark:hover:bg-ink-800',
              '[@media(pointer:coarse)]:py-2.5',
              ativo && 'text-accent-700 dark:text-accent-300',
            )}
          >
            {Icon ? <Icon size={15} className="shrink-0 text-ink-400" /> : <span className="w-[15px] shrink-0" aria-hidden />}
            <span className="flex-1">{label}</span>
            {atalho && <kbd className="text-[10px] text-ink-400 [@media(hover:none)]:hidden">{atalho}</kbd>}
          </button>
          ),
        )}
      </Painel>
    </div>
  )
}

export default function BarraDeFuncoes({ estado, acoes, podeImagem }) {
  const { emTexto, marcas = {}, bloco = 'p', fonte = '', tamanho = 11 } = estado
  // A fonte do trecho pelo primeiro nome da pilha; fora da lista, "Padrão".
  const fonteAtual = FONTES.find((f) => f && f.toLowerCase() === fonte.split(',')[0].trim().toLowerCase()) ?? ''
  const semTexto = !emTexto
  const alinhamento = ALINHAMENTOS.find((a) => marcas[a.cmd]) ?? ALINHAMENTOS[0]
  const AlinhamentoAtual = alinhamento.icon

  return (
    <div
      role="toolbar"
      aria-label={t('Barra de funções da nota')}
      className={cn(
        'flex items-center gap-px px-2 py-1',
        // Celular: uma fileira que rola de lado, como o teclado de
        // formatação dos apps de texto; quatro fileiras empilhadas comeriam
        // a tela inteira acima da folha.
        'max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[scrollbar-width:none] sm:flex-wrap',
      )}
    >
      <Botao icon={Undo2} rotulo={t('Desfazer (Ctrl+Z)')} onClick={acoes.desfazer} />
      <Botao icon={Redo2} rotulo={t('Refazer (Ctrl+Y)')} onClick={acoes.refazer} />

      <Divisoria />

      <Escolha
        valor={BLOCOS.some((b) => b.value === bloco) ? bloco : 'p'}
        opcoes={BLOCOS}
        rotulo={t('Estilo do parágrafo (Ctrl+Alt+0 a 3)')}
        desligado={semTexto}
        onAntes={acoes.guardarSelecao}
        onEscolher={(v) => acoes.comando('formatBlock', v)}
        className="w-[6.5rem]"
      />
      <Escolha
        valor={fonteAtual}
        opcoes={FONTES.map((f) => ({ value: f, label: f || t('Padrão'), estilo: f ? { fontFamily: f } : undefined }))}
        rotulo={t('Fonte')}
        desligado={semTexto}
        onAntes={acoes.guardarSelecao}
        onEscolher={acoes.fonte}
        className="w-[6.5rem]"
      />
      <TamanhoDaFonte tamanho={tamanho} desligado={semTexto} onAntes={acoes.guardarSelecao} onAplicar={acoes.tamanho} />

      <Divisoria />

      <Botao icon={Bold} rotulo={t('Negrito (Ctrl+B)')} ativo={marcas.bold} desligado={semTexto} onClick={() => acoes.comando('bold')} />
      <Botao icon={Italic} rotulo={t('Itálico (Ctrl+I)')} ativo={marcas.italic} desligado={semTexto} onClick={() => acoes.comando('italic')} />
      <Botao icon={Underline} rotulo={t('Sublinhado (Ctrl+U)')} ativo={marcas.underline} desligado={semTexto} onClick={() => acoes.comando('underline')} />
      <Botao icon={Strikethrough} rotulo={t('Tachado')} ativo={marcas.strikeThrough} desligado={semTexto} onClick={() => acoes.comando('strikeThrough')} />
      <SeletorDeCor tipo="texto" desligado={semTexto} onAntes={acoes.guardarSelecao} onAplicar={(cor) => acoes.cor('texto', cor)} />
      <SeletorDeCor tipo="destaque" desligado={semTexto} onAntes={acoes.guardarSelecao} onAplicar={(cor) => acoes.cor('destaque', cor)} />

      <Divisoria />

      <Botao icon={List} rotulo={t('Lista (Ctrl+Shift+8)')} ativo={marcas.insertUnorderedList} desligado={semTexto} onClick={() => acoes.comando('insertUnorderedList')} />
      <Botao icon={ListOrdered} rotulo={t('Lista numerada (Ctrl+Shift+7)')} ativo={marcas.insertOrderedList} desligado={semTexto} onClick={() => acoes.comando('insertOrderedList')} />
      <Botao icon={ListChecks} rotulo={t('Checklist (Ctrl+Shift+9)')} onClick={() => acoes.inserir('checklist')} />
      <Botao icon={IndentDecrease} rotulo={t('Diminuir recuo (Shift+Tab)')} desligado={semTexto} onClick={() => acoes.comando('outdent')} />
      <Botao icon={IndentIncrease} rotulo={t('Aumentar recuo (Tab)')} desligado={semTexto} onClick={() => acoes.comando('indent')} />
      <MenuDaBarra
        icon={<AlinhamentoAtual size={15} />}
        rotulo={t('Alinhamento')}
        desligado={semTexto}
        itens={ALINHAMENTOS.map((a) => ({
          icon: a.icon,
          label: a.label,
          ativo: !!marcas[a.cmd],
          onClick: () => acoes.comando(a.cmd),
        }))}
      />

      <Divisoria />

      <Botao icon={Table2} rotulo={t('Inserir tabela')} onClick={() => acoes.inserir('table')} />
      <Botao icon={Code2} rotulo={t('Inserir bloco de código')} onClick={() => acoes.inserir('code')} />
      <Botao icon={ImagePlus} rotulo={podeImagem ? t('Inserir imagem') : t('Salve a nota para inserir imagem')} desligado={!podeImagem} onClick={() => acoes.inserir('imagem')} />
      <Botao icon={Link2} rotulo={t('Inserir link')} desligado={semTexto} onClick={() => acoes.inserir('link')} />
      <MenuDaBarra
        icon={<MoreHorizontal size={15} />}
        rotulo={t('Mais')}
        itens={[
          { icon: SeparatorHorizontal, label: t('Divisor'), atalho: '---', onClick: () => acoes.inserir('divisor'), disabled: semTexto },
          { icon: Quote, label: t('Citação'), atalho: '>', onClick: () => acoes.comando('formatBlock', 'blockquote'), disabled: semTexto },
          { icon: CalendarDays, label: t('Data de hoje'), onClick: () => acoes.inserir('data'), disabled: semTexto },
          { icon: RemoveFormatting, label: t('Limpar formatação'), onClick: () => acoes.comando('removeFormat'), disabled: semTexto },
        ]}
      />
    </div>
  )
}

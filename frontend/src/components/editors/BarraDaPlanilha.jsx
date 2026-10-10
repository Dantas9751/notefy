import { useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUpZA,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  Eraser,
  Filter,
  Grid2x2Plus,
  Grid2x2X,
  Italic,
  Percent,
  Redo2,
  RemoveFormatting,
  Sigma,
  Snowflake,
  SquareFunction,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
  WrapText,
  X,
} from 'lucide-react'
import { Botao, Divisoria, Escolha, MenuDaBarra, Painel, SeletorDeCor } from './BarraDeFuncoes'
import { FUNCOES, assinaturaDe, funcaoPorNome } from '@/lib/formula'
import { idioma, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * A barra de funções da planilha — o "Página Inicial" do Excel.
 *
 * Mesma ferramenta da barra da nota (as peças vêm de `BarraDeFuncoes`), no
 * mesmo lugar: fixa no topo, agindo sobre a SELEÇÃO. Formato, letra, cor,
 * alinhamento, linhas e colunas, ordem, filtro e contas moram aqui — antes
 * ficavam espalhados entre uma barrinha de texto e o menu escondido no
 * cabeçalho de cada coluna.
 *
 * O formato (Número, Moeda, Data...) é da COLUNA, como numa tabela; a
 * letra, as cores e o alinhamento são de cada célula, como no Excel.
 */

/**
 * Formatos de coluna. "Geral" é o tipo `text`: reconhece sozinho número,
 * R$, % e data digitados, então dá para usar a planilha sem escolher nada.
 * `antigo` só aparece na lista para a coluna que já o usa: Texto longo e
 * Fórmula viraram o Geral (fórmula funciona em qualquer coluna).
 */
export const COLUMN_TYPES = [
  { value: 'text', get label() { return t('Geral') } },
  { value: 'number', get label() { return t('Número') } },
  { value: 'currency', get label() { return t('Moeda') } },
  { value: 'percent', get label() { return t('Porcentagem') } },
  { value: 'date', get label() { return t('Data') } },
  { value: 'datetime', get label() { return t('Data e hora') } },
  { value: 'checkbox', get label() { return t('Caixa de seleção') } },
  { value: 'select', get label() { return t('Lista de opções') } },
  { value: 'multiselect', get label() { return t('Várias opções') } },
  { value: 'rating', get label() { return t('Avaliação') } },
  { value: 'url', get label() { return t('Link') } },
  { value: 'email', label: 'E-mail' },
  { value: 'longtext', antigo: true, get label() { return t('Texto longo') } },
  { value: 'formula', antigo: true, get label() { return t('Fórmula') } },
]

/** Os formatos oferecidos para uma coluna: os atuais, mais o antigo que ela já tem. */
export const formatosPara = (tipo) => COLUMN_TYPES.filter((f) => !f.antigo || f.value === tipo)

/** Formatos em que casas decimais fazem sentido (o Geral vira Número ao mudar). */
const COM_CASAS = ['text', 'longtext', 'number', 'currency', 'percent', 'formula']

const ALINHAMENTOS = [
  { valor: 'left', icon: AlignLeft, get label() { return t('Alinhar à esquerda') } },
  { valor: 'center', icon: AlignCenter, get label() { return t('Centralizar') } },
  { valor: 'right', icon: AlignRight, get label() { return t('Alinhar à direita') } },
]

const emIngles = () => String(idioma).startsWith('en')
const nomeDa = (funcao) => (emIngles() ? funcao.en : funcao.pt)

/** As contas da Soma automática, na ordem do Excel. */
const CONTAS = ['SOMA', 'MEDIA', 'CONT', 'MAX', 'MIN']

/**
 * fx: as funções, com o que cada uma faz. Escolher uma escreve `=NOME(` na
 * célula ativa e deixa o cursor dentro dos parênteses, com a dica dos
 * argumentos — o mesmo caminho de quem digita.
 */
function MenuDeFuncoes({ desligado, onInserir }) {
  const ancora = useRef(null)
  const [aberto, setAberto] = useState(false)
  return (
    <div ref={ancora} className="flex shrink-0">
      <Botao
        icon={SquareFunction}
        rotulo={t('Inserir função')}
        ativo={aberto}
        desligado={desligado}
        onClick={() => setAberto((v) => !v)}
      />
      <Painel ancora={ancora} aberto={aberto} onFechar={() => setAberto(false)} largura={320}>
        <ul className="mb-2 space-y-1 border-b border-ink-100 px-1 pb-2 text-[11.5px] leading-snug text-ink-500 dark:border-ink-800 dark:text-ink-400">
          <li>{t('Comece com = em qualquer célula: =A1+B1 soma A1 e B1, e o resultado muda sozinho quando elas mudam.')}</li>
          <li>{t('Enquanto escreve a fórmula, clique numa célula (ou arraste por várias) para citá-la.')}</li>
          <li>{t('Arraste o quadradinho no canto da seleção para copiar a fórmula para as células vizinhas.')}</li>
          <li>{t('Use $ para fixar: =$A$1 não muda ao copiar nem ao preencher.')}</li>
        </ul>
        <div className="max-h-64 overflow-y-auto">
          {FUNCOES.map((funcao) => (
            <button
              key={funcao.pt}
              type="button"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAberto(false)
                onInserir(funcao)
              }}
              className="block w-full rounded px-2 py-1 text-left transition hover:bg-ink-100 dark:hover:bg-ink-800 [@media(pointer:coarse)]:py-2"
            >
              <code className="block font-mono text-[11.5px] text-accent-700 dark:text-accent-300">{assinaturaDe(funcao)}</code>
              <span className="text-[11px] text-ink-500 dark:text-ink-400">{funcao.desc}</span>
            </button>
          ))}
        </div>
      </Painel>
    </div>
  )
}

export default function BarraDaPlanilha({ estado, acoes }) {
  const {
    ativa,
    tipo = 'text',
    estilo = {},
    letra = 'A',
    indice = 0,
    ordenada = false,
    filtros = 0,
    congeladas = 0,
    nLinhas = 1,
    nColunas = 1,
    podeExcluirColunas = true,
  } = estado
  const semCelula = !ativa
  const separador = (1.1).toLocaleString(idioma).charAt(1)
  const alinhamento = ALINHAMENTOS.find((a) => a.valor === estilo.align)
  const AlinhamentoAtual = alinhamento?.icon ?? AlignLeft
  // Moeda e % alternam: apertar de novo volta ao Geral, como um botão de estilo.
  const alternarFormato = (alvo) => acoes.formato(tipo === alvo ? 'text' : alvo)
  const conta = (nome) => funcaoPorNome(nome)

  return (
    <div
      role="toolbar"
      aria-label={t('Barra de funções da planilha')}
      className={cn(
        'flex items-center gap-px px-2 py-1',
        // Celular: uma fileira que rola de lado, como a barra da nota.
        'max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[scrollbar-width:none] sm:flex-wrap',
      )}
    >
      <Botao icon={Undo2} rotulo={t('Desfazer (Ctrl+Z)')} onClick={acoes.desfazer} />
      <Botao icon={Redo2} rotulo={t('Refazer (Ctrl+Y)')} onClick={acoes.refazer} />

      <Divisoria />

      <Escolha
        valor={tipo}
        opcoes={formatosPara(tipo)}
        rotulo={t('Formato da coluna {letra}', { letra })}
        desligado={semCelula}
        onEscolher={acoes.formato}
        className="w-[7.25rem]"
      />
      <Botao
        rotulo={t('Formato de moeda')}
        ativo={tipo === 'currency'}
        desligado={semCelula}
        onClick={() => alternarFormato('currency')}
      >
        <span className="text-[12px] font-semibold leading-none">{emIngles() ? '$' : 'R$'}</span>
      </Botao>
      <Botao
        icon={Percent}
        rotulo={t('Formato de porcentagem')}
        ativo={tipo === 'percent'}
        desligado={semCelula}
        onClick={() => alternarFormato('percent')}
      />
      <Botao
        rotulo={t('Diminuir casas decimais')}
        desligado={semCelula || !COM_CASAS.includes(tipo)}
        onClick={() => acoes.casas(-1)}
      >
        <ArrowLeft size={10} className="-mr-0.5" />
        <span className="text-[11px] font-semibold leading-none tabular-nums">{separador}0</span>
      </Botao>
      <Botao
        rotulo={t('Aumentar casas decimais')}
        desligado={semCelula || !COM_CASAS.includes(tipo)}
        onClick={() => acoes.casas(1)}
      >
        <span className="text-[11px] font-semibold leading-none tabular-nums">{separador}00</span>
        <ArrowRight size={10} className="-ml-0.5" />
      </Botao>

      <Divisoria />

      <Botao icon={Bold} rotulo={t('Negrito (Ctrl+B)')} ativo={!!estilo.bold} desligado={semCelula} onClick={() => acoes.alternar('bold')} />
      <Botao icon={Italic} rotulo={t('Itálico (Ctrl+I)')} ativo={!!estilo.italic} desligado={semCelula} onClick={() => acoes.alternar('italic')} />
      <Botao icon={Underline} rotulo={t('Sublinhado (Ctrl+U)')} ativo={!!estilo.underline} desligado={semCelula} onClick={() => acoes.alternar('underline')} />
      <Botao icon={Strikethrough} rotulo={t('Tachado')} ativo={!!estilo.strike} desligado={semCelula} onClick={() => acoes.alternar('strike')} />
      <SeletorDeCor tipo="texto" desligado={semCelula} onAplicar={(cor) => acoes.estilo({ color: cor })} />
      <SeletorDeCor tipo="preenchimento" desligado={semCelula} onAplicar={(cor) => acoes.estilo({ fill: cor })} />

      <Divisoria />

      <MenuDaBarra
        icon={<AlinhamentoAtual size={15} />}
        rotulo={t('Alinhamento')}
        desligado={semCelula}
        ativo={!!alinhamento}
        itens={ALINHAMENTOS.map((a) => ({
          icon: a.icon,
          label: a.label,
          ativo: estilo.align === a.valor,
          // De novo no que já está: volta ao automático (número à direita, texto à esquerda).
          onClick: () => acoes.estilo({ align: estilo.align === a.valor ? null : a.valor }),
        }))}
      />
      <Botao icon={WrapText} rotulo={t('Quebrar texto em várias linhas')} ativo={!!estilo.wrap} desligado={semCelula} onClick={() => acoes.alternar('wrap')} />

      <Divisoria />

      <MenuDaBarra
        icon={<Grid2x2Plus size={15} />}
        rotulo={t('Inserir linhas e colunas')}
        largura={240}
        itens={[
          { icon: BetweenHorizontalStart, label: t('Inserir linha acima'), onClick: () => acoes.inserirLinha('acima') },
          { icon: BetweenHorizontalEnd, label: t('Inserir linha abaixo'), onClick: () => acoes.inserirLinha('abaixo') },
          { separator: true },
          { icon: BetweenVerticalStart, label: t('Inserir coluna à esquerda'), onClick: () => acoes.inserirColuna('esquerda') },
          { icon: BetweenVerticalEnd, label: t('Inserir coluna à direita'), onClick: () => acoes.inserirColuna('direita') },
        ]}
      />
      <MenuDaBarra
        icon={<Grid2x2X size={15} />}
        rotulo={t('Excluir e limpar')}
        desligado={semCelula}
        largura={240}
        itens={[
          { icon: Trash2, label: nLinhas > 1 ? t('Excluir {n} linhas', { n: nLinhas }) : t('Excluir linha'), onClick: acoes.excluirLinhas },
          {
            icon: Trash2,
            label: nColunas > 1 ? t('Excluir {n} colunas', { n: nColunas }) : t('Excluir coluna'),
            onClick: acoes.excluirColunas,
            disabled: !podeExcluirColunas,
          },
          { separator: true },
          { icon: Eraser, label: t('Limpar conteúdo'), atalho: 'Delete', onClick: acoes.limparConteudo },
          { icon: RemoveFormatting, label: t('Limpar formatação'), onClick: acoes.limparFormatacao },
        ]}
      />

      <Divisoria />

      <MenuDaBarra
        icon={<ArrowDownAZ size={15} />}
        rotulo={t('Classificar')}
        desligado={semCelula}
        ativo={ordenada}
        largura={240}
        itens={[
          { icon: ArrowDownAZ, label: t('Classificar a coluna {letra} de A a Z', { letra }), onClick: () => acoes.ordenar('asc') },
          { icon: ArrowUpZA, label: t('Classificar a coluna {letra} de Z a A', { letra }), onClick: () => acoes.ordenar('desc') },
          { separator: true },
          { icon: X, label: t('Remover classificação'), onClick: () => acoes.ordenar(null), disabled: !ordenada },
        ]}
      />
      <Botao
        icon={Filter}
        rotulo={t('Filtrar pela coluna {letra}', { letra })}
        ativo={filtros > 0}
        desligado={semCelula}
        onClick={acoes.filtrar}
      />
      <MenuDaBarra
        icon={<Snowflake size={15} />}
        rotulo={t('Congelar colunas')}
        ativo={congeladas > 0}
        largura={240}
        itens={[
          { label: t('Não congelar'), ativo: congeladas === 0, onClick: () => acoes.congelar(0) },
          { label: t('Congelar a primeira coluna'), ativo: congeladas === 1, onClick: () => acoes.congelar(1) },
          ...(indice > 0
            ? [{ label: t('Congelar até a coluna {letra}', { letra }), ativo: congeladas === indice + 1, onClick: () => acoes.congelar(indice + 1) }]
            : []),
        ]}
      />

      <Divisoria />

      {/* Soma automática: o Σ soma; a setinha traz as outras contas. */}
      <Botao icon={Sigma} rotulo={t('Soma automática (Alt+=)')} desligado={semCelula} onClick={() => acoes.autoSoma(conta('SOMA'))} className="rounded-r-none pr-1" />
      <MenuDaBarra
        icon={null}
        rotulo={t('Outras contas automáticas')}
        desligado={semCelula}
        largura={200}
        className="min-w-5 rounded-l-none px-0.5 [@media(pointer:coarse)]:min-w-7"
        itens={CONTAS.map((nome) => ({ label: nomeDa(conta(nome)), onClick: () => acoes.autoSoma(conta(nome)) }))}
      />
      <MenuDeFuncoes desligado={semCelula} onInserir={acoes.inserirFuncao} />
    </div>
  )
}

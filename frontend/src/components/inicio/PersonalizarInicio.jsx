import { useRef, useState } from 'react'
import { Check, ChevronDown, Crop, FolderOpen, Image, ImagePlus, LayoutGrid, RotateCcw, Upload } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { Button, Modal, Spinner } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import { Chave } from '@/pages/settings/componentes'
import { FotoDaCapa, fundoDaCapa, imagemDoArraste } from './Capa'
import { BLOCOS, CAPAS } from '@/lib/inicio'
import { urlDeMedia } from '@/lib/fileMedia'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'
import { comTecla } from '@/lib/atalhos'

/**
 * Imagens da conta para a capa, o fundo ou o relógio (`destino`). Uma foto
 * arrastada do computador para cá, ou o "Do computador", vai direto para o
 * mesmo destino — sem isso a lista vazia mandava usar um botão que não
 * estava nesta tela.
 */
function EscolherImagem({ destino, enviando, onEscolher, onEnviar, onVoltar }) {
  // Com os anexos: a imagem colada numa nota é quase sempre a única foto da conta.
  const imagens = useFetch('/documents/', {
    params: { kind: 'file', file_kind: 'image', anexos: true, ordering: '-created_at', page_size: 48 },
  })
  const lista = imagens.data?.results ?? []
  const [arrastando, setArrastando] = useState(false)
  const arquivoRef = useRef(null)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setArrastando(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        onEnviar(imagemDoArraste(e))
      }}
      className={cn('-m-2 rounded-lg p-2', arrastando && 'ring-2 ring-dashed ring-accent-400')}
    >
      <div className="mb-3 flex items-center gap-3">
        <button type="button" onClick={onVoltar} className="text-xs text-ink-500 underline-offset-2 hover:underline">
          {t('Voltar')}
        </button>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-400">{t('Escolhendo para: {destino}', { destino })}</span>
        <Button size="sm" variant="secondary" icon={Upload} loading={enviando} onClick={() => arquivoRef.current?.click()}>
          {t('Do computador')}
        </Button>
        <input
          ref={arquivoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onEnviar(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {imagens.loading ? (
        <div className="flex h-32 items-center justify-center"><Spinner /></div>
      ) : lista.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-300 px-4 py-8 text-center text-sm text-ink-500 dark:border-ink-600">
          {arrastando
            ? t('Solte para usar esta foto')
            : t('Nenhuma imagem nos seus arquivos ainda. Arraste uma foto do computador para cá, ou use "Do computador".')}
        </p>
      ) : (
        <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {lista.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onEscolher(a.file_url)}
              title={a.title}
              className="aspect-video overflow-hidden rounded-md border border-ink-200 transition hover:ring-2 hover:ring-accent-400 dark:border-ink-700"
            >
              <img src={urlDeMedia(a.file_url)} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Uma linha do Personalizar: o nome, a escolha atual em miniatura e, aberta,
 * as opções. Fechadas, as quatro cabem na tela sem rolar — abertas todas de
 * uma vez eram três grades de onze quadros, uma embaixo da outra.
 *
 * `onSoltarFoto`: a linha inteira, aberta ou fechada, aceita uma foto
 * arrastada do computador.
 */
function Secao({ titulo, resumo, miniatura, aberta, onAlternar, onSoltarFoto, children }) {
  const [arrastando, setArrastando] = useState(false)
  const soltavel = onSoltarFoto
    ? {
        onDragOver: (e) => {
          e.preventDefault()
          setArrastando(true)
        },
        onDragLeave: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setArrastando(false)
        },
        onDrop: (e) => {
          e.preventDefault()
          setArrastando(false)
          const imagem = imagemDoArraste(e)
          if (imagem) onSoltarFoto(imagem)
        },
      }
    : {}

  return (
    <section
      {...soltavel}
      className={cn(
        'rounded-lg border border-ink-200 transition dark:border-ink-700',
        arrastando && 'border-accent-400 ring-2 ring-accent-400/40 dark:border-accent-400',
      )}
    >
      <button type="button" onClick={onAlternar} aria-expanded={aberta} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        {miniatura}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">{titulo}</span>
          <span className="block truncate text-xs text-ink-500 dark:text-ink-400">{arrastando ? t('Solte para usar esta foto') : resumo}</span>
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-ink-400 transition-transform', aberta && 'rotate-180')} />
      </button>
      {aberta && <div className="border-t border-ink-100 px-3 pb-3 pt-3 dark:border-ink-800">{children}</div>}
    </section>
  )
}

/** A escolha atual de uma imagem do Início, pequena, à esquerda do nome. */
function Miniatura({ escolha }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative h-8 w-12 shrink-0 overflow-hidden rounded',
        escolha.tipo === 'nenhuma' ? 'border border-dashed border-ink-300 dark:border-ink-600' : 'border border-black/5 dark:border-white/10',
      )}
      style={escolha.tipo === 'gradiente' ? { background: fundoDaCapa(escolha) } : undefined}
    >
      {escolha.tipo === 'imagem' && <img src={urlDeMedia(escolha.url)} alt="" className="h-full w-full object-cover" />}
    </span>
  )
}

const nomeDaEscolha = (escolha, semRotulo) =>
  escolha.tipo === 'imagem' ? t('Foto') : escolha.tipo === 'gradiente' ? (CAPAS.find((c) => c.id === escolha.id) ?? CAPAS[0]).nome : semRotulo

/**
 * As opções de uma imagem do Início: materiais (papel, lousa...), a foto em
 * uso, "do computador", "dos meus arquivos" e "nenhuma". Serve à capa, ao
 * papel de parede e ao relógio — o mesmo jeito de escolher nos três.
 */
function OpcoesDeFoto({ atual, semRotulo, enviando, onMudar, onEnviar, onDosArquivos, onRecortar }) {
  const arquivoRef = useRef(null)

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {CAPAS.map((c) => {
        const ativa = atual.tipo === 'gradiente' && atual.id === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onMudar({ tipo: 'gradiente', id: c.id })}
            aria-pressed={ativa}
            title={c.nome}
            style={{ background: fundoDaCapa({ tipo: 'gradiente', id: c.id }) }}
            className={cn(
              'relative flex h-14 items-end rounded-md border border-black/5 p-1.5 text-left text-[11px] font-medium transition dark:border-white/5',
              c.texto === 'escuro' ? 'text-ink-800' : 'text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]',
              ativa ? 'ring-2 ring-accent-500 ring-offset-2 dark:ring-offset-ink-900' : 'hover:opacity-90',
            )}
          >
            {c.nome}
            {ativa && <Check size={13} className="absolute right-1.5 top-1.5" />}
          </button>
        )
      })}
      {/* A foto em uso tem quadro próprio; na capa, é por ele que se recorta. */}
      {atual.tipo === 'imagem' && (
        <button
          type="button"
          onClick={onRecortar}
          disabled={!onRecortar}
          title={onRecortar ? t('Recortar a foto') : undefined}
          className="relative flex h-14 items-end overflow-hidden rounded-md p-1.5 text-left text-[11px] font-medium text-white ring-2 ring-accent-500 ring-offset-2 disabled:cursor-default dark:ring-offset-ink-900"
        >
          <FotoDaCapa capa={atual} />
          {onRecortar && (
            <span className="relative inline-flex items-center gap-1 [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">
              <Crop size={12} aria-hidden />
              {t('Recortar')}
            </span>
          )}
          <Check size={13} className="absolute right-1.5 top-1.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => arquivoRef.current?.click()}
        disabled={enviando}
        className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-ink-300 text-[11px] font-medium text-ink-500 transition hover:border-accent-400 disabled:opacity-60 dark:border-ink-600 dark:text-ink-400"
      >
        <Upload size={15} />
        {enviando ? t('Enviando...') : t('Do computador')}
      </button>
      <button
        type="button"
        onClick={onDosArquivos}
        className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-ink-300 text-[11px] font-medium text-ink-500 transition hover:border-accent-400 dark:border-ink-600 dark:text-ink-400"
      >
        <FolderOpen size={15} />
        {t('Dos meus arquivos')}
      </button>
      <button
        type="button"
        onClick={() => onMudar({ tipo: 'nenhuma' })}
        aria-pressed={atual.tipo === 'nenhuma'}
        className={cn(
          'flex h-14 items-center justify-center rounded-md border border-ink-200 text-[11px] font-medium text-ink-500 transition hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
          atual.tipo === 'nenhuma' && 'ring-2 ring-accent-500 ring-offset-2 dark:ring-offset-ink-900',
        )}
      >
        {semRotulo}
      </button>
      <input
        ref={arquivoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onEnviar(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/**
 * "Personalizar" do Início: a capa, o papel de parede, o relógio e o fundo
 * dos blocos, cada um numa linha que abre (uma por vez).
 *
 * Os blocos em si NÃO moram aqui: ordem, tamanho e quais aparecem se arrumam
 * na própria página, arrastando (`GradeDoInicio`).
 *
 * Tudo vale na hora (a página atrás do painel já muda) e fica salvo na conta.
 * `onEnviarFoto(arquivo, para)` e `onEscolherFoto(url, para)`: `para` é
 * capa, fundo ou foto; `onRecortar(para)` abre o recorte da foto em uso.
 * `opacidade` é `null` enquanto vale a do tema. `onAlternarBloco(id,
 * visivel)` mostra ou esconde um bloco. `onRestaurar(parte)`: 'blocos',
 * 'imagens' ou 'tudo'.
 */
export default function PersonalizarInicio({
  open,
  onClose,
  layout,
  onMudar,
  opacidade,
  onOpacidade,
  onRestaurar,
  onEnviarFoto,
  onEscolherFoto,
  onRecortar,
  onAlternarBloco,
}) {
  //: Qual linha está aberta: capa, fundo, foto, blocos, aparencia ou nenhuma.
  const [aberta, setAberta] = useState(null)
  const restaurar = useContextMenu()
  const nomeDoDestino = { capa: t('Capa'), fundo: t('Fundo da página'), foto: t('Relógio') }
  //: Para qual das três a lista "dos meus arquivos" está escolhendo.
  const [escolhendoPara, setEscolhendoPara] = useState(null)
  const [enviandoPara, setEnviandoPara] = useState(null)

  const enviar = async (arquivo, para) => {
    if (!arquivo || enviandoPara) return
    setEnviandoPara(para)
    try {
      await onEnviarFoto(arquivo, para)
    } finally {
      setEnviandoPara(null)
    }
  }

  // Sem escolha salva, o controle parte de onde o tema deixa o bloco.
  const escuro = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const opacidadeNaTela = opacidade ?? (escuro ? 50 : 100)

  const alternarLinha = (qual) => () => setAberta((a) => (a === qual ? null : qual))
  const aMostra = layout.blocos.filter((b) => b.visivel).length

  const linhaDeFoto = (para, titulo, semRotulo, extra) => (
    <Secao
      titulo={titulo}
      resumo={enviandoPara === para ? t('Enviando...') : nomeDaEscolha(layout[para], semRotulo)}
      miniatura={<Miniatura escolha={layout[para]} />}
      aberta={aberta === para}
      onAlternar={alternarLinha(para)}
      onSoltarFoto={(arquivo) => enviar(arquivo, para)}
    >
      <OpcoesDeFoto
        atual={layout[para]}
        semRotulo={semRotulo}
        enviando={enviandoPara === para}
        onMudar={(escolha) => onMudar({ [para]: escolha })}
        onEnviar={(arquivo) => enviar(arquivo, para)}
        onDosArquivos={() => setEscolhendoPara(para)}
        onRecortar={() => onRecortar(para)}
      />
      {extra}
    </Secao>
  )

  return (
    <Modal
      open={open}
      onClose={() => {
        setEscolhendoPara(null)
        onClose()
      }}
      title={t('Personalizar o Início')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" icon={RotateCcw} onClick={(e) => restaurar.openMenu(e)} className="mr-auto">
            {t('Restaurar padrão')}
          </Button>
          <Button onClick={onClose}>{t('Pronto')}</Button>
        </>
      }
    >
      {escolhendoPara ? (
        <EscolherImagem
          destino={nomeDoDestino[escolhendoPara]}
          enviando={enviandoPara === escolhendoPara}
          onVoltar={() => setEscolhendoPara(null)}
          onEnviar={async (arquivo) => {
            await enviar(arquivo, escolhendoPara)
            setEscolhendoPara(null)
          }}
          onEscolher={(url) => {
            const para = escolhendoPara
            setEscolhendoPara(null)
            onEscolherFoto(url, para)
          }}
        />
      ) : (
        <div className="space-y-2">
          <p className="flex items-start gap-2 pb-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            <ImagePlus size={14} className="mt-0.5 shrink-0" />
            {t('Para usar uma foto sua, arraste-a do computador até a capa, o fundo da página ou o relógio, aqui embaixo. A capa também aceita a foto solta direto nela, no Início.')}
          </p>

          {linhaDeFoto('capa', t('Capa'), t('Sem capa'))}
          {linhaDeFoto('fundo', t('Fundo da página'), t('Sem fundo'))}
          {linhaDeFoto(
            'foto',
            t('Relógio'),
            t('Sem fundo'),
            <p className="mt-3 text-[11px] text-ink-400">{comTecla(t('O relógio é um dos blocos do Início: arraste e redimensione como os outros. Ele também abre flutuando sobre o app, em qualquer tela'), 'relogio')}.</p>,
          )}

          <Secao
            titulo={t('Blocos')}
            resumo={t('{n} de {total} à mostra', { n: aMostra, total: layout.blocos.length })}
            miniatura={
              <span aria-hidden className="flex h-8 w-12 shrink-0 items-center justify-center rounded border border-ink-200 text-[11px] tabular-nums text-ink-500 dark:border-ink-700 dark:text-ink-400">
                {aMostra}/{layout.blocos.length}
              </span>
            }
            aberta={aberta === 'blocos'}
            onAlternar={alternarLinha('blocos')}
          >
            <div className="space-y-3">
              {BLOCOS.map((b) => (
                <Chave
                  key={b.id}
                  checked={!!layout.blocos.find((x) => x.id === b.id)?.visivel}
                  onChange={(visivel) => onAlternarBloco(b.id, visivel)}
                  label={b.nome}
                  description={b.dica}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
              {t('Um bloco que volta entra embaixo dos que você já arrumou; arraste-o para onde quiser.')}
            </p>
          </Secao>

          <Secao
            titulo={t('Aparência')}
            resumo={t('Fundo com {valor}% de opacidade', { valor: opacidadeNaTela }) + (layout.titulos ? '' : ' · ' + t('sem títulos'))}
            miniatura={
              // Um bloco sobre o fundo da página, na opacidade escolhida.
              <span
                aria-hidden
                className="relative flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-ink-200 dark:border-ink-700"
                style={layout.fundo.tipo === 'gradiente' ? { background: fundoDaCapa(layout.fundo) } : undefined}
              >
                {layout.fundo.tipo === 'imagem' && <img src={urlDeMedia(layout.fundo.url)} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <span
                  className="relative h-5 w-8 rounded-sm border border-ink-150 bg-[rgb(255_255_255/var(--opacidade-dos-blocos))] dark:border-ink-700 dark:bg-[rgb(var(--ink-900)/var(--opacidade-dos-blocos))]"
                  style={{ '--opacidade-dos-blocos': opacidadeNaTela / 100 }}
                />
              </span>
            }
            aberta={aberta === 'aparencia'}
            onAlternar={alternarLinha('aparencia')}
          >
            <label className="flex items-center gap-3 text-xs text-ink-600 dark:text-ink-300">
              <span className="shrink-0">{t('Opacidade do fundo')}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={opacidadeNaTela}
                onChange={(e) => onOpacidade(Number(e.target.value))}
                aria-label={t('Opacidade do fundo dos blocos')}
                className="h-1 min-w-0 flex-1 accent-accent-600"
              />
              <span className="w-9 shrink-0 text-right tabular-nums">{opacidadeNaTela}%</span>
            </label>
            <div className="mt-4">
              <Chave
                checked={layout.titulos}
                onChange={(titulos) => onMudar({ titulos })}
                label={t('Mostrar o título dos blocos')}
                description={t('Desligado, cada bloco é só o conteúdo; as abas e botões do alto continuam.')}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
              {layout.titulos
                ? t('Os blocos se arrumam na própria página: arraste um bloco pelo título (no toque, segure antes) e solte onde quiser; puxe a borda ou o canto para mudar o tamanho. Perto de outro bloco ele gruda, alinhado.')
                : t('Os blocos se arrumam na própria página: arraste um bloco pela beirada de cima (no toque, segure antes) e solte onde quiser; puxe a borda ou o canto para mudar o tamanho. Perto de outro bloco ele gruda, alinhado.')}
            </p>
          </Secao>
        </div>
      )}

      <ContextMenu
        open={!!restaurar.menu}
        x={restaurar.menu?.x ?? 0}
        y={restaurar.menu?.y ?? 0}
        onClose={restaurar.closeMenu}
        items={[
          { label: t('Só os blocos (arrumação, opacidade e títulos)'), icon: LayoutGrid, onClick: () => onRestaurar('blocos') },
          { label: t('Só a capa, o fundo e o relógio'), icon: Image, onClick: () => onRestaurar('imagens') },
          { separator: true },
          { label: t('Tudo'), icon: RotateCcw, danger: true, onClick: () => onRestaurar('tudo') },
        ]}
      />
    </Modal>
  )
}

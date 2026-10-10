import { useRef, useState } from 'react'
import { Check, Crop, FolderOpen, ImagePlus, Move, RotateCcw, Upload } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { Button, Modal, Spinner } from '@/components/ui'
import { FotoDaCapa, fundoDaCapa, imagemDoArraste } from './Capa'
import { CAPAS } from '@/lib/inicio'
import { urlDeMedia } from '@/lib/fileMedia'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/** Imagens da conta para usar de capa. */
function EscolherImagem({ onEscolher, onVoltar }) {
  // Com os anexos: a imagem colada numa nota é quase sempre a única foto da conta.
  const imagens = useFetch('/documents/', {
    params: { kind: 'file', file_kind: 'image', anexos: true, ordering: '-created_at', page_size: 48 },
  })
  const lista = imagens.data?.results ?? []
  return (
    <div>
      <button type="button" onClick={onVoltar} className="mb-3 text-xs text-ink-500 underline-offset-2 hover:underline">
        {t('Voltar')}
      </button>
      {imagens.loading ? (
        <div className="flex h-32 items-center justify-center"><Spinner /></div>
      ) : lista.length === 0 ? (
        <p className="text-sm text-ink-500">{t('Nenhuma imagem nos seus arquivos ainda. Use "Do computador" ou arraste uma foto para a capa.')}</p>
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
 * Uma escolha de imagem do Início: materiais (papel, lousa...), a foto em
 * uso, "do computador", "dos meus arquivos" e "nenhuma". Serve à capa, ao
 * papel de parede e à foto do relógio — o mesmo jeito de escolher nos três.
 * Soltar uma foto em qualquer ponto da seção também serve.
 */
function EscolhaDeFoto({ titulo, atual, materiais = true, semRotulo, onMudar, onEnviar, onDosArquivos, onRecortar, dica }) {
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const arquivoRef = useRef(null)

  const enviar = async (arquivo) => {
    if (!arquivo || enviando) return
    setEnviando(true)
    try {
      await onEnviar(arquivo)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section>
      <h3 className="secao mb-2">{titulo}</h3>
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
          enviar(imagemDoArraste(e))
        }}
        className={cn('grid grid-cols-3 gap-2 rounded-lg sm:grid-cols-4', arrastando && 'ring-2 ring-dashed ring-accent-400 ring-offset-4 dark:ring-offset-ink-900')}
      >
        {materiais &&
          CAPAS.map((c) => {
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
            title={onRecortar ? t('Recortar a foto da capa') : undefined}
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
      </div>
      {dica && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
          <ImagePlus size={12} />
          {dica}
        </p>
      )}
      <input
        ref={arquivoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          enviar(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </section>
  )
}

/**
 * "Personalizar" do Início: a capa, o papel de parede e a foto do relógio.
 *
 * Os blocos NÃO moram aqui: ordem, tamanho e quais aparecem se arrumam na
 * própria página, arrastando (`GradeDoInicio`) — mexer numa lista de
 * opções para adivinhar como a página vai ficar era o caminho longo.
 *
 * Tudo vale na hora (a página atrás do painel já muda) e fica salvo na conta.
 * `onEnviarFoto(arquivo, para)` e `onEscolherFoto(url, para)`: `para` é
 * capa, fundo ou foto.
 */
export default function PersonalizarInicio({ open, onClose, layout, onMudar, onRestaurar, onEnviarFoto, onEscolherFoto, onRecortar }) {
  //: Para qual das três a lista "dos meus arquivos" está escolhendo.
  const [escolhendoPara, setEscolhendoPara] = useState(null)

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
          <Button variant="secondary" icon={RotateCcw} onClick={onRestaurar} className="mr-auto">
            {t('Restaurar padrão')}
          </Button>
          <Button onClick={onClose}>{t('Pronto')}</Button>
        </>
      }
    >
      {escolhendoPara ? (
        <EscolherImagem
          onVoltar={() => setEscolhendoPara(null)}
          onEscolher={(url) => {
            const para = escolhendoPara
            setEscolhendoPara(null)
            onEscolherFoto(url, para)
          }}
        />
      ) : (
        <div className="space-y-6">
          <EscolhaDeFoto
            titulo={t('Capa')}
            atual={layout.capa}
            semRotulo={t('Sem capa')}
            onMudar={(capa) => onMudar({ capa })}
            onEnviar={(arquivo) => onEnviarFoto(arquivo, 'capa')}
            onDosArquivos={() => setEscolhendoPara('capa')}
            onRecortar={onRecortar}
            dica={t('Arraste uma foto para cá, ou direto para a capa do Início.')}
          />
          <EscolhaDeFoto
            titulo={t('Fundo da página')}
            atual={layout.fundo}
            semRotulo={t('Sem fundo')}
            onMudar={(fundo) => onMudar({ fundo })}
            onEnviar={(arquivo) => onEnviarFoto(arquivo, 'fundo')}
            onDosArquivos={() => setEscolhendoPara('fundo')}
          />
          <EscolhaDeFoto
            titulo={t('Foto do relógio')}
            atual={layout.foto}
            materiais={false}
            semRotulo={t('Sem foto')}
            onMudar={(foto) => onMudar({ foto })}
            onEnviar={(arquivo) => onEnviarFoto(arquivo, 'foto')}
            onDosArquivos={() => setEscolhendoPara('foto')}
            dica={t('O relógio é um dos blocos do Início: arraste e redimensione como os outros.')}
          />

          <p className="flex items-start gap-2 rounded-md bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-500 dark:bg-ink-800/60 dark:text-ink-400">
            <Move size={14} className="mt-0.5 shrink-0" />
            {t('Os blocos se arrumam na própria página: arraste um bloco pelo título (no toque, segure antes) e solte onde quiser; puxe a borda ou o canto para mudar o tamanho. Perto de outro bloco ele gruda, alinhado.')}
          </p>
        </div>
      )}
    </Modal>
  )
}

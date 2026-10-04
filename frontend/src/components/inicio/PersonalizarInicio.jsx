import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Crop, FolderOpen, ImagePlus, RotateCcw, Upload } from 'lucide-react'
import { useFetch } from '@/hooks/useFetch'
import { Button, Modal, Spinner } from '@/components/ui'
import { FotoDaCapa, fundoDaCapa, imagemDoArraste } from './Capa'
import { BLOCOS, CAPAS, LAYOUTS_DE_ITENS, moverBlocoDoInicio } from '@/lib/inicio'
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
 * "Personalizar" do Início, como o do Evernote: capa, quais blocos
 * aparecem, em que ordem e com que largura, e o desenho dos itens.
 *
 * Tudo vale na hora (a página atrás do painel já muda) e fica salvo na
 * conta. Reordenar é por setas, e não por arrastar: funciona igual no
 * mouse, no teclado e no toque.
 */
export default function PersonalizarInicio({ open, onClose, layout, onMudar, onRestaurar, onEnviarFoto, onEscolherFoto, onRecortar }) {
  const [escolhendoImagem, setEscolhendoImagem] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const arquivoRef = useRef(null)

  const enviar = async (arquivo) => {
    if (!arquivo || enviando) return
    setEnviando(true)
    try {
      await onEnviarFoto(arquivo)
    } finally {
      setEnviando(false)
    }
  }
  const nome = (id) => BLOCOS.find((b) => b.id === id)
  const capaAtual = layout.capa

  const mudarBloco = (id, patch) => onMudar({ blocos: layout.blocos.map((b) => (b.id === id ? { ...b, ...patch } : b)) })

  return (
    <Modal
      open={open}
      onClose={() => {
        setEscolhendoImagem(false)
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
      {escolhendoImagem ? (
        <EscolherImagem
          onVoltar={() => setEscolhendoImagem(false)}
          onEscolher={(url) => {
            setEscolhendoImagem(false)
            onEscolherFoto(url)
          }}
        />
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="secao mb-2">{t('Capa')}</h3>
            {/* Soltar uma foto em qualquer ponto da seção também serve. */}
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
              {CAPAS.map((c) => {
                const ativa = capaAtual.tipo === 'gradiente' && capaAtual.id === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onMudar({ capa: { tipo: 'gradiente', id: c.id } })}
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
              {/* A foto em uso tem quadro próprio: veio do computador, dos
                  arquivos ou de um arraste, e é aqui que se recorta. */}
              {capaAtual.tipo === 'imagem' && (
                <button
                  type="button"
                  onClick={onRecortar}
                  title={t('Recortar a foto da capa')}
                  className="relative flex h-14 items-end overflow-hidden rounded-md p-1.5 text-left text-[11px] font-medium text-white ring-2 ring-accent-500 ring-offset-2 dark:ring-offset-ink-900"
                >
                  <FotoDaCapa capa={capaAtual} />
                  <span className="relative inline-flex items-center gap-1 [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">
                    <Crop size={12} aria-hidden />
                    {t('Recortar')}
                  </span>
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
                onClick={() => setEscolhendoImagem(true)}
                className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-ink-300 text-[11px] font-medium text-ink-500 transition hover:border-accent-400 dark:border-ink-600 dark:text-ink-400"
              >
                <FolderOpen size={15} />
                {t('Dos meus arquivos')}
              </button>
              <button
                type="button"
                onClick={() => onMudar({ capa: { tipo: 'nenhuma' } })}
                aria-pressed={capaAtual.tipo === 'nenhuma'}
                className={cn(
                  'flex h-14 items-center justify-center rounded-md border border-ink-200 text-[11px] font-medium text-ink-500 transition hover:border-ink-300 dark:border-ink-700 dark:text-ink-400',
                  capaAtual.tipo === 'nenhuma' && 'ring-2 ring-accent-500 ring-offset-2 dark:ring-offset-ink-900',
                )}
              >
                {t('Sem capa')}
              </button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
              <ImagePlus size={12} />
              {t('Arraste uma foto para cá, ou direto para a capa do Início.')}
            </p>
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

          <section>
            <h3 className="secao mb-2">{t('Itens recentes aparecem como')}</h3>
            <div className="flex flex-wrap gap-2">
              {LAYOUTS_DE_ITENS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onMudar({ itens: l.id })}
                  aria-pressed={layout.itens === l.id}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition [@media(pointer:coarse)]:py-2',
                    layout.itens === l.id
                      ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-500/15 dark:text-accent-200'
                      : 'border-ink-200 text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300',
                  )}
                >
                  {l.nome}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="secao mb-2">{t('Blocos')}</h3>
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-150 dark:divide-ink-800 dark:border-ink-800">
              {layout.blocos.map((b, i) => (
                <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={b.visivel}
                    onChange={(e) => mudarBloco(b.id, { visivel: e.target.checked })}
                    aria-label={t('Mostrar {nome}', { nome: nome(b.id)?.nome })}
                    className="h-4 w-4 shrink-0 rounded border-ink-300 text-accent-600 focus:ring-accent-500 dark:border-ink-600 dark:bg-ink-800"
                  />
                  <div className={cn('min-w-0 flex-1', !b.visivel && 'opacity-50')}>
                    <p className="truncate text-sm text-ink-800 dark:text-ink-100">{nome(b.id)?.nome}</p>
                    <p className="truncate text-[11px] text-ink-400">{nome(b.id)?.dica}</p>
                  </div>
                  <div className="hidden shrink-0 rounded-md bg-ink-100 p-0.5 text-[11px] sm:flex dark:bg-ink-800">
                    {[
                      { id: 'metade', rotulo: t('Metade') },
                      { id: 'inteira', rotulo: t('Inteira') },
                    ].map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => mudarBloco(b.id, { largura: l.id })}
                        aria-pressed={b.largura === l.id}
                        className={cn(
                          'rounded px-2 py-0.5 transition',
                          b.largura === l.id ? 'bg-white text-ink-800 shadow-subtle dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500',
                        )}
                      >
                        {l.rotulo}
                      </button>
                    ))}
                  </div>
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      onClick={() => onMudar({ blocos: moverBlocoDoInicio(layout.blocos, b.id, -1) })}
                      disabled={i === 0}
                      aria-label={t('Subir {nome}', { nome: nome(b.id)?.nome })}
                      className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 dark:hover:bg-ink-800 [@media(pointer:coarse)]:p-2"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMudar({ blocos: moverBlocoDoInicio(layout.blocos, b.id, 1) })}
                      disabled={i === layout.blocos.length - 1}
                      aria-label={t('Descer {nome}', { nome: nome(b.id)?.nome })}
                      className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 dark:hover:bg-ink-800 [@media(pointer:coarse)]:p-2"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-ink-400">{t('No celular os blocos ficam um embaixo do outro, na ordem daqui.')}</p>
          </section>
        </div>
      )}
    </Modal>
  )
}

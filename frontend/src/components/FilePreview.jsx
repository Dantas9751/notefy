import { useEffect, useRef, useState } from 'react'
import { Download, FileWarning, Moon, Sun } from 'lucide-react'
import { buscarArquivo } from '@/lib/fileMedia'
import { baixar } from '@/lib/desktop'
import { Button, Spinner } from '@/components/ui'
import TextFilePreview, { ehArquivoDeTexto, extensaoDe } from '@/components/TextFilePreview'
import { limparNoLugar } from '@/lib/sanitizar'
import { cn, formatBytes } from '@/lib/utils'
import { columnLetter } from '@/lib/formula'
import { t } from '@/lib/i18n'

/**
 * Previews de arquivo, todos buscados pela sessão do app.
 *
 * O que era direto (`<img src={file_url}>`, `<iframe>`) troca por um
 * `blob:` baixado com o axios: o mesmo caminho que o resto do app usa
 * para falar com o backend. É isso que conserta o "localhost se recusou
 * a conectar" do PDF — a URL absoluta do servidor de mídia apontava para
 * uma porta que a janela não alcançava.
 *
 * Office (.docx/.xlsx/.pptx) é carregado sob demanda, e cada formato tem
 * o seu chunk: quem abre um PDF não paga o bundle das planilhas.
 */

/** Acima disto o Office não pré-visualiza — o parse trava a interface. */
const TETO_OFFICE = 25 * 1024 * 1024

/** Formatos Office com preview. */
const EXTENSOES_DE_OFFICE = ['docx', 'xlsx', 'xlsm', 'pptx']

/**
 * Planilhas, lidas pelo `lerXlsx` (um zip de XMLs). O `.xls` antigo é
 * binário e fica sem prévia: lê-lo pedia a `xlsx` do npm, que tem falha
 * de segurança sem correção justamente ao abrir arquivo de terceiros.
 */
const EXTENSOES_DE_PLANILHA = ['xlsx', 'xlsm']

export function ehArquivoDeOffice(doc) {
  return EXTENSOES_DE_OFFICE.includes(extensaoDe(doc.original_name || doc.title))
}

/**
 * Baixa o arquivo pela sessão do app, com o aviso de andamento e de onde
 * foi salvo. O `href` direto do `file_url` sofre do mesmo problema do
 * preview, então o download também passa pelo blob. Não lança.
 */
export function baixarArquivoNoClique(doc) {
  return baixar(doc.original_name || doc.title, async () => (await buscarArquivo(doc.file_url, 'blob')).data)
}

/** Estado comum do blob: baixa, devolve a URL e revoga ao trocar/desmontar. */
function useBlobUrl(fileUrl) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!fileUrl) return undefined
    let ativo = true
    let url = null
    setBlobUrl(null)
    setErro(null)
    buscarArquivo(fileUrl, 'blob')
      .then(({ data }) => {
        if (!ativo) return
        url = URL.createObjectURL(data)
        setBlobUrl(url)
      })
      .catch(() => {
        if (ativo) setErro(true)
      })
    return () => {
      ativo = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [fileUrl])

  return { blobUrl, erro }
}

function FalhaAoCarregar({ doc }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <FileWarning size={22} className="text-ink-400" />
      <p className="text-sm text-ink-500 dark:text-ink-400">
        {t('Não foi possível carregar o arquivo para pré-visualizar.')}
      </p>
      <Button icon={Download} onClick={() => baixarArquivoNoClique(doc)}>
        {t('Baixar')} {doc.original_name}
      </Button>
    </div>
  )
}

/**
 * Imagem, PDF, áudio e vídeo embutidos a partir do blob.
 */
function MediaPreview({ doc }) {
  const { blobUrl, erro } = useBlobUrl(doc.file_url)
  if (erro) return <FalhaAoCarregar doc={doc} />
  if (!blobUrl) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }

  switch (doc.file_kind) {
    case 'image':
      return (
        <img
          src={blobUrl}
          alt={doc.title}
          className="mx-auto max-h-full max-w-full rounded-lg object-contain shadow-card"
        />
      )
    case 'pdf':
      return (
        <iframe
          src={blobUrl}
          title={doc.title}
          className="h-full w-full rounded-lg border border-ink-200 dark:border-ink-800"
        />
      )
    case 'audio':
      return <audio controls src={blobUrl} className="w-full max-w-xl" />
    case 'video':
      return <video controls src={blobUrl} className="max-h-full max-w-full rounded-lg" />
    default:
      return null
  }
}

/**
 * Office sob demanda. Cada formato importa a própria biblioteca — o
 * chunk só chega quando o arquivo pede. O contêiner fica sempre montado
 * (o ref precisa ser estável para a biblioteca injetar nele), e o
 * spinner cobre por cima enquanto o parse não termina.
 */
function OfficePreview({ doc }) {
  const containerRef = useRef(null)
  const [estado, setEstado] = useState('carregando')
  const [erro, setErro] = useState(null)
  // Documento do Office tem cor de texto embutida: no tema escuro do app
  // ele fica preto no preto. O padrão é papel claro, como no Word.
  const [fundoClaro, setFundoClaro] = useState(true)

  const extensao = extensaoDe(doc.original_name || doc.title)

  useEffect(() => {
    if (doc.size > TETO_OFFICE) {
      setEstado('grande')
      return undefined
    }

    let ativo = true
    setEstado('carregando')
    setErro(null)

    buscarArquivo(doc.file_url, 'arraybuffer')
      .then(async ({ data }) => {
        if (!ativo) return
        const el = containerRef.current
        if (!el) return

        if (extensao === 'docx') {
          const { renderAsync } = await import('docx-preview')
          await renderAsync(data, el, undefined, {
            inWrapper: false,
            ignoreLastRenderedPageBreak: false,
            experimental: true,
          })
          limparNoLugar(el)
        } else {
          const { init } = await import('pptx-preview')
          const caixa = el.getBoundingClientRect()
          const visualizador = init(el, {
            width: Math.max(320, Math.round(caixa.width)),
            height: Math.max(240, Math.round(caixa.height)),
          })
          // `preview` devolve uma Promise, e sem esperar o spinner sumia
          // antes do slide aparecer, e a limpeza abaixo rodaria no vazio.
          await visualizador.preview(data)
          limparNoLugar(el)
        }
        if (ativo) setEstado('pronto')
      })
      .catch(() => {
        if (ativo) setErro(true)
      })

    return () => {
      ativo = false
    }
    // O contêiner é o único destino do render — o resto do efeito vive
    // do endereço do arquivo e do formato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.file_url, extensao])

  if (estado === 'grande') {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        {t('Arquivo de')} {formatBytes(doc.size)}{t(', grande demais para pré-visualizar. Baixe para abrir no seu editor.')}
      </p>
    )
  }
  if (erro) return <FalhaAoCarregar doc={doc} />

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col">
      <button
        onClick={() => setFundoClaro((v) => !v)}
        title={
          fundoClaro
            ? t('Papel claro (como no Word). Clique para seguir o tema do app.')
            : t('Seguindo o tema do app. Clique para ver em papel claro.')
        }
        aria-label={t('Fundo do documento')}
        className="absolute right-3 top-3 z-10 rounded-md border border-ink-200 bg-white/95 p-1.5 text-ink-500 shadow-subtle backdrop-blur transition hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-900/95 dark:hover:bg-ink-800"
      >
        {fundoClaro ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      <div
        ref={containerRef}
        // O docx/xlsx vem com cor de texto embutida (preto), pensada para
        // papel branco. Herdar o fundo escuro do app deixa preto no preto.
        //
        // A saída é a mesma do quadro e do diagrama: o documento tem o
        // PRÓPRIO fundo, e um botão decide se ele segue o app ou fica
        // claro. Inverter as cores por filtro estragaria as imagens
        // dentro do arquivo — o que o usuário quer é ver o documento
        // como ele é.
        className={cn(
          'h-full w-full min-h-0 flex-1 select-text overflow-auto rounded-lg border border-ink-200 dark:border-ink-800',
          fundoClaro ? 'bg-white text-ink-900' : 'bg-white dark:bg-ink-900',
        )}
      />
      {estado === 'carregando' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      )}
    </div>
  )
}

/**
 * A primeira aba de um .xlsx como a grade do Notefy: letras em cima,
 * números ao lado, número à direita. Desenhada pelo React (e não por
 * `innerHTML`), na cor do tema: não há cor embutida do arquivo para
 * brigar com o fundo escuro.
 */
function PlanilhaPreview({ doc }) {
  const [estado, setEstado] = useState({ carregando: true })

  useEffect(() => {
    if (doc.size > TETO_OFFICE) {
      setEstado({ grande: true })
      return undefined
    }
    let ativo = true
    setEstado({ carregando: true })
    buscarArquivo(doc.file_url, 'arraybuffer')
      .then(async ({ data }) => (await import('@/lib/lerXlsx')).lerXlsx(data))
      .then((planilha) => ativo && setEstado({ planilha }))
      .catch(() => ativo && setEstado({ erro: true }))
    return () => {
      ativo = false
    }
  }, [doc.file_url, doc.size])

  if (estado.grande) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        {t('Arquivo de')} {formatBytes(doc.size)}{t(', grande demais para pré-visualizar. Baixe para abrir no seu editor.')}
      </p>
    )
  }
  if (estado.erro) return <FalhaAoCarregar doc={doc} />
  if (estado.carregando) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }

  const { linhas, truncado } = estado.planilha
  if (!linhas.length) return <p className="text-sm text-ink-500 dark:text-ink-400">{t('A planilha está vazia.')}</p>
  const largura = linhas[0].length
  const borda = 'border-b border-r border-ink-200 dark:border-ink-700'

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 select-text overflow-auto rounded-lg border border-ink-200 dark:border-ink-800">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={cn('sticky left-0 z-20 w-11 bg-ink-50 px-1 py-1.5 text-[11px] font-medium text-ink-400 dark:bg-ink-900', borda)} />
              {Array.from({ length: largura }, (_, c) => (
                <th key={c} className={cn('min-w-[80px] bg-ink-50 px-2 py-1.5 text-center font-mono text-[10px] font-normal text-ink-400 dark:bg-ink-900', borda)}>
                  {columnLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, l) => (
              <tr key={l}>
                <td className={cn('sticky left-0 bg-white px-1 text-center text-[11px] tabular-nums text-ink-400 dark:bg-ink-950', borda)}>{l + 1}</td>
                {linha.map((celula, c) => (
                  <td
                    key={c}
                    title={celula?.texto}
                    className={cn(
                      'h-8 max-w-[320px] truncate bg-white px-2 text-ink-800 dark:bg-ink-950 dark:text-ink-100',
                      borda,
                      celula?.numero && 'text-right tabular-nums',
                    )}
                  >
                    {celula?.texto}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncado && (
        <p className="mt-2 text-xs text-ink-400">{t('Mostrando só o começo da planilha. Baixe para ver tudo.')}</p>
      )}
    </div>
  )
}

/**
 * Escolhe o preview certo para o documento. Devolve `null` quando o
 * formato não tem preview — o chamador mostra o convite de download.
 */
export default function FilePreview({ doc }) {
  if (ehArquivoDeTexto(doc)) return <TextFilePreview doc={doc} />
  if (EXTENSOES_DE_PLANILHA.includes(extensaoDe(doc.original_name || doc.title))) return <PlanilhaPreview doc={doc} />
  if (ehArquivoDeOffice(doc)) return <OfficePreview doc={doc} />
  if (['image', 'pdf', 'audio', 'video'].includes(doc.file_kind)) {
    return <MediaPreview doc={doc} />
  }
  return null
}

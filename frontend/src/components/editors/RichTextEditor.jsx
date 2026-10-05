import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import api, { extractError } from '@/lib/api'
import { escaparTexto, limparHtml } from '@/lib/sanitizar'
import { urlDeMedia } from '@/lib/fileMedia'
import { cortarNoCursor, posicionarCursor } from '@/lib/cursor'
import { htmlVazio } from '@/lib/nota'
import { cn } from '@/lib/utils'
import LinkPromptModal from '@/components/modals/LinkPromptModal'
import { t } from '@/lib/i18n'

/**
 * Um trecho de texto rico da página, sobre `contentEditable`.
 *
 * Usa `document.execCommand`, que está marcado como deprecated mas segue
 * implementado em todos os navegadores atuais e é a única forma de editar
 * texto rico sem trazer um ProseMirror/TipTap inteiro — o frontend tem
 * poucas dependências e a ideia é que continue assim.
 *
 * Não tem barra própria: a nota é uma página com UMA barra de funções no
 * topo (`BarraDeFuncoes`), que age sobre o trecho onde o cursor está. Uma
 * barra por trecho empilhava toolbars e fazia a página parecer uma pilha
 * de caixas. O que a página precisa daqui sai pela `ref`: focar no começo
 * ou no fim, cortar no cursor (para um bloco nascer ali), guardar a
 * seleção enquanto a barra rouba o foco.
 *
 * O conteúdo é HTML e o valor só é empurrado para dentro do DOM quando
 * vem de fora (troca de documento, desfazer). Reescrever o innerHTML a
 * cada tecla destruiria a posição do cursor.
 */

/** Sentinela de "ainda não escrevi nada no DOM".
 *
 *  Inicializar a ref com o próprio `value` faria a primeira execução do
 *  efeito concluir que o conteúdo já está sincronizado — e a nota abriria
 *  em branco, porque o innerHTML nunca chegou a ser preenchido. */
const UNSET = Symbol('unset')

/** Link só para a web, e-mail e telefone: um `javascript:` colado no campo viraria código no clique. */
const ESQUEMAS_DE_LINK = /^(https?|mailto|tel):/i

const RichTextEditor = forwardRef(function RichTextEditor(
  {
    value,
    onChange,
    placeholder,
    //: Mostra a dica mesmo sem foco. Só a primeira linha de uma nota vazia:
    //: nas outras, a dica aparece onde o cursor está, e não em toda linha
    //: em branco da página.
    dicaSempre = false,
    //: Nota que hospeda a imagem. Sem ele não há upload — uma imagem sem
    //: dono viraria arquivo solto na raiz.
    documentId,
    //: Para onde mandar a falha do upload de imagem. Sem ele o `catch`
    //: engolia o erro e a pessoa colava, via o spinner e não via imagem
    //: nenhuma — sem nada na tela explicando o porquê.
    onError,
    onKeyDown,
    onInput,
    onFocus,
    onBlur,
    //: Falso no item somente leitura: o texto continua selecionável e copiável.
    editavel = true,
    className,
  },
  ref,
) {
  const editorRef = useRef(null)
  const lastValueRef = useRef(UNSET)
  const imagemRef = useRef(null)
  // Onde o link (ou a imagem) vai entrar, guardado enquanto o modal ou o
  // seletor de arquivo roubam o foco — e enquanto um menu da barra está
  // aberto. A seleção viva do contentEditable não sobrevive a isso.
  const intervaloRef = useRef(null)
  const [enviandoImagem, setEnviandoImagem] = useState(false)
  const [linkAberto, setLinkAberto] = useState(false)

  /** A dica de "digite /" é CSS (`[data-vazio]::before`); o `:empty` não
      serve porque um trecho apagado ainda guarda um `<br>`. */
  const marcarVazio = () => {
    const el = editorRef.current
    if (el) el.toggleAttribute('data-vazio', htmlVazio(el.innerHTML))
  }

  // Só sincroniza quando o HTML mudou por fora (abrir outro documento,
  // desfazer, dois trechos virando um). `useLayoutEffect`: a página põe o
  // cursor no lugar certo no layout effect DELA, que roda depois dos
  // filhos — com `useEffect` o HTML novo entrava por cima do cursor já
  // posicionado e ele voltava para o começo do trecho.
  useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (value === lastValueRef.current) return
    // Higienizado ANTES de entrar no DOM. Este `innerHTML` é o ponto
    // onde todo caminho de HTML de fora desemboca — backup importado,
    // resposta da IA, colar de uma página web — e o backend guarda o
    // campo sem tocar nele. Ver `lib/sanitizar.js`.
    el.innerHTML = limparHtml(value)
    // O `src` guardado leva o host de quem colou (`127.0.0.1:8000` em dev,
    // outra porta no desktop) — e um backup levado de um para o outro
    // apontava para um servidor que não existe ali. Remonta sobre a origem
    // da API atual; o caminho `/media/...` é o que identifica o arquivo.
    for (const img of el.querySelectorAll('img')) {
      img.removeAttribute('data-quebrada')
      const src = img.getAttribute('src') || ''
      if (src.includes('/media/')) img.setAttribute('src', urlDeMedia(src))
    }
    lastValueRef.current = value
    marcarVazio()
  }, [value])

  // Imagem cujo arquivo sumiu: em vez do ícone quebrado minúsculo, uma
  // caixa tracejada com o nome. `error` não borbulha, daí a captura.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return undefined
    const aoFalhar = (e) => {
      if (e.target?.tagName !== 'IMG') return
      e.target.setAttribute('data-quebrada', '')
      e.target.title = t('Imagem não encontrada')
    }
    el.addEventListener('error', aoFalhar, true)
    return () => el.removeEventListener('error', aoFalhar, true)
  }, [])

  const emitir = () => {
    const html = editorRef.current?.innerHTML ?? ''
    lastValueRef.current = html
    marcarVazio()
    onChange(html)
  }

  const guardarSelecao = () => {
    const selecao = window.getSelection()
    intervaloRef.current =
      selecao && selecao.rangeCount > 0 && editorRef.current?.contains(selecao.anchorNode)
        ? selecao.getRangeAt(0).cloneRange()
        : null
  }

  const restaurarSelecao = () => {
    editorRef.current?.focus({ preventScroll: true })
    if (!intervaloRef.current) {
      posicionarCursor(editorRef.current, 'fim')
      return
    }
    const selecao = window.getSelection()
    selecao.removeAllRanges()
    selecao.addRange(intervaloRef.current)
  }

  useImperativeHandle(ref, () => ({
    get el() {
      return editorRef.current
    },
    focar: (onde) => posicionarCursor(editorRef.current, onde),
    /** Corta no cursor e fica só com o "antes"; o resto vai para quem pediu. */
    cortar: () => {
      const partes = cortarNoCursor(editorRef.current)
      lastValueRef.current = partes.antes
      marcarVazio()
      return partes
    },
    emitir,
    guardarSelecao,
    restaurarSelecao,
    inserirLink: () => {
      guardarSelecao()
      setLinkAberto(true)
    },
    escolherImagem: () => {
      if (!documentId) {
        onError?.(t('Clique em Criar para salvar a nota e depois insira a imagem.'))
        return
      }
      guardarSelecao()
      imagemRef.current?.click()
    },
  }))

  const handleInput = (event) => {
    emitir()
    onInput?.(event)
  }

  const handlePaste = (e) => {
    // Print Screen e Ctrl+V é como se põe imagem numa nota de estudo —
    // o slide, a foto do quadro, o gráfico do livro. Sem este ramo o
    // conteúdo caía no `getData('text/plain')`, que para imagem é vazio:
    // o Ctrl+V simplesmente não fazia nada.
    const imagem = [...(e.clipboardData?.items ?? [])]
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile()
    if (imagem) {
      e.preventDefault()
      // Nota nova só existe na memória até o "Criar": sem id, a imagem não
      // tem de quem ser anexo. Antes o Ctrl+V caía em silêncio, e a pessoa
      // achava que o print não tinha sido copiado.
      if (documentId) {
        guardarSelecao()
        enviarImagem(imagem)
      } else {
        onError?.(t('Clique em Criar para salvar a nota e depois cole a imagem.'))
      }
      return
    }

    // Colar de outro app traria estilos e fontes de fora, que destroem a
    // consistência tipográfica da nota. Colamos como texto puro.
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const handleKeyDown = (event) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    // Tab dentro do texto indenta (e aninha item de lista), não pula para
    // o próximo campo.
    if (event.key === 'Tab') {
      event.preventDefault()
      document.execCommand(event.shiftKey ? 'outdent' : 'indent')
      emitir()
    }
  }

  /**
   * Envia a imagem e a insere onde o cursor estava.
   *
   * Sobe como ANEXO da nota (`attached_to`), e não como arquivo solto: a
   * listagem da pasta usa `loose()`, que exclui anexo — sem isso, colar
   * cinco prints numa nota encheria a pasta de cinco itens que ninguém
   * pediu. O endpoint já herda a pasta do documento hospedeiro.
   *
   * O intervalo foi guardado ANTES (colar e o botão da barra guardam): o
   * `await` mata a seleção viva, e o `execCommand` sem seleção dentro do
   * elemento não insere nada — era o "colei uma vez e na segunda não foi".
   */
  const enviarImagem = async (arquivo) => {
    // Dois envios ao mesmo tempo disputariam o mesmo ponto de inserção.
    if (!arquivo || !documentId || enviandoImagem) return
    setEnviandoImagem(true)
    try {
      const corpo = new FormData()
      corpo.append('files', arquivo)
      corpo.append('attached_to', documentId)
      const { data } = await api.post('/documents/upload/', corpo)
      const url = data?.[0]?.file_url
      if (!url) return
      restaurarSelecao()
      // `alt` com o nome original: é o que a busca e um leitor de tela
      // têm para trabalhar depois. Escapado porque é nome de ARQUIVO —
      // uma aspa nele fecharia o atributo e o resto viraria markup.
      document.execCommand('insertHTML', false, `<img src="${url}" alt="${escaparTexto(arquivo.name)}" />`)
      emitir()
    } catch (err) {
      onError?.(extractError(err))
    } finally {
      intervaloRef.current = null
      setEnviandoImagem(false)
    }
  }

  const aplicarLink = (url) => {
    if (!ESQUEMAS_DE_LINK.test(url)) return
    restaurarSelecao()
    const selecao = window.getSelection()
    // Sem texto selecionado o `createLink` não faz nada: o endereço entra
    // escrito, já como link.
    if (selecao?.isCollapsed) {
      document.execCommand('insertHTML', false, `<a href="${escaparTexto(url)}">${escaparTexto(url)}</a>&nbsp;`)
    } else {
      document.execCommand('createLink', false, url)
    }
    intervaloRef.current = null
    emitir()
  }

  return (
    <>
      <div
        ref={editorRef}
        contentEditable={editavel}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={t('Conteúdo da nota')}
        aria-busy={enviandoImagem || undefined}
        data-placeholder={editavel ? placeholder : undefined}
        data-sempre={dicaSempre ? '' : undefined}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={(event) => {
          // Chrome mantém a seleção do trecho mesmo com o foco num botão ou
          // num <select> da barra; guardá-la aqui é o que deixa a barra
          // aplicar o comando no lugar certo depois.
          guardarSelecao()
          onBlur?.(event)
        }}
        className={cn('prose-note texto-da-pagina relative min-h-[1.75em] focus:outline-none', className)}
      />

      {/* Escondido: quem abre o seletor é a barra (ou o "/imagem"). */}
      <input
        ref={imagemRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          enviarImagem(e.target.files?.[0])
          // Zera para o mesmo arquivo poder ser escolhido de novo.
          e.target.value = ''
        }}
      />

      <LinkPromptModal open={linkAberto} onClose={() => setLinkAberto(false)} onConfirm={aplicarLink} />
    </>
  )
})

export default RichTextEditor

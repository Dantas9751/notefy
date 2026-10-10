import { Suspense, forwardRef, lazy, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import ChecklistSection from './ChecklistSection'
import TableSection from './TableSection'
import BarraDeFuncoes from './BarraDeFuncoes'
import MenuDeComandos from './MenuDeComandos'
import { Spinner } from '@/components/ui'
import { ContextMenu, useContextMenu } from '@/components/ui/ContextMenu'
import {
  contarNos,
  cursorNaPrimeiraLinha,
  cursorNaUltimaLinha,
  cursorNoInicio,
  estiloNoCursor,
  pontoNoTexto,
  retanguloDoCursor,
  textoAntesDoCursor,
  textoDoBloco,
} from '@/lib/cursor'
import {
  atalhoMarkdown,
  consultaDaBarra,
  duplicarBloco,
  ehDivisor,
  ehTexto,
  filtrarComandos,
  htmlVazio,
  inserirBloco,
  inserirDepois,
  moverBloco,
  normalizar,
  novaSecao,
  removerSecao,
} from '@/lib/nota'
import { cn } from '@/lib/utils'
import { idioma, t } from '@/lib/i18n'

// Carregado sob demanda: o bloco de código arrasta o highlight.js junto,
// e uma nota só de texto não deve pagar por ele.
const CodeSection = lazy(() => import('./CodeSection'))

/**
 * A nota: uma página contínua, como no Word.
 *
 * No banco ela continua sendo uma lista de seções (ver `lib/nota.js` e
 * `backend/content/schemas.py`); na tela é uma folha só, com a barra de
 * funções no topo e o texto correndo de um bloco para o outro. Nada aqui
 * pede o mouse para criar coisas:
 *
 * - "/" abre o menu de inserir, filtrado pelo que se digita depois;
 * - "[] ", "# ", "- ", "1. ", "> " e "```" no começo da linha viram
 *   checklist, título, lista, lista numerada, citação e código;
 * - as setas, o Enter e o Backspace atravessam os blocos como se a página
 *   fosse um texto só (o resto está em cada bloco);
 * - Ctrl+Z desfaz também o que não é digitação: inserir, mover e apagar
 *   bloco entram no histórico do editor, junto com o texto.
 *
 * Desenha o cabeçalho (título) e o rodapé (anexos) que o DocumentEditor
 * passa, DENTRO da folha: no Word o título é parte da página, e a barra
 * de funções fica acima dela.
 */

const COMANDOS_DE_BLOCO = new Set(['checklist', 'table', 'code'])

const dataDeHoje = () =>
  new Date().toLocaleDateString(idioma, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Apaga n caracteres antes do cursor pela via do navegador (o atalho digitado). */
function apagarAntes(n) {
  for (let i = 0; i < n; i += 1) document.execCommand('delete')
}

/** Alça de um bloco, na margem: menu no clique (e no toque), arraste no mouse. */
function AlcaDoBloco({ rotulo, onMenu, onArrastar, onSoltarArraste }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', rotulo)
        onArrastar()
      }}
      onDragEnd={onSoltarArraste}
      role="button"
      tabIndex={-1}
      title={t('Arraste para mover, clique para opções')}
      aria-label={t('Opções do bloco')}
      onClick={onMenu}
      onContextMenu={onMenu}
      className="absolute -left-7 top-1 cursor-grab rounded p-1 text-ink-300 opacity-0 transition hover:bg-ink-100 hover:text-ink-600 active:cursor-grabbing group-focus-within/bloco:opacity-100 group-hover/bloco:opacity-100 dark:hover:bg-ink-800"
    >
      <GripVertical size={14} />
    </div>
  )
}

const NoteEditor = forwardRef(function NoteEditor({
  data,
  onChange,
  documentId,
  onError,
  //: Título (e o que mais vier antes do texto), desenhado dentro da folha.
  cabecalho,
  //: Anexos, no pé da folha.
  rodape,
  //: Conteúdo logo abaixo da primeira linha de uma nota vazia — os
  //: modelos sugeridos, num item recém-criado.
  aoComecar,
  //: Histórico do DocumentEditor: grava um passo, desfaz, refaz.
  onCommit,
  onUndo,
  onRedo,
  //: Item somente leitura (Propriedades): sem barra, sem alças, nada editável.
  somenteLeitura = false,
}, ref) {
  const pagina = useMemo(() => normalizar(data?.sections), [data?.sections])
  const notaVazia = pagina.length === 1 && htmlVazio(pagina[0].html)

  // O dado mais novo, para duas operações seguidas no mesmo evento não
  // trabalharem sobre a mesma versão velha (o render ainda não veio).
  const dadosRef = useRef(data)
  dadosRef.current = data
  const paginaAtual = () => normalizar(dadosRef.current?.sections)

  // Cada seção registra aqui o que a página precisa dela (focar, cortar…).
  const alvosRef = useRef({})
  const refs = useRef(new Map())
  const refDe = (id) => {
    if (!refs.current.has(id)) {
      refs.current.set(id, (alvo) => {
        if (alvo) alvosRef.current[id] = alvo
        else delete alvosRef.current[id]
      })
    }
    return refs.current.get(id)
  }

  const [foco, setFoco] = useState(null)
  const corpoRef = useRef(null)
  const ultimoTextoRef = useRef(null)
  const [estadoDaBarra, setEstadoDaBarra] = useState({ marcas: {} })
  const [barra, setBarra] = useState(null)
  const barraRef = useRef(null)
  barraRef.current = barra
  const [arrastando, setArrastando] = useState(null)
  const { menu, openMenu, closeMenu } = useContextMenu()

  // ----------------------------------------------------------------
  // Foco depois do render: o bloco que acabou de nascer ainda não existe
  // quando a operação acontece.
  // ----------------------------------------------------------------
  const focoPendente = useRef(null)
  useLayoutEffect(() => {
    const pendente = focoPendente.current
    if (!pendente) return
    const alvo = alvosRef.current[pendente.id]
    // O bloco de código pode estar carregando (lazy): ele se foca sozinho
    // ao montar, pelo `autoFocus` que recebeu neste mesmo render.
    if (!alvo) return
    focoPendente.current = null
    alvo.focar(pendente.onde)
  })

  // ----------------------------------------------------------------
  // Mudanças e histórico
  // ----------------------------------------------------------------
  const trechoRef = useRef(null)

  /** O que foi digitado até aqui vira um passo do desfazer. */
  const fecharTrechoDigitado = () => {
    if (!trechoRef.current) return
    clearTimeout(trechoRef.current)
    trechoRef.current = null
    onCommit?.(dadosRef.current)
  }

  /** Esquece o passo em aberto (o atalho apagou os próprios caracteres). */
  const descartarTrechoDigitado = () => {
    clearTimeout(trechoRef.current)
    trechoRef.current = null
  }

  const emitir = (secoes, { estrutural = false, focar = null } = {}) => {
    if (estrutural) fecharTrechoDigitado()
    const proximo = { ...(dadosRef.current ?? {}), sections: secoes }
    dadosRef.current = proximo
    onChange(proximo)
    if (estrutural) {
      onCommit?.(proximo)
    } else {
      // Digitação vira passo depois de uma pausa: desfazer letra por
      // letra seria inútil, e desfazer a nota inteira, pior.
      clearTimeout(trechoRef.current)
      trechoRef.current = setTimeout(() => {
        trechoRef.current = null
        onCommit?.(dadosRef.current)
      }, 700)
    }
    if (focar) focoPendente.current = focar
  }

  useEffect(() => () => clearTimeout(trechoRef.current), [])

  const mudarSecao = (id, patch) => {
    const atual = paginaAtual()
    const i = atual.findIndex((s) => s.id === id)
    if (i === -1) return
    emitir(atual.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  }

  // Depois de desfazer/refazer o texto é reescrito por fora e o cursor
  // some; ele volta para o fim do trecho que mudou.
  const paginaAntesDoHistorico = useRef(null)
  useEffect(() => {
    const antiga = paginaAntesDoHistorico.current
    if (!antiga) return
    paginaAntesDoHistorico.current = null
    const k = pagina.findIndex((s, i) => JSON.stringify(s) !== JSON.stringify(antiga[i]))
    const alvo = pagina[k === -1 ? pagina.length - 1 : k]
    if (alvo) alvosRef.current[alvo.id]?.focar('fim')
  }, [pagina])

  const desfazer = () => {
    fecharTrechoDigitado()
    paginaAntesDoHistorico.current = paginaAtual()
    onUndo?.()
  }
  const refazer = () => {
    fecharTrechoDigitado()
    paginaAntesDoHistorico.current = paginaAtual()
    onRedo?.()
  }

  // ----------------------------------------------------------------
  // Navegação e blocos
  // ----------------------------------------------------------------
  const focar = (id, onde) => alvosRef.current[id]?.focar(onde)

  /** Sai de uma seção para a vizinha, com o cursor na ponta certa. */
  const sair = (id, direcao) => {
    const atual = paginaAtual()
    const i = atual.findIndex((s) => s.id === id)
    const alvo = atual[direcao === 'cima' ? i - 1 : i + 1]
    if (alvo) focar(alvo.id, direcao === 'cima' ? 'fim' : 'inicio')
  }

  /** O bloco nasce onde o cursor está: o texto é cortado em antes e depois. */
  const inserirBlocoNoTexto = (id, tipo, opcoes = {}) => {
    const editor = alvosRef.current[id]
    if (!editor?.cortar) return
    const atual = paginaAtual()
    const i = atual.findIndex((s) => s.id === id)
    if (i === -1) return
    const { antes, linha, depois } = editor.cortar()
    const bloco = novaSecao(tipo, { texto: linha, ...opcoes })
    emitir(inserirBloco(atual, i, { antes, depois }, bloco), {
      estrutural: true,
      focar: { id: bloco.id, onde: linha ? 'fim' : 'inicio' },
    })
  }

  const removerBloco = (id) => {
    const atual = paginaAtual()
    const i = atual.findIndex((s) => s.id === id)
    if (i === -1) return
    const anterior = atual[i - 1]
    const proxima = removerSecao(atual, i)
    // Os textos de cima e de baixo viram um, com o id do de cima: o cursor
    // vai para a emenda.
    const alvo = anterior && ehTexto(anterior) ? anterior : proxima[Math.min(i, proxima.length - 1)]
    emitir(proxima, {
      estrutural: true,
      focar: alvo && {
        id: alvo.id,
        onde: alvo === anterior && !htmlVazio(anterior.html) ? { no: contarNos(anterior.html) } : 'inicio',
      },
    })
  }

  const mover = (id, direcao) => {
    const atual = paginaAtual()
    const i = atual.findIndex((s) => s.id === id)
    const proxima = moverBloco(atual, i, direcao)
    if (proxima !== atual) emitir(proxima, { estrutural: true, focar: { id, onde: 'inicio' } })
  }

  const moverPara = (de, para) => {
    const atual = paginaAtual()
    if (de === para || de + 1 === para) return
    const bloco = atual[de]
    const sem = atual.filter((_, i) => i !== de)
    sem.splice(para > de ? para - 1 : para, 0, bloco)
    emitir(normalizar(sem), { estrutural: true })
  }

  const duplicar = (id) => {
    const atual = paginaAtual()
    emitir(duplicarBloco(atual, atual.findIndex((s) => s.id === id)), { estrutural: true })
  }

  // ----------------------------------------------------------------
  // A barra de funções
  // ----------------------------------------------------------------
  /** O trecho de texto onde a barra age: o último que teve o cursor, ou o último da página. */
  const textoAtivo = () => {
    const id = ultimoTextoRef.current
    if (id && alvosRef.current[id]?.el) return { id, editor: alvosRef.current[id] }
    const ultimo = [...paginaAtual()].reverse().find(ehTexto)
    return ultimo && alvosRef.current[ultimo.id] ? { id: ultimo.id, editor: alvosRef.current[ultimo.id] } : {}
  }
  const editorAtivo = () => textoAtivo().editor ?? null

  /**
   * A barra relê o estado do cursor. O navegador só avisa quando a SELEÇÃO
   * muda, e um comando com o cursor parado (Negrito, uma cor) não a muda: o
   * botão ficava apagado com o negrito ligado.
   */
  const reler = () => document.dispatchEvent(new Event('selectionchange'))

  /** Comando de texto na seleção do trecho ativo (ou de volta nela). */
  const comando = (cmd, argumento = null) => {
    const editor = editorAtivo()
    if (!editor?.el) return
    const sel = window.getSelection()
    if (document.activeElement !== editor.el || !editor.el.contains(sel?.anchorNode)) editor.restaurarSelecao()
    document.execCommand(cmd, false, argumento)
    editor.emitir()
    reler()
  }

  /**
   * Cor da letra ou do marca-texto. `null` tira a cor: pinta com uma cor
   * sentinela (o navegador divide os trechos já coloridos no ponto certo)
   * e depois remove a sentinela, deixando a letra na cor do tema.
   */
  const aplicarCor = (tipo, cor) => {
    const editor = editorAtivo()
    if (!editor?.el) return
    const sel = window.getSelection()
    if (document.activeElement !== editor.el || !editor.el.contains(sel?.anchorNode)) editor.restaurarSelecao()
    const cmd = tipo === 'texto' ? 'foreColor' : 'hiliteColor'
    if (cor) {
      document.execCommand(cmd, false, cor)
      editor.emitir()
      reler()
      return
    }
    const SENTINELA = '#010203'
    document.execCommand(cmd, false, SENTINELA)
    for (const el of [...editor.el.querySelectorAll('font, [style]')]) {
      if (tipo === 'texto') {
        if ((el.getAttribute('color') || '').toLowerCase() === SENTINELA) el.removeAttribute('color')
        if (el.style?.color === 'rgb(1, 2, 3)') el.style.removeProperty('color')
      } else if (el.style?.backgroundColor === 'rgb(1, 2, 3)') {
        el.style.removeProperty('background-color')
      }
      if (el.getAttribute('style') === '') el.removeAttribute('style')
      if (/^(FONT|SPAN)$/.test(el.tagName) && el.attributes.length === 0) el.replaceWith(...el.childNodes)
    }
    editor.emitir()
  }

  /**
   * Fonte e tamanho por NOME e NÚMERO, como no Word. O `execCommand` só
   * conhece `<font face>` e os sete tamanhos do HTML antigo; então ele
   * marca o trecho com um valor sentinela e a marca vira o que a pessoa
   * escolheu: o nome da fonte, ou um `font-size` em pt. "Padrão" (vazio)
   * tira a fonte do trecho, que volta à fonte das notas.
   */
  const aplicarFonte = (nome) => {
    const editor = editorAtivo()
    if (!editor?.el) return
    const sel = window.getSelection()
    if (document.activeElement !== editor.el || !editor.el.contains(sel?.anchorNode)) editor.restaurarSelecao()
    if (window.getSelection().isCollapsed) {
      estiloNoCursor({ fontFamily: nome || 'var(--fonte-nota)' })
      editor.emitir()
      reler()
      return
    }
    document.execCommand('fontName', false, 'notefy-sentinela')
    for (const el of [...editor.el.querySelectorAll('font[face="notefy-sentinela"]')]) {
      if (nome) el.setAttribute('face', nome)
      else {
        el.removeAttribute('face')
        if (el.attributes.length === 0) el.replaceWith(...el.childNodes)
      }
    }
    editor.emitir()
    reler()
  }
  const aplicarTamanho = (pt) => {
    const editor = editorAtivo()
    if (!editor?.el) return
    const sel = window.getSelection()
    if (document.activeElement !== editor.el || !editor.el.contains(sel?.anchorNode)) editor.restaurarSelecao()
    if (window.getSelection().isCollapsed) {
      estiloNoCursor({ fontSize: `${pt}pt` })
      editor.emitir()
      reler()
      return
    }
    document.execCommand('fontSize', false, '7')
    for (const el of [...editor.el.querySelectorAll('font[size="7"]')]) {
      // Fica o elemento: o navegador junta tamanho e fonte no MESMO
      // `<font face size>`, e trocá-lo inteiro apagava a fonte escolhida.
      el.removeAttribute('size')
      el.style.fontSize = `${pt}pt`
      // O tamanho de dentro some: senão um trecho já aumentado não mudaria.
      for (const filho of el.querySelectorAll('[style*="font-size"]')) filho.style.removeProperty('font-size')
    }
    editor.emitir()
    // A seleção não mudou, então o navegador não avisa: a barra relê agora
    // e a caixa mostra o tamanho novo.
    reler()
  }

  const inserir = (tipo) => {
    if (COMANDOS_DE_BLOCO.has(tipo)) {
      // Cursor num bloco: o novo entra logo depois dele.
      if (foco && !foco.texto) {
        const atual = paginaAtual()
        const i = atual.findIndex((s) => s.id === foco.id)
        if (i !== -1) {
          const bloco = novaSecao(tipo)
          emitir(inserirDepois(atual, i, bloco), { estrutural: true, focar: { id: bloco.id, onde: 'inicio' } })
          return
        }
      }
      const { id } = textoAtivo()
      if (id) inserirBlocoNoTexto(id, tipo)
      return
    }
    if (tipo === 'divisor') comando('insertHorizontalRule')
    else if (tipo === 'data') comando('insertText', dataDeHoje())
    else if (tipo === 'link') editorAtivo()?.inserirLink()
    else if (tipo === 'imagem') editorAtivo()?.escolherImagem()
  }

  // Estado dos botões (negrito ligado, estilo do parágrafo…) segue o cursor.
  useEffect(() => {
    let quadro = 0
    const ler = () => {
      quadro = 0
      const sel = window.getSelection()
      if (!sel?.rangeCount) return
      const editor = Object.values(alvosRef.current).find((a) => a?.el?.contains(sel.anchorNode))
      if (!editor) return
      try {
        const q = (c) => document.queryCommandState(c)
        setEstadoDaBarra({
          marcas: Object.fromEntries(
            [
              'bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList',
              'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
            ].map((c) => [c, q(c)]),
          ),
          bloco: String(document.queryCommandValue('formatBlock') || 'p').replace(/[<>]/g, '').toLowerCase(),
          fonte: String(document.queryCommandValue('fontName') || '').replace(/["']/g, ''),
          // Em pt, do que está NA TELA: vale para o tamanho escolhido, para o
          // título e para o texto padrão da nota.
          tamanho: (() => {
            // O começo da seleção; depois de formatar, ele pode ser o parágrafo
            // apontando para o trecho novo, e o tamanho é o DO TRECHO.
            const faixa = sel.getRangeAt(0)
            let no = faixa.startContainer
            if (no.nodeType === 1 && no.childNodes[faixa.startOffset]) no = no.childNodes[faixa.startOffset]
            if (no.nodeType !== 1) no = no.parentElement
            return no ? Math.round(parseFloat(getComputedStyle(no).fontSize) * 0.75) : 11
          })(),
        })
      } catch {
        /* queryCommandState lança sem seleção viva */
      }
    }
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(ler)
    }
    document.addEventListener('selectionchange', agendar)
    // Ctrl+B, Ctrl+I... com o cursor parado também não mexem na seleção.
    document.addEventListener('keyup', agendar)
    return () => {
      document.removeEventListener('selectionchange', agendar)
      document.removeEventListener('keyup', agendar)
      cancelAnimationFrame(quadro)
    }
  }, [])

  // ----------------------------------------------------------------
  // O menu do "/"
  // ----------------------------------------------------------------
  const comandos = filtrarComandos(barra?.consulta ?? '').filter((c) => c.id !== 'imagem' || documentId)

  const executarComando = (id, cmd) => {
    const editor = alvosRef.current[id]
    if (!editor?.el) return
    // A barra e o que veio depois dela saem; o passo anterior (com o
    // "/tab" escrito) é o que um Ctrl+Z traz de volta.
    fecharTrechoDigitado()
    apagarAntes((barraRef.current?.consulta.length ?? 0) + 1)
    descartarTrechoDigitado()
    setBarra(null)
    if (COMANDOS_DE_BLOCO.has(cmd.id)) {
      inserirBlocoNoTexto(id, cmd.id)
      return
    }
    const porId = {
      texto: () => document.execCommand('formatBlock', false, 'p'),
      h1: () => document.execCommand('formatBlock', false, 'h1'),
      h2: () => document.execCommand('formatBlock', false, 'h2'),
      h3: () => document.execCommand('formatBlock', false, 'h3'),
      citacao: () => document.execCommand('formatBlock', false, 'blockquote'),
      ul: () => document.execCommand('insertUnorderedList'),
      ol: () => document.execCommand('insertOrderedList'),
      divisor: () => document.execCommand('insertHorizontalRule'),
      data: () => document.execCommand('insertText', false, dataDeHoje()),
      link: () => editor.inserirLink(),
      imagem: () => editor.escolherImagem(),
    }
    porId[cmd.id]?.()
    editor.emitir()
  }

  /** Depois de cada letra: atalho de Markdown, abrir ou filtrar o menu do "/". */
  const digitou = (id, evento) => {
    const nativo = evento.nativeEvent
    const editor = alvosRef.current[id]
    if (!editor?.el || nativo?.isComposing) return
    const inserindo = String(nativo?.inputType || '').startsWith('insert')
    const antes = textoAntesDoCursor(editor.el)
    if (antes == null) return

    const consulta = consultaDaBarra(antes)
    if (barraRef.current?.id === id) {
      // Menu aberto: filtra, ou fecha se a barra sumiu ou a pessoa seguiu
      // escrevendo outra coisa.
      if (consulta == null || (consulta.endsWith(' ') && !filtrarComandos(consulta.trim()).length)) setBarra(null)
      else setBarra((b) => b && { ...b, consulta, ativo: 0 })
      return
    }
    if (!inserindo) return

    if (consulta === '' && antes.endsWith('/')) {
      setBarra({ id, consulta: '', ativo: 0, ancora: retanguloDoCursor(editor.el) })
      return
    }

    const atalho = atalhoMarkdown(antes)
    if (!atalho) return
    // Depois do evento atual: mexer no DOM dentro do próprio `input`
    // dispararia outro `input` no meio deste.
    requestAnimationFrame(() => {
      if (textoAntesDoCursor(editor.el) !== antes) return
      fecharTrechoDigitado()
      apagarAntes(antes.length)
      descartarTrechoDigitado()
      if (atalho.bloco) {
        inserirBlocoNoTexto(id, atalho.bloco, { feito: atalho.feito })
        return
      }
      if (atalho.formato) document.execCommand('formatBlock', false, atalho.formato)
      if (atalho.lista) document.execCommand(atalho.lista)
      editor.emitir()
    })
  }

  // ----------------------------------------------------------------
  // Teclado no texto
  // ----------------------------------------------------------------
  const teclaNoTexto = (id, e) => {
    const editor = alvosRef.current[id]
    const el = editor?.el
    if (!el) return

    if (barraRef.current?.id === id) {
      const total = comandos.length
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!total) return
        const passo = e.key === 'ArrowDown' ? 1 : -1
        setBarra((b) => b && { ...b, ativo: (b.ativo + passo + total) % total })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!total) {
          setBarra(null)
          return
        }
        e.preventDefault()
        executarComando(id, comandos[Math.min(barraRef.current.ativo, total - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setBarra(null)
        return
      }
    }

    const mod = e.ctrlKey || e.metaKey
    // Ctrl+Shift+7/8/9: as listas do Google Docs. `code`, e não `key`: no
    // teclado ABNT o Shift+9 é "(", e a tecla física é a mesma.
    if (mod && e.shiftKey && !e.altKey) {
      if (e.code === 'Digit7') {
        e.preventDefault()
        comando('insertOrderedList')
        return
      }
      if (e.code === 'Digit8') {
        e.preventDefault()
        comando('insertUnorderedList')
        return
      }
      if (e.code === 'Digit9') {
        e.preventDefault()
        fecharTrechoDigitado()
        inserirBlocoNoTexto(id, 'checklist')
        return
      }
    }
    // Ctrl+Alt+0 a 3: texto normal e títulos, como no Word. O AltGr do
    // teclado brasileiro também chega como Ctrl+Alt — e AltGr+2 é o "²",
    // que precisa continuar sendo digitado.
    if (mod && e.altKey && !e.getModifierState?.('AltGraph')) {
      const formato = { Digit0: 'p', Digit1: 'h1', Digit2: 'h2', Digit3: 'h3' }[e.code]
      if (formato) {
        e.preventDefault()
        comando('formatBlock', formato)
        return
      }
    }
    if (mod || e.altKey) return

    if (e.key === 'Enter' && !e.shiftKey) {
      const linha = textoDoBloco(el)
      if (ehDivisor(linha) && textoAntesDoCursor(el) === linha) {
        e.preventDefault()
        fecharTrechoDigitado()
        apagarAntes(linha.length)
        descartarTrechoDigitado()
        document.execCommand('insertHorizontalRule')
        editor.emitir()
      }
      return
    }
    if (e.shiftKey) return

    const atual = paginaAtual()
    const i = atual.findIndex((s) => s.id === id)
    if (e.key === 'ArrowUp' && i > 0 && cursorNaPrimeiraLinha(el)) {
      e.preventDefault()
      sair(id, 'cima')
    } else if (e.key === 'ArrowDown' && i < atual.length - 1 && cursorNaUltimaLinha(el)) {
      e.preventDefault()
      sair(id, 'baixo')
    } else if (e.key === 'Backspace' && i > 0 && cursorNoInicio(el)) {
      // Antes do texto há um bloco (dois textos seguidos não existem na
      // página): o Backspace entra nele, como no Word depois de uma tabela.
      e.preventDefault()
      sair(id, 'cima')
    }
  }

  /** Ctrl+Z e Ctrl+Y em qualquer seção vão para o histórico da nota. */
  const capturarHistorico = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    const tecla = e.key.toLowerCase()
    if (tecla === 'z' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      desfazer()
    } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
      e.preventDefault()
      e.stopPropagation()
      refazer()
    }
  }

  /** Clique no branco da folha, abaixo do texto: o cursor vai para o fim. */
  const focarFim = (e) => {
    const ultimo = paginaAtual()[paginaAtual().length - 1]
    // Texto no fim: quem cuida é `selecionarDaMargem`, que também arrasta.
    if (!ultimo || ehTexto(ultimo)) return
    e.preventDefault()
    focar(ultimo.id, 'fim')
  }

  /**
   * Clicar e arrastar FORA do texto (a margem da folha, a mesa em volta, o
   * vão embaixo) seleciona o texto, como no Word. O navegador fazia ali uma
   * seleção morta, fora do campo editável: era preciso clicar no texto
   * antes de conseguir arrastar.
   */
  const selecionarDaMargem = (e) => {
    if (somenteLeitura || e.button !== 0 || e.defaultPrevented) return
    if (e.target.closest('[contenteditable], input, textarea, select, button, a, label, [data-bloco]')) return
    // Acima do texto é o cabeçalho (título, etiquetas): ali o clique é dele.
    if (e.clientY < (corpoRef.current?.getBoundingClientRect().top ?? Infinity)) return
    const editores = Object.values(alvosRef.current)
      .map((alvo) => alvo?.el)
      .filter((el) => el?.isContentEditable)
    const inicio = pontoNoTexto(editores, e.clientX, e.clientY)
    if (!inicio) return
    e.preventDefault()
    inicio.editor.focus({ preventScroll: true })
    const selecao = window.getSelection()
    selecao.collapse(inicio.no, inicio.offset)
    // ponytail: sem rolagem automática ao arrastar até a borda da janela.
    const mover = (ev) => {
      const fim = pontoNoTexto(editores, ev.clientX, ev.clientY)
      if (fim) selecao.setBaseAndExtent(inicio.no, inicio.offset, fim.no, fim.offset)
    }
    const soltar = () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
    }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
  }

  // O título (no DocumentEditor) desce para o texto pelo Enter.
  useImperativeHandle(ref, () => ({
    focar: (onde = 'inicio') => {
      const atual = paginaAtual()
      const alvo = onde === 'inicio' ? atual[0] : atual[atual.length - 1]
      if (alvo) focar(alvo.id, onde)
    },
  }))

  // ----------------------------------------------------------------
  // Desenho
  // ----------------------------------------------------------------
  const propsDeBloco = (secao) => ({
    ref: refDe(secao.id),
    section: secao,
    onChange: (patch) => mudarSecao(secao.id, patch),
    onSair: (direcao) => sair(secao.id, direcao),
    onApagarBloco: () => removerBloco(secao.id),
    readOnly: somenteLeitura,
  })

  const blocoAberto = menu?.payload?.id
  const indiceDoMenu = blocoAberto ? pagina.findIndex((s) => s.id === blocoAberto) : -1

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!somenteLeitura && (
      <div className="sticky top-0 z-20 border-b border-ink-150 bg-white/95 backdrop-blur dark:border-ink-800 dark:bg-ink-950/95">
        <BarraDeFuncoes
          estado={{ ...estadoDaBarra, emTexto: !!foco?.texto }}
          podeImagem={!!documentId}
          acoes={{
            desfazer,
            refazer,
            comando,
            cor: aplicarCor,
            fonte: aplicarFonte,
            tamanho: aplicarTamanho,
            inserir,
            guardarSelecao: () => editorAtivo()?.guardarSelecao(),
          }}
        />
      </div>
      )}

      {/* A mesa e a folha: no celular a folha ocupa a tela, sem margem. */}
      <div className="flex-1 bg-ink-50 pb-10 sm:px-6 sm:pt-6 dark:bg-black/25" onMouseDown={selecionarDaMargem}>
        <div className="folha mx-auto w-full max-w-[816px] bg-white px-5 pt-5 sm:rounded-md sm:border sm:border-ink-150 sm:px-12 sm:pt-10 sm:shadow-subtle dark:bg-ink-900 sm:dark:border-ink-800">
          {cabecalho}

          <div ref={corpoRef} className="mt-5 max-sm:pl-6" onKeyDownCapture={capturarHistorico}>
            {pagina.map((secao, indice) => {
              if (ehTexto(secao)) {
                return (
                  <div
                    key={secao.id}
                    onDragOver={(e) => {
                      if (arrastando === null) return
                      e.preventDefault()
                    }}
                    onDrop={(e) => {
                      if (arrastando === null) return
                      e.preventDefault()
                      moverPara(arrastando, indice)
                      setArrastando(null)
                    }}
                  >
                    <RichTextEditor
                      ref={refDe(secao.id)}
                      value={secao.html}
                      onChange={(html) => mudarSecao(secao.id, { html })}
                      documentId={documentId}
                      onError={onError}
                      editavel={!somenteLeitura}
                      dicaSempre={notaVazia}
                      placeholder={
                        notaVazia
                          ? t('Comece a escrever. Digite / para inserir checklist, tabela, código...')
                          : t('Digite / para inserir um bloco')
                      }
                      onKeyDown={(e) => teclaNoTexto(secao.id, e)}
                      onInput={(e) => digitou(secao.id, e)}
                      onFocus={() => {
                        ultimoTextoRef.current = secao.id
                        setFoco({ id: secao.id, texto: true })
                      }}
                      onBlur={() => {
                        if (barraRef.current?.id === secao.id) setBarra(null)
                      }}
                    />
                    {notaVazia && !somenteLeitura && aoComecar}
                  </div>
                )
              }

              return (
                <div
                  key={secao.id}
                  data-bloco=""
                  onFocus={() => setFoco({ id: secao.id, texto: false })}
                  onDragOver={(e) => {
                    if (arrastando === null) return
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    if (arrastando === null) return
                    e.preventDefault()
                    moverPara(arrastando, indice)
                    setArrastando(null)
                  }}
                  // Botão direito (e toque longo) em qualquer ponto do bloco abre
                  // o menu dele: era só pela alça, e ninguém achava como apagar
                  // uma tabela. Parar aqui deixa o menu do Laviel para o texto.
                  onContextMenu={(e) => !somenteLeitura && openMenu(e, { id: secao.id })}
                  className={cn('group/bloco relative', arrastando === indice && 'opacity-40')}
                >
                  {!somenteLeitura && (
                  <AlcaDoBloco
                    rotulo={secao.id}
                    onMenu={(e) => openMenu(e, { id: secao.id })}
                    onArrastar={() => setTimeout(() => setArrastando(indice), 0)}
                    onSoltarArraste={() => setArrastando(null)}
                  />
                  )}
                  {/* A lixeira à vista, na margem direita. O código já tem a dele
                      no cabeçalho; no celular a margem não existe e excluir fica
                      no menu da alça. */}
                  {secao.type !== 'code' && !somenteLeitura && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removerBloco(secao.id)}
                      title={secao.type === 'table' ? t('Excluir tabela') : t('Excluir checklist')}
                      aria-label={secao.type === 'table' ? t('Excluir tabela') : t('Excluir checklist')}
                      className="absolute -right-8 top-1 rounded p-1 text-ink-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-focus-within/bloco:opacity-100 group-hover/bloco:opacity-100 max-sm:hidden dark:hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {secao.type === 'checklist' && <ChecklistSection {...propsDeBloco(secao)} />}
                  {secao.type === 'table' && <TableSection {...propsDeBloco(secao)} />}
                  {secao.type === 'code' && (
                    <div className="my-2">
                      <Suspense
                        fallback={
                          <div className="flex h-24 items-center justify-center rounded-lg border border-ink-200 dark:border-ink-700">
                            <Spinner size={16} />
                          </div>
                        }
                      >
                        <CodeSection
                          {...propsDeBloco(secao)}
                          autoFocus={focoPendente.current?.id === secao.id}
                          onDelete={() => removerBloco(secao.id)}
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className={cn('min-h-[18vh]', !somenteLeitura && 'cursor-text')} onMouseDown={somenteLeitura ? undefined : focarFim} aria-hidden />

          {rodape && <div className="pb-8">{rodape}</div>}
        </div>
      </div>

      {barra && (
        <MenuDeComandos
          ancora={barra.ancora}
          itens={comandos}
          ativo={Math.min(barra.ativo, Math.max(0, comandos.length - 1))}
          onPassar={(i) => setBarra((b) => b && { ...b, ativo: i })}
          onEscolher={(cmd) => executarComando(barra.id, cmd)}
        />
      )}

      <ContextMenu
        open={!!menu}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={closeMenu}
        items={
          menu
            ? [
                {
                  label: t('Mover para cima'),
                  icon: ArrowUp,
                  disabled: indiceDoMenu === -1 || moverBloco(pagina, indiceDoMenu, -1) === pagina,
                  onClick: () => mover(blocoAberto, -1),
                },
                {
                  label: t('Mover para baixo'),
                  icon: ArrowDown,
                  disabled: indiceDoMenu === -1 || moverBloco(pagina, indiceDoMenu, 1) === pagina,
                  onClick: () => mover(blocoAberto, 1),
                },
                { label: t('Duplicar'), icon: Copy, onClick: () => duplicar(blocoAberto) },
                { separator: true },
                { label: t('Excluir bloco'), icon: Trash2, danger: true, onClick: () => removerBloco(blocoAberto) },
              ]
            : []
        }
      />
    </div>
  )
})

export default NoteEditor

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Seleção múltipla de lista: clique, Ctrl+clique e Shift+clique.
 *
 * Extraído de `FolderDetail`, onde o padrão nasceu e funcionava — as outras
 * telas tinham metade dele (guardavam a âncora do Shift e nunca a liam).
 *
 * As chaves são `"tipo:id"`: o id sozinho colide entre pasta e documento, e
 * a lixeira mistura cinco tipos na mesma lista.
 *
 * `keys` precisa chegar NA ORDEM EM QUE A TELA DESENHA os itens — é a ordem
 * do array que define o que está "entre" a âncora e o alvo do Shift.
 */
export function useMultiSelect(keys) {
  const [selected, setSelected] = useState([])
  const anchor = useRef(null)

  // A lista e a seleção mudam a cada render (busca, filtro, refetch).
  // Espelhá-las em refs é o que deixa os callbacks estáveis: sem isso cada
  // tecla digitada na busca re-renderizaria todos os cartões da grade.
  const keysRef = useRef(keys)
  keysRef.current = keys

  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const clear = useCallback(() => {
    setSelected([])
    anchor.current = null
  }, [])

  // Esc é o jeito universal de desfazer uma seleção. Sem ele a única saída
  // é clicar num item — e clicar num item abre alguma coisa.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') clear()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clear])

  const selectRange = useCallback((key) => {
    const list = keysRef.current
    const from = list.indexOf(anchor.current)
    const to = list.indexOf(key)

    // Sem âncora, ou âncora que saiu da lista porque o filtro mudou: o
    // Shift degrada para um clique simples em vez de não fazer nada.
    if (from === -1 || to === -1) {
      setSelected([key])
      anchor.current = key
      return
    }

    const range = list.slice(Math.min(from, to), Math.max(from, to) + 1)
    // União, e não substituição: Ctrl+clique e depois Shift+clique soma o
    // intervalo ao que já estava marcado, como no explorador de arquivos.
    setSelected((previous) => Array.from(new Set([...previous, ...range])))
    anchor.current = key
  }, [])

  /** Deixa só este item marcado. Serve a listas que não navegam. */
  const selectOnly = useCallback((key) => {
    setSelected([key])
    anchor.current = key
  }, [])

  const toggle = useCallback((key) => {
    setSelected((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    )
    anchor.current = key
  }, [])

  /**
   * Clique esquerdo. Use com `onClickCapture` para pegar o evento antes do
   * cartão (ou do `<Link>`) reagir.
   *
   * `onOpen` é a navegação normal do item e só roda no clique simples —
   * Shift e Ctrl barram o evento. Era essa a origem do Shift+clique abrindo
   * a página em vez de marcar o intervalo.
   */
  const handleClick = useCallback(
    (key, event, onOpen) => {
      // Controles dentro do item (favoritar, agendar, excluir) têm ação
      // própria. Como o contêiner escuta na CAPTURA, ele recebe o clique
      // antes do botão — o `stopPropagation` do botão só age na subida e
      // chega tarde. Quem precisa se calar é o contêiner.
      //
      // A comparação com `currentTarget` é o detalhe que faz isso valer nas
      // duas formas: na busca o próprio item É um `<a>`, e sem ela nenhuma
      // linha seria selecionável.
      const controle = event.target?.closest?.('button, a, input, select, textarea')
      if (controle && controle !== event.currentTarget) return

      if (event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        selectRange(key)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        event.stopPropagation()
        toggle(key)
        return
      }

      clear()
      onOpen?.()
    },
    [selectRange, toggle, clear],
  )

  /**
   * Botão direito. Clicar fora da seleção troca a seleção pelo item
   * clicado: um menu que age sobre itens que a pessoa não enxerga como
   * alvo é pior do que menu nenhum.
   *
   * Devolve quantos itens o menu vai afetar, para quem chama escolher
   * entre o menu de um item e o de vários.
   */
  const handleContextMenu = useCallback((key) => {
    const current = selectedRef.current
    if (current.includes(key)) return current.length

    setSelected([key])
    anchor.current = key
    return 1
  }, [])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const isSelected = useCallback((key) => selectedSet.has(key), [selectedSet])

  return { selected, isSelected, clear, selectOnly, handleClick, handleContextMenu, setSelected }
}

/** Quebra `"tipo:id"` de volta nas duas partes. */
export function parseKey(key) {
  const index = key.indexOf(':')
  return { type: key.slice(0, index), id: key.slice(index + 1) }
}

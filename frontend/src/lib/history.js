/**
 * Pilha de desfazer/refazer do quadro.
 *
 * Módulo puro, sem React: a mecânica de uma pilha com cursor é onde os
 * erros moram (o ramo que precisa ser descartado ao editar depois de
 * desfazer, o teto que não pode invalidar o índice), e aqui ela pode ser
 * testada sem montar componente nenhum.
 *
 * O histórico guarda ESTADOS, não operações inversas. Um canvas tem
 * dezenas de tipos de mudança — mover, redimensionar, apagar pedaço de
 * traço, trocar cor — e escrever o inverso de cada uma seria uma segunda
 * implementação do editor, que erra sozinha. Snapshot é memória em troca
 * de não ter essa classe de bug.
 */

/** Teto de passos. Além disto o mais antigo cai. */
export const LIMITE = 40

/** Pilha vazia; `presente` é o estado inicial, que não é desfazível. */
export function criar(presente) {
  return { passados: [], presente, futuros: [] }
}

/**
 * Empilha um novo estado.
 *
 * Devolve a MESMA pilha quando o estado não mudou de verdade: gestos como
 * clicar num nó já selecionado ou soltar um arraste de zero pixel passam
 * por aqui, e cada um deles gastaria um passo de desfazer que não desfaz
 * nada visível — o usuário apertaria Ctrl+Z três vezes sem ver reação.
 */
export function empilhar(pilha, proximo, saoIguais = Object.is) {
  if (saoIguais(pilha.presente, proximo)) return pilha

  const passados = [...pilha.passados, pilha.presente]
  return {
    // O corte é no INÍCIO: o passo mais antigo é o que menos importa, e
    // `slice` com limite negativo já devolve a cauda inteira quando ainda
    // não estourou.
    passados: passados.length > LIMITE ? passados.slice(-LIMITE) : passados,
    presente: proximo,
    // Editar depois de desfazer descarta o que havia à frente: aquele
    // ramo deixou de ser alcançável no instante em que a história mudou.
    // Mantê-lo faria o Ctrl+Y seguinte saltar para um estado que nunca
    // existiu na sequência que o usuário viveu.
    futuros: [],
  }
}

export function podeDesfazer(pilha) {
  return pilha.passados.length > 0
}

export function podeRefazer(pilha) {
  return pilha.futuros.length > 0
}

/** Um passo atrás. Sem passado, devolve a mesma pilha. */
export function desfazer(pilha) {
  if (!podeDesfazer(pilha)) return pilha
  const passados = pilha.passados.slice(0, -1)
  const presente = pilha.passados[pilha.passados.length - 1]
  return { passados, presente, futuros: [pilha.presente, ...pilha.futuros] }
}

/** Um passo à frente. Sem futuro, devolve a mesma pilha. */
export function refazer(pilha) {
  if (!podeRefazer(pilha)) return pilha
  const [presente, ...futuros] = pilha.futuros
  return { passados: [...pilha.passados, pilha.presente], presente, futuros }
}

/**
 * O atalho pedido pelo teclado, ou `null`.
 *
 * Ctrl+Shift+Z e Ctrl+Y são os dois refazer que os dois mundos usam
 * (o primeiro vem do Mac e dos editores de texto, o segundo do Windows);
 * aceitar ambos custa uma linha e evita a tecla que "não faz nada".
 */
export function atalhoDe(event) {
  if (!event.ctrlKey && !event.metaKey) return null
  const tecla = event.key.toLowerCase()
  if (tecla === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (tecla === 'y') return 'redo'
  return null
}

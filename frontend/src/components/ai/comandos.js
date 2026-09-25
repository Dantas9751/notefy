/**
 * Comandos de barra do Laviel.
 *
 * Um comando é só um prompt pronto com nome curto: digitar `/resumir` é
 * mais rápido do que escrever "resuma este material mantendo os fatos".
 *
 * Cada um declara em quais tipos de item faz sentido. Um `/formula` numa
 * nota não tem o que calcular, e um `/flashcards` num diagrama não tem
 * texto de onde tirar pergunta — então a lista muda conforme o que está
 * aberto, e FORA de um item não há comando nenhum: sem material, todos
 * eles ficariam sem objeto.
 */

//: Tipos de documento em que um comando pode aparecer.
const TODOS_OS_TIPOS = ['note', 'spreadsheet', 'diagram', 'canvas']

/**
 * `nome`     — o que se digita, com a barra.
 * `descricao`— explica o comando na lista (é o que ensina o recurso).
 * `arg`      — rótulo do argumento, quando o comando aceita um.
 * `tipos`    — em quais itens aparece.
 * `prompt`   — vira a mensagem enviada ao modelo.
 */
export const COMANDOS = [
  // ------------------------------------------------------------ estudo
  {
    nome: '/resumir',
    descricao: 'Resumo do material, para revisão',
    tipos: TODOS_OS_TIPOS,
    prompt: () =>
      'Resuma este material para revisão: mantenha os fatos, preserve os ' +
      'termos técnicos e organize em tópicos curtos.',
  },
  {
    nome: '/explicar',
    descricao: 'Explica o conteúdo como um professor',
    arg: 'trecho (opcional)',
    tipos: TODOS_OS_TIPOS,
    prompt: (arg) =>
      arg
        ? `Explique "${arg}" deste material como um professor explicaria a ` +
          'alguém vendo o assunto pela primeira vez: comece pela ideia geral, ' +
          'depois detalhe, e use um exemplo concreto.'
        : 'Explique este material como um professor explicaria a alguém vendo ' +
          'o assunto pela primeira vez: comece pela ideia geral, depois ' +
          'detalhe, e use um exemplo concreto.',
  },
  {
    nome: '/simplificar',
    descricao: 'Reexplica em linguagem simples',
    tipos: TODOS_OS_TIPOS,
    prompt: () =>
      'Explique este material em linguagem simples, sem jargão, como se fosse ' +
      'para alguém de fora da área. Onde um termo técnico for inevitável, ' +
      'defina-o na hora.',
  },
  {
    nome: '/pontos-chave',
    descricao: 'Lista o que é essencial',
    tipos: TODOS_OS_TIPOS,
    prompt: () =>
      'Liste os pontos-chave deste material em tópicos curtos, do mais ' +
      'importante para o menos. Diga em uma linha por que cada um importa.',
  },
  {
    nome: '/perguntas',
    descricao: 'Perguntas de revisão sobre o material',
    arg: 'quantidade',
    tipos: TODOS_OS_TIPOS,
    prompt: (arg) => {
      const n = Number.parseInt(arg, 10)
      const quantas = Number.isFinite(n) && n > 0 ? n : 5
      return (
        `Crie ${quantas} perguntas de revisão sobre este material, da mais ` +
        'simples à mais difícil. Depois das perguntas, liste as respostas ' +
        'separadamente, para eu poder tentar antes de conferir.'
      )
    },
  },
  {
    nome: '/flashcards',
    descricao: 'Cartões pergunta/resposta',
    tipos: ['note', 'spreadsheet', 'diagram', 'canvas'],
    prompt: () =>
      'Transforme este material em flashcards no formato "P: ... / R: ...". ' +
      'Uma ideia por cartão, pergunta direta e resposta curta.',
  },
  {
    nome: '/plano',
    descricao: 'Plano de estudo em etapas',
    arg: 'prazo',
    tipos: TODOS_OS_TIPOS,
    prompt: (arg) =>
      `Monte um plano de estudo${arg ? ` para ${arg}` : ''} a partir deste ` +
      'material: divida em etapas na ordem em que devem ser estudadas, com o ' +
      'que fazer em cada uma e como saber que ela foi cumprida.',
  },
  {
    nome: '/duvidas',
    descricao: 'Aponta o que está confuso ou faltando',
    tipos: TODOS_OS_TIPOS,
    prompt: () =>
      'Leia este material como um professor revisando o caderno de um aluno: ' +
      'aponte o que está confuso, incompleto ou que pareça errado, e diga o ' +
      'que faltou em cada ponto.',
  },
  {
    nome: '/traduzir',
    descricao: 'Traduz o material',
    arg: 'idioma',
    tipos: TODOS_OS_TIPOS,
    prompt: (arg) =>
      `Traduza este material para ${arg || 'inglês'}. Preserve a formatação e ` +
      'mantenha os termos técnicos reconhecíveis.',
  },

  // -------------------------------------------------------------- nota
  {
    nome: '/revisar',
    descricao: 'Revisa a escrita e sugere melhorias',
    tipos: ['note'],
    prompt: () =>
      'Revise a escrita desta nota: aponte erros, frases confusas e trechos ' +
      'que poderiam ficar mais claros. Mostre a sugestão ao lado do original, ' +
      'sem reescrever tudo por conta própria.',
  },
  {
    nome: '/estruturar',
    descricao: 'Sugere títulos e organização',
    tipos: ['note'],
    prompt: () =>
      'Sugira uma estrutura para esta nota: quais seções ela deveria ter, em ' +
      'que ordem, e o que entra em cada uma. Se algo estiver fora de lugar, ' +
      'diga para onde deveria ir.',
  },
  {
    nome: '/expandir',
    descricao: 'Desenvolve um ponto em profundidade',
    arg: 'assunto',
    tipos: ['note'],
    prompt: (arg) =>
      arg
        ? `Desenvolva "${arg}" com mais profundidade, partindo do que já está ` +
          'escrito nesta nota.'
        : 'Aponte quais pontos desta nota merecem mais profundidade e ' +
          'desenvolva o mais importante deles.',
  },

  // ---------------------------------------------------------- planilha
  {
    nome: '/formula',
    descricao: 'Escreve uma fórmula e explica',
    arg: 'o que calcular',
    tipos: ['spreadsheet'],
    prompt: (arg) =>
      `Escreva a fórmula de planilha (estilo A1) para: ${arg || 'o que descrevo a seguir'}. ` +
      'Use as colunas existentes, mostre a fórmula pronta e explique em uma ' +
      'linha o que ela faz.',
  },
  {
    nome: '/analisar',
    descricao: 'Lê os dados e aponta padrões',
    tipos: ['spreadsheet'],
    prompt: () =>
      'Analise os dados desta planilha: aponte padrões, valores fora da curva ' +
      'e o que os números sugerem. Seja concreto e cite as linhas ou colunas ' +
      'que sustentam cada observação.',
  },
  {
    nome: '/colunas',
    descricao: 'Sugere colunas que faltam',
    tipos: ['spreadsheet'],
    prompt: () =>
      'Olhando esta planilha, que colunas fariam falta para o material ficar ' +
      'mais completo ou mais fácil de comparar? Explique para que serve cada ' +
      'uma que sugerir.',
  },

  // -------------------------------------------------- diagrama e canvas
  {
    nome: '/percorrer',
    descricao: 'Explica o desenho passo a passo',
    tipos: ['diagram', 'canvas'],
    prompt: () =>
      'Percorra este desenho passo a passo, seguindo as conexões, e explique ' +
      'o que acontece em cada etapa como se estivesse apontando para o quadro.',
  },
  {
    nome: '/validar',
    descricao: 'Procura falhas na estrutura',
    tipos: ['diagram', 'canvas'],
    prompt: () =>
      'Verifique este desenho: há elementos soltos, conexões faltando, ciclos ' +
      'estranhos ou passos sem saída? Liste o que encontrar e como corrigir.',
  },
  {
    nome: '/completar',
    descricao: 'Sugere o que falta no desenho',
    tipos: ['diagram', 'canvas'],
    prompt: () =>
      'Que elementos ou conexões faltam neste desenho para o assunto ficar ' +
      'completo? Explique onde cada um entraria e por quê.',
  },
  {
    nome: '/agrupar',
    descricao: 'Organiza as ideias por afinidade',
    tipos: ['canvas'],
    prompt: () =>
      'Agrupe as ideias deste quadro por afinidade: proponha os grupos, diga o ' +
      'que entra em cada um e sugira um nome curto para cada grupo.',
  },
]

/**
 * Comandos válidos para o item aberto.
 *
 * Sem item não há comando: `/resumir` sem material seria um comando que
 * só pode falhar.
 */
export function comandosPara(kind) {
  if (!kind) return []
  return COMANDOS.filter((c) => c.tipos.includes(kind))
}

/** Divide "/traduzir en" em nome e argumento. */
function separar(texto) {
  const limpo = texto.trimStart()
  const espaco = limpo.search(/\s/)
  return espaco === -1
    ? { nome: limpo, arg: '', temEspaco: false }
    : { nome: limpo.slice(0, espaco), arg: limpo.slice(espaco + 1).trim(), temEspaco: true }
}

/**
 * Sugestões para o que está sendo digitado.
 *
 * Só enquanto o usuário escreve o NOME do comando: assim que ele digita o
 * espaço e parte para o argumento, a lista sai da frente.
 */
export function sugestoesPara(texto, kind) {
  if (!texto.startsWith('/')) return []
  const { nome, temEspaco } = separar(texto)
  if (temEspaco) return []
  const disponiveis = comandosPara(kind)
  const busca = nome.toLowerCase()
  return disponiveis.filter((c) => c.nome.toLowerCase().startsWith(busca))
}

/** O comando exato que o texto invoca, se houver. */
export function comandoDe(texto, kind) {
  if (!texto.trim().startsWith('/')) return null
  const { nome } = separar(texto.trim())
  return comandosPara(kind).find((c) => c.nome.toLowerCase() === nome.toLowerCase()) ?? null
}

/**
 * Se o texto é um comando conhecido, mantém como está (para aparecer no chat).
 * Texto que não é comando passa intacto.
 */
export function expandirComando(texto, kind) {
  const comando = comandoDe(texto, kind)
  if (!comando) return texto
  return texto // mantém o /comando visível no histórico
}

/**
 * A instrução real que o modelo recebe para um comando.
 *
 * Fica separada do texto exibido: no chat aparece `/resumir` (curto, é o
 * que o usuário digitou), mas o modelo recebe o pedido por extenso. Sem
 * isso, ou o histórico ficava poluído com parágrafos de instrução, ou o
 * modelo recebia só "/resumir" e tinha que adivinhar.
 */
export function instrucaoDoComando(texto, kind) {
  const comando = comandoDe(texto, kind)
  if (!comando) return null
  const { arg } = separar(texto.trim())
  return comando.prompt(arg)
}

/**
 * Pedidos em inglês para o chat do Laviel.
 *
 * É o espelho de `detectarAcao` (em `acoes.js`) para quem usa o app em
 * inglês: "make a mind map about X" vira a mesma ação que "faça um mapa
 * mental sobre X". A estrutura é a mesma, e por isso os testes também.
 *
 * O texto que vai para a IA (`input`) já sai em inglês, sem passar pelo
 * dicionário: este módulo só é usado quando o app está em inglês.
 */

const normalizar = (texto) => texto.toLowerCase().normalize('NFC').trim()

const VERBOS =
  'creat(?:e|ing)|mak(?:e|ing)|generat(?:e|ing)|build|draw|writ(?:e|ing)|' +
  'add|insert|put|fill|populate|complete|summariz(?:e|ing)|summaris(?:e|ing)'

// Com `\b` na frente: "regenerate" não pode casar como "generate".
const VERBO = `\\b(?:${VERBOS})`

const SEM_TOPICO = 'the content of the document'

// "a", "an", "the", "some" e o "me" de "make me a ..."
const ARTIGO = '(?:me\\s+)?(?:a\\s+|an\\s+|the\\s+|some\\s+)?'

/** "verbo + objeto [+ about/of/for/with + assunto]". */
function padrao(expr) {
  const base = `${VERBO}\\s+${ARTIGO}(?:${expr})\\b`
  const comSep = new RegExp(`${base}\\s+(?:about|on|of|for|with)\\s+(.+)`)
  const semSep = new RegExp(`${base}(?:\\s+(.+))?`)
  return (texto) => texto.match(comSep) || texto.match(semSep)
}

const ALVO_NOTA = '(?:my\\s+|the\\s+|this\\s+)?(?:note|text|notebook)'

export function detectarAcaoEn(textoBruto, kind) {
  const t = normalizar(textoBruto)

  if (kind === 'note') {
    // "create a NEW NOTE about X" pede um item novo, não texto nesta.
    if (/\b(?:creat|generat|mak)\w*\s+(?:me\s+)?(?:a\s+|an\s+)?(?:new\s+)?note\b/.test(t)) {
      // cai no bloco genérico de criação lá embaixo
    } else {
      // "about X" sempre vence: o assunto é o que vem depois dele.
      const sobre = t.match(/\babout\s+(.+)$/)
      const falaDeTexto = /text|summary|section|topic|write|add|insert|put/.test(t)
      if (new RegExp(`${VERBO}`).test(t) && sobre && falaDeTexto) {
        return { task: 'nota.texto', input: sobre[1] }
      }

      // "add X to the note", sem "about": o assunto vem antes do alvo.
      const alvoNota = t.match(
        new RegExp(`${VERBO}\\s+(.+?)\\s+(?:to|in|into|on)\\s+${ALVO_NOTA}`),
      )
      if (alvoNota) return { task: 'nota.texto', input: alvoNota[1] }

      // Ordem inversa: "write in the note a summary of X".
      const alvoAntes = t.match(
        new RegExp(`${VERBO}\\s+(?:in|into|on)\\s+${ALVO_NOTA}\\s+(.+)`),
      )
      if (alvoAntes) {
        const topico = alvoAntes[1].match(/\babout\s+(.+)$/) ?? alvoAntes[1].match(/\bof\s+(.+)$/)
        return { task: 'nota.texto', input: topico ? topico[1] : alvoAntes[1] }
      }
    }

    const assunto = t.match(/\babout\s+(.+)$/)?.[1]
    if (/^continue\b/.test(t)) return { task: 'nota.continuar', input: assunto }
    if (/^(summarize|summarise)\b/.test(t)) return { task: 'nota.resumir' }
    if (/^(fix|correct|proofread)\b/.test(t)) return { task: 'nota.corrigir' }
  }

  if (kind === 'canvas') {
    const mapa = padrao('mind\\s*map')(t)
    if (mapa) return { task: 'canvas.gerar', input: `Mind map about ${mapa[1] || SEM_TOPICO}` }

    const quadro = padrao('whiteboard|board|canvas')(t)
    if (quadro) return { task: 'canvas.gerar', input: `Whiteboard about ${quadro[1] || SEM_TOPICO}` }

    const stickies = padrao('stickies|sticky\\s+notes?|cards')(t)
    if (stickies) return { task: 'canvas.gerar', input: `Sticky notes about ${stickies[1] || SEM_TOPICO}` }

    if (/regenerate|recreate|redo|start over/.test(t) && /canvas|board|drawing/.test(t)) {
      return { task: 'canvas.gerar', apply: 'replace' }
    }
  }

  if (kind === 'diagram') {
    const der = padrao('erd|er\\s+diagram|entity[\\s-]+relationship\\s+diagram|entity[\\s-]+relationship\\s+model')(t)
    if (der) return { task: 'diagrama.gerar', input: `ER diagram of ${der[1] || SEM_TOPICO}` }

    const fluxo = padrao('flow\\s*chart|flow')(t)
    if (fluxo) return { task: 'diagrama.gerar', input: `Flowchart of ${fluxo[1] || SEM_TOPICO}` }

    const uml = padrao(
      'class\\s+diagram|sequence\\s+diagram|use[\\s-]+case\\s+diagram|activity\\s+diagram|state\\s+diagram|uml(?:\\s+diagram)?',
    )(t)
    if (uml) return { task: 'diagrama.gerar', input: `UML diagram ${uml[1] ? `- ${uml[1]}` : ''}`.trim() }

    const classes = padrao('classes|class')(t)
    if (classes) return { task: 'diagrama.gerar', input: `Class diagram ${classes[1] ? `about ${classes[1]}` : ''}`.trim() }

    const diagrama = padrao('diagram')(t)
    if (diagrama) return { task: 'diagrama.gerar', input: `Diagram about ${diagrama[1] || SEM_TOPICO}` }

    if (/regenerate|recreate|redo|start over/.test(t) && /diagram|erd|flow/.test(t)) {
      return { task: 'diagrama.gerar', apply: 'replace' }
    }
  }

  if (kind === 'spreadsheet') {
    // "put the times table of 10 in the spreadsheet": o assunto vem ANTES do alvo.
    const naPlanilha = t.match(
      new RegExp(`${VERBO}\\s+(?:the\\s+|a\\s+|an\\s+|some\\s+)?(.+?)\\s+(?:in|into|on|to)\\s+(?:the\\s+|my\\s+|this\\s+)?(?:spreadsheet|sheet)`),
    )
    if (naPlanilha) return { task: 'planilha.preencher', input: naPlanilha[1] }

    const preenchaCom = t.match(/(?:fill|populate)\s+(?:in\s+)?(?:the\s+|my\s+|this\s+)?(?:spreadsheet|sheet)\s+with\s+(.+)/)
    if (preenchaCom) return { task: 'planilha.preencher', input: preenchaCom[1] }

    if (/fill|populate|complete/.test(t) && /spreadsheet|sheet/.test(t)) {
      return { task: 'planilha.preencher' }
    }

    const criarAqui = padrao('spreadsheet|sheet')(t)
    if (criarAqui) {
      return { task: 'planilha.preencher', input: criarAqui[1] || 'sample data' }
    }
  }

  // Qualquer tipo: criar OUTRO item.
  const novaNota = padrao('new\\s+note|new\\s+spreadsheet|new\\s+sheet')(t)
  if (novaNota) {
    return {
      task: /sheet/.test(novaNota[0]) ? 'criar.planilha' : 'criar.nota',
      input: novaNota[1] || '',
    }
  }

  const gPlanilha = padrao('spreadsheet|sheet')(t)
  if (gPlanilha && kind !== 'spreadsheet') {
    return { task: 'criar.planilha', input: gPlanilha[1] || '' }
  }
  const gNota = padrao('note')(t)
  if (gNota) {
    return { task: 'criar.nota', input: gNota[1] || '' }
  }

  return null
}

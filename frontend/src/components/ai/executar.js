/**
 * Execução de uma tarefa de IA SOBRE um documento já existente.
 *
 * Existiam duas portas para a mesma coisa, com contratos opostos: o chat
 * buscava o documento, mesclava e gravava (somava); o menu do editor
 * mandava `apply: replace` e o backend gravava por cima (apagava o
 * desenho). Quem clicava em "Gerar a partir do conteúdo" perdia o
 * trabalho — e Ctrl+Z não traz de volta o que o servidor sobrescreveu.
 *
 * Agora as duas portas passam por aqui: gera em modo PREVIEW, mescla no
 * cliente e grava. Substituir é uma escolha explícita, nunca o padrão.
 */
import api from '@/lib/api'
import { runIA } from '@/lib/ai'
import { limparMarkdown } from '@/lib/utils'
import { mergeDocumento, mergeNotaTexto } from './merge'

/**
 * @param documentId  documento alvo (precisa estar salvo)
 * @param kind        note | spreadsheet | diagram | canvas
 * @param task        tarefa do catálogo (`canvas.gerar`, `nota.texto`...)
 * @param input       assunto/descrição livre
 * @param substituir  true = regenerar do zero (só com pedido explícito)
 * @param signal      AbortSignal do botão "Parar"
 * @returns { data } quando gravou estrutura, { text } quando é texto
 */
export async function executarNoDocumento({
  documentId,
  kind,
  task,
  input,
  substituir = false,
  signal,
}) {
  const { data: atual } = await api.get(`/documents/${documentId}/`, { signal })

  const resultado = await runIA({ task, documentId, input, signal })

  // Tarefas de texto (resumir, traduzir, continuar) não gravam sozinhas:
  // quem chamou decide onde encaixar — substituir a seleção do editor não
  // é a mesma coisa que anexar uma seção.
  if (resultado.text !== undefined) {
    return { text: limparMarkdown(resultado.text), atual }
  }

  const merged = mergeDocumento(kind ?? atual.kind, atual.data, resultado.data, {
    substituir,
  })
  await api.patch(`/documents/${documentId}/`, { data: merged }, { signal })
  avisarEditor(documentId)
  return { data: merged }
}

/** Acrescenta texto à nota como seção nova, sem tocar no que já existe. */
export async function anexarTextoNaNota({ documentId, texto, signal, atual }) {
  const dados =
    atual ?? (await api.get(`/documents/${documentId}/`, { signal })).data
  const merged = mergeNotaTexto(dados.data ?? dados, limparMarkdown(texto))
  await api.patch(`/documents/${documentId}/`, { data: merged }, { signal })
  avisarEditor(documentId)
  return merged
}

/**
 * Avisa o editor aberto que o documento mudou por fora.
 *
 * `origem` evita o eco: o próprio editor ignora o evento que ele causou.
 */
function avisarEditor(documentId) {
  window.dispatchEvent(
    new CustomEvent(`notefy:saved:${documentId}`, { detail: { origem: 'chat' } }),
  )
}

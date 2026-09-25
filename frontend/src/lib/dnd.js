/**
 * Arrastar e soltar entre telas.
 *
 * O payload viaja pelo `dataTransfer` num MIME próprio, e não em
 * `text/plain`: assim soltar um item numa pasta não é confundido com
 * soltar texto, e arrastar de fora do app (um arquivo do sistema) segue
 * caindo no fluxo de upload sem colisão.
 */
export const DRAG_MIME = 'application/x-notefy-item'

// O navegador bloqueia `getData()` durante `dragenter`/`dragover` — só a
// lista de `types` é visível antes do drop. O payload definido no
// `dragstart` fica então guardado numa variável de módulo: o navegador só
// deixa um arraste ativo por vez, e o `dragend` da origem a limpa. (Um
// WeakMap por `dataTransfer` falhava em alguns navegadores — a identidade
// do objeto não sobrevive aos eventos do arraste.)
let payloadDaSessao = null

export function setDragPayload(event, payload) {
  payloadDaSessao = payload
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  // Alguns navegadores exigem `text/plain` para iniciar o arraste.
  event.dataTransfer.setData('text/plain', payload.title ?? '')
  event.dataTransfer.effectAllowed = 'move'
}

/** O arraste acabou (drop em qualquer lugar): o cache da sessão expira. */
export function limparDragPayload() {
  payloadDaSessao = null
}

export function readDragPayload(event) {
  const raw = event.dataTransfer.getData(DRAG_MIME)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      /* JSON quebrado: cai no cache da sessão */
    }
  }
  return payloadDaSessao
}

/** true quando o arraste carrega um item do app (e não arquivos do SO). */
export function hasItemPayload(event) {
  return Array.from(event.dataTransfer.types ?? []).includes(DRAG_MIME)
}

/** true quando o arraste traz arquivos do sistema operacional. */
export function hasFilePayload(event) {
  return Array.from(event.dataTransfer.types ?? []).includes('Files')
}

/**
 * Decide se um destino aceita o que está sendo arrastado.
 *
 * Uma pasta não pode ser solta dentro de si mesma nem de um descendente —
 * a API rejeitaria com erro de ciclo, e recusar antes evita o piscar de
 * um destino que nunca ia funcionar.
 */
export function canDrop(payload, target) {
  if (!payload || !target) return false

  if (payload.type === 'document') {
    return target.type === 'folder' && payload.folderId !== target.id
  }

  if (payload.type === 'folder') {
    if (target.type === 'category') {
      // Já é raiz desta categoria: o gesto não mudaria nada.
      return !(payload.isRoot && payload.categoryId === target.id)
    }
    if (target.type === 'folder') {
      if (payload.id === target.id) return false
      if (payload.parentId === target.id) return false
      // `path` é o caminho materializado; se o destino começa com o
      // caminho da pasta arrastada, ele é descendente dela.
      return !(target.path && payload.path && target.path.startsWith(payload.path))
    }
  }

  return false
}

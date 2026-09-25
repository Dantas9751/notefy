import { useCallback, useState } from 'react'
import api, { extractError } from '@/lib/api'
import { Button, Modal, Spinner } from '@/components/ui'

/**
 * Aviso de arquivo duplicado no upload, no estilo do OneDrive.
 *
 * Quando um arquivo importado tem o mesmo nome (e extensão) de um que já
 * existe na pasta de destino, o upload não segue direto: o usuário decide
 * MANTER (guarda o existente e sobe uma CÓPIA do novo, renomeada para
 * `nome(1).ext` — o backend não aceita dois nomes iguais na mesma pasta)
 * ou SUBSTITUIR (sobrescreve o conteúdo do mesmo item, mantendo id,
 * favorito e anexos). O X da notificação é o "ignorar": pula os arquivos
 * com conflito e sobe só os sem conflito.
 *
 * Uso:
 *   const { iniciar, Modal } = useUploadComConflitos({ onEnviado, onErro })
 *   ...
 *   iniciar(files, folderId)             // ou `iniciar(files, folderId, data.documents)`
 *   ...
 *   {Modal}
 *
 * `Modal` é um ELEMENTO (ou `null`) — renderize como `{Modal}`, não como
 * `<Modal />`: com `null` na mão, o JSX de componente derruba o app.
 *
 * `iniciar` recebe a lista de documentos já existentes como terceiro
 * argumento quando o chamador já os tem em mãos (a tela da pasta); caso
 * contrário busca `/folders/{id}/contents/` sozinho.
 */
export function useUploadComConflitos({ onEnviado, onErro } = {}) {
  const [estado, setEstado] = useState(null)
  const [erro, setErro] = useState(null)

  /** POST em lote dos arquivos que não têm conflito. */
  const enviarNormais = async (files, folderId) => {
    const body = new FormData()
    files.forEach((file) => body.append('files', file))
    body.append('folder', folderId)
    await api.post('/documents/upload/', body)
  }

  /**
   * Descobre quais arquivos colidem com a pasta de destino. Nomes
   * repetidos DENTRO do mesmo lote também contam (não há docId — só dá
   * para manter, e o segundo arquivo é descartado).
   */
  const encontrarConflitos = (files, existentes) => {
    const nomesExistentes = new Set(
      (existentes ?? [])
        .map((doc) => doc.original_name)
        .filter(Boolean)
        .map((nome) => nome.toLowerCase()),
    )
    const vistos = new Set()
    const conflitos = []
    for (const file of files) {
      const chave = file.name.toLowerCase()
      const existente = (existentes ?? []).find(
        (doc) => doc.original_name?.toLowerCase() === chave,
      )
      if (vistos.has(chave) || nomesExistentes.has(chave)) {
        conflitos.push({ nome: file.name, docId: existente?.id ?? null })
      }
      vistos.add(chave)
    }
    return conflitos
  }

  const iniciar = useCallback(
    async (files, folderId, existentes) => {
      if (!files?.length || !folderId) return
      setErro(null)

      let lista = existentes
      if (!lista) {
        try {
          const { data } = await api.get(`/folders/${folderId}/contents/`)
          lista = data?.documents ?? []
        } catch (err) {
          onErro?.(extractError(err))
          return
        }
      }

      const conflitos = encontrarConflitos(files, lista)
      if (!conflitos.length) {
        try {
          await enviarNormais(files, folderId)
          onEnviado?.(folderId)
        } catch (err) {
          onErro?.(extractError(err))
        }
        return
      }

      // Devolve os File originais para o envio: `conflitos` só guarda
      // nome e docId, e o FormData precisa do objeto do arquivo.
      // `existentes` é a lista da pasta — a cópia de "manter" precisa
      // saber quais nomes já estão ocupados para se batizar sem colidir.
      const porNome = new Map(files.map((file) => [file.name, file]))
      setEstado({
        files,
        porNome,
        folderId,
        existentes: lista,
        conflitos,
        decisao: Object.fromEntries(conflitos.map((c) => [c.nome, 'manter'])),
        enviando: false,
      })
    },
    [onEnviado, onErro],
  )

  /**
   * Próximo nome livre no estilo do Windows: `nome(1).ext`, `nome(2).ext`…
   * O backend não aceita dois arquivos com o mesmo nome na mesma pasta,
   * então a cópia de "manter" precisa nascer com nome próprio.
   */
  const proximoNomeLivre = (nome, ocupados) => {
    const chave = nome.toLowerCase()
    if (!ocupados.has(chave)) return nome
    const ponto = nome.lastIndexOf('.')
    const base = ponto > 0 ? nome.slice(0, ponto) : nome
    const ext = ponto > 0 ? nome.slice(ponto) : ''
    let i = 1
    while (ocupados.has(`${base}(${i})${ext}`.toLowerCase())) i++
    return `${base}(${i})${ext}`
  }

  const resolver = async (decisao) => {
    const atual = estado
    if (!atual || atual.enviando) return
    setEstado({ ...atual, decisao, enviando: true })
    try {
      const substitutos = atual.conflitos.filter((c) => decisao[c.nome] === 'substituir')
      const nomesSubstituidos = new Set(substitutos.map((c) => c.nome))

      // "Manter" sobe o arquivo de novo, renomeado — o existente fica
      // intacto e os dois convivem, como no OneDrive.
      const manter = atual.conflitos.filter((c) => decisao[c.nome] === 'manter')
      const nomesManter = new Set(manter.map((c) => c.nome))
      const ocupados = new Set(
        (atual.existentes ?? [])
          .map((doc) => doc.original_name?.toLowerCase())
          .filter(Boolean),
      )
      const copias = manter.map((conflito) => {
        const arquivo = atual.porNome.get(conflito.nome)
        const nomeNovo = proximoNomeLivre(conflito.nome, ocupados)
        ocupados.add(nomeNovo.toLowerCase())
        return new File([arquivo], nomeNovo, { type: arquivo.type })
      })

      for (const conflito of substitutos) {
        const fd = new FormData()
        fd.append('file', atual.porNome.get(conflito.nome))
        await api.patch(`/documents/${conflito.docId}/`, fd)
      }

      const normais = atual.files.filter(
        (f) => !nomesSubstituidos.has(f.name) && !nomesManter.has(f.name),
      )
      const lote = [...normais, ...copias]
      if (lote.length) await enviarNormais(lote, atual.folderId)

      onEnviado?.(atual.folderId)
      setEstado(null)
    } catch (err) {
      setEstado({ ...atual, enviando: false })
      setErro(extractError(err))
    }
  }

    /**
   * O X da notificação: ignora os conflitos e sobe só o resto. É o
   * "manter o existente e pular" do OneDrive — diferente do botão
   * Manter por arquivo, que sobe a cópia com (1).
   */
  const ignorar = async () => {
    if (!estado || estado.enviando) return
    const atual = estado
    setEstado({ ...atual, enviando: true })
    try {
      const conflitantes = new Set(atual.conflitos.map((c) => c.nome))
      const normais = atual.files.filter((f) => !conflitantes.has(f.name))
      if (normais.length) await enviarNormais(normais, atual.folderId)
      onEnviado?.(atual.folderId)
      setEstado(null)
    } catch (err) {
      setEstado({ ...atual, enviando: false })
      setErro(extractError(err))
    }
  }

  const ModalDeConflito = estado ? (
    <Modal
      open
      onClose={ignorar}
      title="Arquivos duplicados"
      description="Já existe um arquivo com este nome nesta pasta. Manter cria uma cópia com um número (ex: nome(1).pdf); Substituir troca o conteúdo no mesmo item."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={ignorar} disabled={estado.enviando}>
            Ignorar e continuar
          </Button>
          <Button
            onClick={() => resolver(estado.decisao)}
            disabled={estado.enviando}
          >
            {estado.enviando ? <Spinner size={14} /> : 'Continuar'}
          </Button>
        </>
      }
    >
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {estado.conflitos.map((conflito) => (
          <div
            key={conflito.nome}
            className="flex items-center justify-between gap-3 rounded-md border border-ink-100 px-2.5 py-1.5 dark:border-ink-800"
          >
            <span className="min-w-0 truncate text-sm text-ink-700 dark:text-ink-200">
              {conflito.nome}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                onClick={() =>
                  setEstado({
                    ...estado,
                    decisao: { ...estado.decisao, [conflito.nome]: 'manter' },
                  })
                }
                disabled={estado.enviando}
                className={`rounded px-2 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                  estado.decisao[conflito.nome] === 'manter'
                    ? 'bg-accent-600 text-white'
                    : 'text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
                }`}
              >
                Manter
              </button>
              <button
                onClick={() =>
                  setEstado({
                    ...estado,
                    decisao: { ...estado.decisao, [conflito.nome]: 'substituir' },
                  })
                }
                disabled={estado.enviando || !conflito.docId}
                title={
                  conflito.docId
                    ? 'Sobrescreve o arquivo existente'
                    : 'Nome repetido dentro do mesmo envio'
                }
                className={`rounded px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                  estado.decisao[conflito.nome] === 'substituir'
                    ? 'bg-accent-600 text-white'
                    : 'text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
                }`}
              >
                Substituir
              </button>
            </span>
          </div>
        ))}
      </div>
      {erro && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {erro}
        </p>
      )}
    </Modal>
  ) : null

  return { iniciar, Modal: ModalDeConflito }
}

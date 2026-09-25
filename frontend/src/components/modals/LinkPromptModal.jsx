import { useEffect, useRef, useState } from 'react'
import { Button, Field, Input, Modal } from '@/components/ui'

/**
 * Pede o endereço de um link.
 *
 * Existe porque o `window.prompt` do navegador não combina com o resto do
 * aplicativo: dentro do Tauri ele aparece como uma caixa cinza do sistema,
 * com o título do executável, fora do tema e sem os cantos e as cores das
 * outras janelas do Notefy.
 *
 * O endereço vem sem esquema com frequência ("notefy.com"), e um `href`
 * assim vira caminho relativo — o clique tentaria abrir
 * `/notes/<id>/notefy.com`. Por isso o https:// entra sozinho quando falta.
 */
export default function LinkPromptModal({ open, valorInicial = '', onClose, onConfirm }) {
  const [url, setUrl] = useState(valorInicial)
  const inputRef = useRef(null)

  // Reabrir precisa começar limpo, e o foco tem que estar no campo: quem
  // clicou em "link" quer digitar, não caçar o cursor.
  useEffect(() => {
    if (!open) return
    setUrl(valorInicial)
    // O modal só monta o painel neste mesmo ciclo; o timeout deixa o
    // elemento existir antes de tentar focá-lo.
    const id = setTimeout(() => inputRef.current?.select(), 0)
    return () => clearTimeout(id)
  }, [open, valorInicial])

  const confirmar = () => {
    const limpo = url.trim()
    if (!limpo) return

    const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(limpo) ? limpo : `https://${limpo}`
    onConfirm(comEsquema)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Inserir link"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!url.trim()}>
            Inserir
          </Button>
        </>
      }
    >
      <Field label="Endereço">
        <Input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            // Enter confirma sem obrigar a pegar o mouse. Sem o stop, a
            // tecla sobe até o editor de texto e insere uma quebra de linha
            // na nota atrás do modal.
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              confirmar()
            }
          }}
          placeholder="https://exemplo.com"
          autoFocus
        />
      </Field>
    </Modal>
  )
}

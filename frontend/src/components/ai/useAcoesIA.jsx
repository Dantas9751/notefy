import { useCallback, useState } from 'react'
import { Languages, Sparkles } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { executarNoDocumento } from './executar'
import { Modal, Button } from '@/components/ui'

/**
 * As ações de IA de dentro de um editor.
 *
 * Devolve o item "IA" pronto para entrar em qualquer menu de contexto
 * (com submenu das mecânicas daquele tipo) e o estado de execução, que a
 * página usa para mostrar "gerando..." e o erro.
 *
 * As tarefas de texto NÃO gravam sozinhas: devolvem o resultado para o
 * editor decidir onde encaixar (substituir a seleção, anexar ao fim). As
 * de estrutura (diagrama, canvas, planilha) gravam via `apply: replace`,
 * porque reescrevem o documento inteiro.
 */
export function useAcoesIA({ kind, documentId, onTexto, onDocumento }) {
  const { user } = useAuth()
  const [rodando, setRodando] = useState(null)
  const [erro, setErro] = useState(null)
  // Modal de "descreva o que gerar": guarda a tarefa pendente até o
  // usuário confirmar. Sem `window.prompt` — ele trava o app e some em
  // alguns navegadores.
  const [pedido, setPedido] = useState(null)
  const [textoPedido, setTextoPedido] = useState('')

  const configurada = !!user?.preferences?.ai_provider

  const executar = useCallback(
    async (task, { input, substituir = false, rotulo } = {}) => {
      if (!documentId) {
        setErro('Salve o item antes de usar a IA.')
        return
      }
      setRodando(rotulo || 'IA')
      setErro(null)
      try {
        // Mesmo caminho do chat: gera, MESCLA e grava. "Gerar a partir do
        // conteúdo" acrescenta ao desenho existente em vez de apagá-lo.
        const resultado = await executarNoDocumento({
          documentId,
          kind,
          task,
          input,
          substituir,
        })
        // O texto vai direto para dentro da nota: markdown solto e o
        // rascunho `<think>` do modelo já saíram no helper.
        if (resultado.text !== undefined) onTexto?.(resultado.text, task)
        else onDocumento?.(resultado.data, task)
      } catch (e) {
        setErro(e.message)
      } finally {
        setRodando(null)
      }
    },
    [documentId, kind, onTexto, onDocumento],
  )

  const pedirDescricao = (task, { rotulo, placeholder }) => {
    setPedido({ task, rotulo, placeholder })
    setTextoPedido('')
  }

  const fecharPedido = useCallback(() => setPedido(null), [])

  const confirmarPedido = useCallback(() => {
    if (!pedido || !textoPedido.trim()) return
    const { task, rotulo } = pedido
    setPedido(null)
    executar(task, { input: textoPedido.trim(), rotulo })
  }, [pedido, textoPedido, executar])

  /** Mecânicas de cada tipo — o que faz sentido naquele editor. */
  const submenu = (() => {
    if (kind === 'note') {
      // "Traduzir para" abre um submenu de línguas em vez de chutar para
      // o inglês: o usuário escolhe o destino, não o app.
      const idiomas = [
        'inglês',
        'espanhol',
        'francês',
        'alemão',
        'italiano',
        'japonês',
        'chinês',
        'russo',
      ]
      return [
        { label: 'Resumir', onClick: () => executar('nota.resumir', { rotulo: 'Resumindo' }) },
        { label: 'Corrigir', onClick: () => executar('nota.corrigir', { rotulo: 'Corrigindo' }) },
        { label: 'Continuar', onClick: () => executar('nota.continuar', { rotulo: 'Continuando' }) },
        {
          label: 'Traduzir para',
          icon: Languages,
          submenu: idiomas.map((idioma) => ({
            label: idioma.charAt(0).toUpperCase() + idioma.slice(1),
            onClick: () =>
              executar('nota.traduzir', { input: idioma, rotulo: `Traduzindo (${idioma})` }),
          })),
        },
      ]
    }
    if (kind === 'spreadsheet') {
      return [
        {
          label: 'Sugerir fórmula',
          onClick: () =>
            pedirDescricao('planilha.formula', {
              rotulo: 'Pensando',
              placeholder: 'O que a fórmula deve calcular? Ex.: total por mês',
            }),
        },
        {
          label: 'Preencher padrão',
          onClick: () => executar('planilha.preencher', { rotulo: 'Preenchendo' }),
        },
      ]
    }
    // diagrama e canvas: gerar o desenho a partir de uma descrição ou do
    // texto que já está lá.
    const task = kind === 'canvas' ? 'canvas.gerar' : 'diagrama.gerar'
    const placeholder =
      kind === 'canvas'
        ? 'O que desenhar no quadro? Ex.: mapa mental sobre mudança de carreira'
        : 'Descreva o diagrama (ex.: DER de um blog com Post, Autor e Comentário)'
    return [
      // Acrescentam ao desenho existente. Refazer do zero é um item à
      // parte e com nome explícito — apagar não pode ser efeito colateral.
      {
        label: 'Gerar a partir do conteúdo',
        onClick: () => executar(task, { rotulo: 'Desenhando' }),
      },
      {
        label: 'Gerar a partir de uma descrição...',
        onClick: () => pedirDescricao(task, { rotulo: 'Desenhando', placeholder }),
      },
      { separator: true },
      {
        label: 'Refazer do zero (apaga o atual)',
        onClick: () => executar(task, { substituir: true, rotulo: 'Refazendo' }),
      },
    ]
  })()

  const item = {
    label: 'Laviel (IA)',
    icon: Sparkles,
    disabled: !configurada || !!rodando,
    submenu: configurada
      ? submenu
      : [{ label: 'Ative o Laviel em Configurações', disabled: true }],
  }

  const modalIA = (
    <Modal
      open={!!pedido}
      onClose={fecharPedido}
      title="O que a IA deve gerar?"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => setPedido(null)}>
            Cancelar
          </Button>
          <Button onClick={confirmarPedido} disabled={!textoPedido.trim()}>
            Gerar
          </Button>
        </>
      }
    >
      <textarea
        autoFocus
        value={textoPedido}
        onChange={(e) => setTextoPedido(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') confirmarPedido()
        }}
        placeholder={pedido?.placeholder}
        rows={4}
        className="input w-full resize-y"
      />
    </Modal>
  )

  return {
    itemIA: item,
    rodando,
    erro,
    limparErro: () => setErro(null),
    executar,
    modalIA,
  }
}

/** Aviso flutuante de progresso/erro das ações de IA. */
export function AvisoIA({ rodando, erro, onFechar }) {
  if (!rodando && !erro) return null
  return (
    <div
      className={`fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-md px-3 py-2 text-sm shadow-pop ${
        erro
          ? 'bg-red-600 text-white'
          : 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900'
      }`}
      onClick={onFechar}
      role="status"
    >
      {erro || `${rodando}...`}
    </div>
  )
}
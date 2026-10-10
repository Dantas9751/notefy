import { useCallback, useState } from 'react'
import { Languages, Sparkles } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { executarNoDocumento } from './executar'
import { Modal, Button } from '@/components/ui'
import { avisarErro, avisarProgresso, fecharAviso } from '@/lib/avisoFlutuante'
import { t } from '../../lib/i18n.js'

/**
 * As ações de IA de dentro de um editor.
 *
 * Devolve o item "IA" pronto para entrar em qualquer menu de contexto
 * (com submenu das mecânicas daquele tipo). O "Resumindo..." e o erro saem
 * no aviso flutuante, como o resultado de toda ação.
 *
 * As tarefas de texto NÃO gravam sozinhas: devolvem o resultado para o
 * editor decidir onde encaixar (substituir a seleção, anexar ao fim). As
 * de estrutura (diagrama, canvas, planilha) gravam via `apply: replace`,
 * porque reescrevem o documento inteiro.
 */
export function useAcoesIA({ kind, documentId, onTexto, onDocumento }) {
  const { user } = useAuth()
  const [rodando, setRodando] = useState(null)
  // Modal de "descreva o que gerar": guarda a tarefa pendente até o
  // usuário confirmar. Sem `window.prompt` — ele trava o app e some em
  // alguns navegadores.
  const [pedido, setPedido] = useState(null)
  const [textoPedido, setTextoPedido] = useState('')

  const configurada = !!user?.preferences?.ai_provider

  const executar = useCallback(
    async (task, { input, substituir = false, rotulo } = {}) => {
      if (!documentId) {
        avisarErro(t('Salve o item antes de usar a IA.'), 'ia')
        return
      }
      setRodando(rotulo || 'IA')
      avisarProgresso('ia', `${rotulo || 'IA'}...`)
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
        fecharAviso('ia')
      } catch (e) {
        avisarErro(e.message, 'ia')
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
        ['inglês', t('Inglês')],
        ['espanhol', t('Espanhol')],
        ['francês', t('Francês')],
        ['alemão', t('Alemão')],
        ['italiano', t('Italiano')],
        ['japonês', t('Japonês')],
        ['chinês', t('Chinês')],
        ['russo', t('Russo')],
      ]
      return [
        { label: t('Resumir'), onClick: () => executar('nota.resumir', { rotulo: t('Resumindo') }) },
        { label: t('Corrigir'), onClick: () => executar('nota.corrigir', { rotulo: t('Corrigindo') }) },
        { label: t('Continuar'), onClick: () => executar('nota.continuar', { rotulo: t('Continuando') }) },
        {
          label: t('Traduzir para'),
          icon: Languages,
          // O modelo recebe o nome do idioma em português (é o que o
          // backend espera); só o rótulo do menu muda com o idioma do app.
          submenu: idiomas.map(([idioma, nome]) => ({
            label: nome,
            onClick: () =>
              executar('nota.traduzir', { input: idioma, rotulo: t('Traduzindo ({idioma})', { idioma: nome }) }),
          })),
        },
      ]
    }
    if (kind === 'spreadsheet') {
      return [
        {
          label: t('Sugerir fórmula'),
          onClick: () =>
            pedirDescricao('planilha.formula', {
              rotulo: t('Pensando'),
              placeholder: t('O que a fórmula deve calcular? Ex.: total por mês'),
            }),
        },
        {
          label: t('Preencher padrão'),
          onClick: () => executar('planilha.preencher', { rotulo: t('Preenchendo') }),
        },
      ]
    }
    // diagrama e canvas: gerar o desenho a partir de uma descrição ou do
    // texto que já está lá.
    const task = kind === 'canvas' ? 'canvas.gerar' : 'diagrama.gerar'
    const placeholder =
      kind === 'canvas'
        ? t('O que desenhar no quadro? Ex.: mapa mental sobre mudança de carreira')
        : t('Descreva o diagrama (ex.: DER de um blog com Post, Autor e Comentário)')
    return [
      // Acrescentam ao desenho existente. Refazer do zero é um item à
      // parte e com nome explícito — apagar não pode ser efeito colateral.
      {
        label: t('Gerar a partir do conteúdo'),
        onClick: () => executar(task, { rotulo: t('Desenhando') }),
      },
      {
        label: t('Gerar a partir de uma descrição...'),
        onClick: () => pedirDescricao(task, { rotulo: t('Desenhando'), placeholder }),
      },
      { separator: true },
      {
        label: t('Refazer do zero (apaga o atual)'),
        onClick: () => executar(task, { substituir: true, rotulo: t('Refazendo') }),
      },
    ]
  })()

  const item = {
    label: t('Laviel (IA)'),
    icon: Sparkles,
    disabled: !configurada || !!rodando,
    submenu: configurada
      ? submenu
      : [{ label: t('Ative o Laviel em Configurações'), disabled: true }],
  }

  const modalIA = (
    <Modal
      open={!!pedido}
      onClose={fecharPedido}
      title={t('O que a IA deve gerar?')}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => setPedido(null)}>
            {t('Cancelar')}
          </Button>
          <Button onClick={confirmarPedido} disabled={!textoPedido.trim()}>
            {t('Gerar')}
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
    executar,
    modalIA,
  }
}

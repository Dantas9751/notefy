import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { useWorkspace } from '@/context/WorkspaceContext'
import PropriedadesModal from '@/components/modals/PropriedadesModal'
import { t } from '@/lib/i18n'

const PropriedadesContext = createContext(null)

/**
 * Uma janela de Propriedades para o app inteiro. Qualquer menu de botão
 * direito abre com `abrirPropriedades({ tipo, id })`, sem cada tela
 * desenhar o próprio modal.
 *
 * Depois de salvar, avisa quem mostra o item: a árvore (`refresh`), as
 * listas (`notefy:moved`) e um editor aberto no mesmo documento
 * (`notefy:saved:<id>`, que o faz recarregar — é assim que o "somente
 * leitura" vale na hora).
 */
export function PropriedadesProvider({ children }) {
  const { refresh } = useWorkspace()
  const [alvo, setAlvo] = useState(null)
  const aoSalvarRef = useRef(null)

  const abrirPropriedades = useCallback((novo, { onSalvo } = {}) => {
    aoSalvarRef.current = onSalvo ?? null
    setAlvo(novo)
  }, [])

  const salvo = useCallback(
    (dados) => {
      refresh()
      window.dispatchEvent(new Event('notefy:moved'))
      if (alvo?.tipo === 'documento') {
        window.dispatchEvent(new CustomEvent(`notefy:saved:${alvo.id}`, { detail: { origem: 'propriedades' } }))
      }
      aoSalvarRef.current?.(dados)
    },
    [alvo, refresh],
  )

  const valor = useMemo(() => ({ abrirPropriedades }), [abrirPropriedades])

  return (
    <PropriedadesContext.Provider value={valor}>
      {children}
      <PropriedadesModal alvo={alvo} onClose={() => setAlvo(null)} onSalvo={salvo} />
    </PropriedadesContext.Provider>
  )
}

/** `abrirPropriedades({ tipo: 'documento' | 'pasta' | 'categoria', id, aba? })`. */
export const usePropriedades = () => useContext(PropriedadesContext)

/**
 * O fim de todo menu de botão direito, como no Explorer: um separador e
 * "Propriedades". `fimDoMenu('pasta', id)` devolve as duas linhas.
 */
export function usePropriedadesNoMenu() {
  const contexto = useContext(PropriedadesContext)
  return useCallback(
    (tipo, id) =>
      contexto
        ? [
            { separator: true },
            { label: t('Propriedades'), icon: Info, onClick: () => contexto.abrirPropriedades({ tipo, id }) },
          ]
        : [],
    [contexto],
  )
}


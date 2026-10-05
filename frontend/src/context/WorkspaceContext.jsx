import { createContext, useCallback, useContext, useMemo } from 'react'
import { useFetch } from '@/hooks/useFetch'
import { useAuth } from './AuthContext'

const WorkspaceContext = createContext(null)

/**
 * A árvore categoria → pasta → subpasta, compartilhada pelo app.
 *
 * `/folders/tree/` devolve as categorias já com suas pastas raiz
 * aninhadas, então a sidebar, os seletores de destino e os filtros leem a
 * mesma estrutura — buscar em cada componente multiplicaria requisições
 * idênticas e deixaria as listas fora de sincronia após uma criação.
 */
export function WorkspaceProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const tree = useFetch('/folders/tree/', { enabled: isAuthenticated })

  const categories = tree.data ?? []

  const refresh = useCallback(() => tree.refetch(), [tree.refetch])

  const value = useMemo(
    () => ({
      /** [{ id, name, color, ..., folders: [...] }] */
      categories,
      loading: tree.loading,
      error: tree.error,
      refresh,
      /** Compatibilidade com quem só precisa da lista chapada de categorias. */
      categoryList: categories.map(({ folders, ...category }) => category),
      hasFolders: categories.some((category) => category.folders?.length),
    }),
    [categories, tree.loading, tree.error, refresh],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace precisa estar dentro de <WorkspaceProvider>.')
  return ctx
}

/**
 * Achata a árvore inteira para uso em <select> de destino.
 *
 * Devolve entradas de pasta com `_depth` e o nome da categoria, para que
 * o usuário consiga distinguir duas pastas homônimas em categorias
 * diferentes.
 */
export function flattenFolders(categories) {
  const out = []
  // `_caminho`: os nomes desde a pasta raiz ("Banco de Dados › Cálculo III").
  const walk = (nodes, depth, category, caminho) => {
    nodes.forEach((node) => {
      const proprio = [...caminho, node.name]
      out.push({ ...node, _depth: depth, _category: category, _caminho: proprio })
      if (node.children?.length) walk(node.children, depth + 1, category, proprio)
    })
  }
  categories.forEach((category) => walk(category.folders ?? [], 0, category, []))
  return out
}

/**
 * As pastas como `<option>` de um `<select>`, agrupadas por categoria e
 * com o caminho escrito ("Banco de Dados › Cálculo III"). Espaços de recuo
 * dentro de um `<option>` não alinham nada — ficavam tortos e feios — e o
 * "(Faculdade)" repetido em toda linha vira o título do grupo.
 */
export function OpcoesDePasta({ pastas }) {
  const grupos = new Map()
  for (const pasta of pastas) {
    const nome = pasta._category?.name ?? ''
    if (!grupos.has(nome)) grupos.set(nome, [])
    grupos.get(nome).push(pasta)
  }
  return [...grupos].map(([categoria, lista]) => (
    <optgroup key={categoria} label={categoria}>
      {lista.map((pasta) => (
        <option key={pasta.id} value={pasta.id}>
          {pasta._caminho.join(' › ')}
        </option>
      ))}
    </optgroup>
  ))
}

/** Procura uma pasta pelo id em toda a árvore. */
export function findFolder(categories, folderId) {
  return flattenFolders(categories).find((folder) => folder.id === folderId) ?? null
}

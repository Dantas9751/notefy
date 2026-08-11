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
  const walk = (nodes, depth, category) => {
    nodes.forEach((node) => {
      out.push({ ...node, _depth: depth, _category: category })
      if (node.children?.length) walk(node.children, depth + 1, category)
    })
  }
  categories.forEach((category) => walk(category.folders ?? [], 0, category))
  return out
}

/** Procura uma pasta pelo id em toda a árvore. */
export function findFolder(categories, folderId) {
  return flattenFolders(categories).find((folder) => folder.id === folderId) ?? null
}

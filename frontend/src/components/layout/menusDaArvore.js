import { Download, Folder, FolderOpen, FolderPlus, LayoutTemplate, Pencil, Settings, Tag, Trash2 } from 'lucide-react'
import { exportarSelecao } from '@/components/ExportMenu'
import { t } from '@/lib/i18n'

/**
 * O menu de botão direito de uma pasta e o de uma categoria, os mesmos em
 * toda tela (barra lateral, Início, categoria, pasta). Cada tela passa as
 * ações que tem; item sem ação não aparece, mas a ordem e os nomes não
 * mudam de uma tela para outra.
 *
 * `fimDoMenu` é o de `usePropriedadesNoMenu`: separador e "Propriedades".
 */

/** Item só quando a tela tem a ação. */
const se = (acao, item) => (acao ? [{ ...item, onClick: acao }] : [])

export function itensDaPasta(pasta, { navigate, novaSubpasta, moverPara, renomear, editar, excluir, fimDoMenu }) {
  return [
    { label: t('Abrir'), icon: FolderOpen, onClick: () => navigate(`/folders/${pasta.id}`) },
    ...se(novaSubpasta, { label: t('Nova subpasta'), icon: FolderPlus }),
    { label: t('Novo a partir de modelo...'), icon: LayoutTemplate, onClick: () => navigate(`/templates?folder=${pasta.id}`) },
    { separator: true },
    ...se(moverPara, { label: t('Mover para...'), icon: Folder }),
    { label: t('Exportar como .zip'), icon: Download, onClick: () => exportarSelecao([`folder:${pasta.id}`]) },
    { separator: true },
    ...se(renomear, { label: t('Renomear'), icon: Pencil, atalho: 'F2' }),
    // O modal edita cor e descrição, não só o nome.
    ...se(editar, { label: t('Editar...'), icon: Settings }),
    { label: t('Excluir'), icon: Trash2, danger: true, onClick: excluir },
    ...fimDoMenu('pasta', pasta.id),
  ]
}

export function itensDaCategoria(categoria, { navigate, novaPasta, renomear, editar, excluir, fimDoMenu }) {
  return [
    { label: t('Abrir'), icon: Tag, onClick: () => navigate(`/categories/${categoria.id}`) },
    ...se(novaPasta, { label: t('Nova pasta'), icon: FolderPlus }),
    { separator: true },
    { label: t('Exportar como .zip'), icon: Download, onClick: () => exportarSelecao([`category:${categoria.id}`]) },
    { separator: true },
    ...se(renomear, { label: t('Renomear'), icon: Pencil, atalho: 'F2' }),
    ...se(editar, { label: t('Editar...'), icon: Settings }),
    { label: t('Excluir'), icon: Trash2, danger: true, onClick: excluir },
    ...fimDoMenu('categoria', categoria.id),
  ]
}

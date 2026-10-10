import DocumentCard from '@/components/DocumentCard'
import { cn } from '@/lib/utils'

/**
 * Os itens do Início como cartões, quantos couberem na largura do bloco:
 * o bloco estreito vira uma coluna, o largo, três ou quatro. Era uma
 * escolha (cartões, pilha, lista), mas com o bloco do tamanho que a
 * pessoa quiser o tamanho já decide o desenho.
 *
 * Seleção, menu e arrastar para uma pasta: quem decide é a tela
 * (`onClickCapture`, `onContextMenu`), aqui só desenha.
 */
export default function ItensDoInicio({ itens, selecionados, renomear, onClickCapture, onContextMenu }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
      {itens.map((doc) => {
        const marcado = selecionados.includes(`document:${doc.id}`)
        return (
          <div
            key={doc.id}
            onClickCapture={(e) => onClickCapture(doc, e)}
            onContextMenu={(e) => onContextMenu(doc, e)}
            className={cn(
              'cursor-pointer overflow-hidden rounded-xl transition',
              marcado && 'bg-accent-50/50 ring-2 ring-accent-500 dark:bg-accent-500/10',
            )}
          >
            <DocumentCard document={doc} showFolder selecionado={marcado} renomear={renomear} />
          </div>
        )
      })}
    </div>
  )
}

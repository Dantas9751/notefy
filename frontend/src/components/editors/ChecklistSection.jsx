import { useRef } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { MAX_ITENS_SECAO } from '@/lib/limites'
import { cn } from '@/lib/utils'

/**
 * Bloco de checklist de uma nota.
 *
 * O `done` é um booleano no `data`, e não um `[x]` digitado no texto: é
 * o que permite riscar o item, contar quanto falta e — quando a busca
 * quiser — filtrar por pendência. Nada disso sai de uma string.
 *
 * O teclado é o que faz a lista valer a pena, e segue o do Notion e o do
 * Apple Notes: Enter cria o próximo item, Backspace num item vazio
 * apaga e volta para o de cima. Quem escreve uma lista de dez coisas
 * nunca tira a mão do teclado.
 */

const uid = () => `i${Math.random().toString(36).slice(2, 9)}`

export const novoItem = (text = '') => ({ id: uid(), text, done: false })

export default function ChecklistSection({
  section,
  onChange,
  onDelete,
  readOnly = false,
  //: Recém-inserido pela barra: recebe o cursor no primeiro item.
  autoFocus = false,
}) {
  // Mesmo cuidado do `NoteEditor`: `novoItem()` sorteia um id, e sortear
  // de novo a cada render troca a `key` da linha e remonta o campo por
  // baixo de quem está digitando. Acontece com um checklist salvo vazio
  // — o backend aceita `items: []`.
  const vazio = useRef(novoItem())
  const items = section.items?.length ? section.items : [vazio.current]
  // Guarda qual campo focar DEPOIS do próximo render: criar o item e
  // focá-lo na mesma volta não funciona, o input ainda não existe. Já
  // nasce apontando para o primeiro item quando o bloco acabou de ser
  // criado — é o mesmo mecanismo, só que para a montagem.
  const focarRef = useRef(autoFocus ? (items[0]?.id ?? null) : null)

  const feitos = items.filter((i) => i.done).length

  const atualizar = (proximos) => onChange({ items: proximos })

  const patch = (index, mudanca) =>
    atualizar(items.map((item, i) => (i === index ? { ...item, ...mudanca } : item)))

  const inserirDepois = (index) => {
    // Ver `lib/limites.js`: o backend recusa a seção acima deste número,
    // e recusar depois de digitado significa autosave quebrado sem a
    // pessoa entender o porquê.
    if (items.length >= MAX_ITENS_SECAO) return
    const proximos = [...items]
    const novo = novoItem()
    proximos.splice(index + 1, 0, novo)
    focarRef.current = novo.id
    atualizar(proximos)
  }

  const remover = (index) => {
    // A lista nunca fica sem nenhuma linha: sem um campo onde digitar, a
    // única saída seria apagar o bloco inteiro e criar outro.
    const proximos = items.filter((_, i) => i !== index)
    focarRef.current = proximos[Math.max(0, index - 1)]?.id ?? null
    atualizar(proximos.length ? proximos : [novoItem()])
  }

  const aoTeclar = (event, index) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      inserirDepois(index)
      return
    }
    // Só com o campo vazio E o cursor no começo: no meio de uma palavra,
    // Backspace tem que apagar a letra.
    if (
      event.key === 'Backspace' &&
      !items[index].text &&
      event.target.selectionStart === 0 &&
      items.length > 1
    ) {
      event.preventDefault()
      remover(index)
    }
  }

  return (
    // Mesma casca do bloco de código: borda, cantos e uma barra de
    // cabeçalho com fundo. Não é enfeite — é o que faz os três blocos de
    // uma nota parecerem a mesma peça em três sabores, em vez de três
    // widgets desenhados em dias diferentes.
    <div className="group/lista overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
      <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-2 py-1.5 dark:border-ink-700 dark:bg-ink-900">
        {/* Sem a palavra "checklist": uma fileira de caixinhas já diz o
            que é, e a nota toda ficaria com um rótulo em cima de cada
            bloco anunciando o óbvio. O que o olho NÃO sabe é quanto
            falta — e é só isso que fica. */}
        <span className="flex-1 text-[10px] tabular-nums text-ink-400">
          {feitos} de {items.length} {items.length === 1 ? 'feito' : 'feitos'}
        </span>
        {!readOnly && (
          <button
            onClick={() => inserirDepois(items.length - 1)}
            title="Adicionar item"
            className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
          >
            <Plus size={12} />
          </button>
        )}
        {onDelete && !readOnly && (
          <button
            onClick={onDelete}
            title="Excluir seção"
            className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-red-600 dark:hover:bg-ink-700"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <ul className="space-y-0.5 px-3 py-2">
        {items.map((item, index) => (
          <li key={item.id ?? `pos-${index}`} className="group/item flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!item.done}
              disabled={readOnly}
              onChange={(e) => patch(index, { done: e.target.checked })}
              aria-label={item.text || `Item ${index + 1}`}
              className="h-3.5 w-3.5 shrink-0 rounded border-ink-300 text-accent-600 focus:ring-accent-500 dark:border-ink-600 dark:bg-ink-800"
            />
            <input
              // Focado logo depois de ser criado por Enter, ou logo
              // depois de o item de baixo ser apagado por Backspace.
              ref={(el) => {
                if (el && focarRef.current === item.id) {
                  focarRef.current = null
                  el.focus()
                  // Cursor no FIM: apagando de baixo para cima, a pessoa
                  // continua escrevendo de onde parou.
                  el.setSelectionRange(el.value.length, el.value.length)
                }
              }}
              value={item.text ?? ''}
              readOnly={readOnly}
              onChange={(e) => patch(index, { text: e.target.value })}
              onKeyDown={(e) => aoTeclar(e, index)}
              placeholder="Escreva um item..."
              className={cn(
                'min-w-0 flex-1 bg-transparent py-0.5 text-[14px] outline-none placeholder:text-ink-300',
                item.done && 'text-ink-400 line-through',
              )}
            />
            {!readOnly && (
              <button
                onClick={() => remover(index)}
                title="Remover item"
                className="shrink-0 rounded p-0.5 text-ink-300 opacity-0 transition hover:text-red-600 group-hover/item:opacity-100"
              >
                <X size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { X } from 'lucide-react'
import { MAX_ITENS_SECAO } from '@/lib/limites'
import { cn, uid } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Checklist da página.
 *
 * O `done` é um booleano no `data`, e não um `[x]` digitado no texto: é
 * o que permite riscar o item, contar quanto falta e — quando a busca
 * quiser — filtrar por pendência. Nada disso sai de uma string.
 *
 * Sem moldura nem cabeçalho: dentro da folha, a lista é uma lista, como no
 * Word, e não uma caixa no meio do texto. O teclado é o do Notion e do
 * Apple Notes — Enter cria o próximo item (levando o que estava depois do
 * cursor), Enter num item vazio encerra a lista e volta para o texto,
 * Backspace no começo junta com o de cima, e as setas atravessam para o
 * texto de cima e de baixo. Quem escreve uma lista de dez coisas nunca
 * tira a mão do teclado.
 */

export const novoItem = (text = '') => ({ id: uid('i'), text, done: false })

const ChecklistSection = forwardRef(function ChecklistSection(
  {
    section,
    onChange,
    readOnly = false,
    //: Seta, Backspace ou Enter saindo da lista: a página põe o cursor no
    //: texto de cima ('cima') ou de baixo ('baixo').
    onSair,
    //: A lista ficou sem nada (Enter ou Backspace no único item vazio):
    //: a página tira o bloco e devolve o cursor ao texto.
    onApagarBloco,
  },
  ref,
) {
  // `novoItem()` sorteia um id, e sortear de novo a cada render trocaria a
  // `key` da linha e remontaria o campo por baixo de quem está digitando.
  // Acontece com um checklist salvo vazio — o backend aceita `items: []`.
  const vazio = useRef(novoItem())
  const items = section.items?.length ? section.items : [vazio.current]
  const camposRef = useRef({})
  // O campo a focar DEPOIS do próximo render: o item criado por Enter
  // ainda não existe no render atual.
  const focarRef = useRef(null)

  const focarItem = (id, posicao = 'fim') => {
    const campo = camposRef.current[id]
    if (!campo) {
      focarRef.current = { id, posicao }
      return
    }
    campo.focus()
    const fim = campo.value.length
    const p = posicao === 'inicio' ? 0 : posicao === 'fim' ? fim : Math.min(posicao, fim)
    campo.setSelectionRange(p, p)
  }

  useImperativeHandle(ref, () => ({
    focar: (onde = 'fim') =>
      onde === 'inicio' ? focarItem(items[0].id, 'inicio') : focarItem(items[items.length - 1].id, 'fim'),
  }))

  const feitos = items.filter((i) => i.done).length
  const atualizar = (proximos) => onChange({ items: proximos })
  const patch = (index, mudanca) =>
    atualizar(items.map((item, i) => (i === index ? { ...item, ...mudanca } : item)))

  /** Enter no meio do item: o que estava depois do cursor vai para o item novo. */
  const quebrar = (index, posicao) => {
    // Ver `lib/limites.js`: o backend recusa a seção acima deste número,
    // e recusar depois de digitado significa autosave quebrado sem a
    // pessoa entender o porquê.
    if (items.length >= MAX_ITENS_SECAO) return
    const texto = items[index].text ?? ''
    const novo = novoItem(texto.slice(posicao))
    const proximos = items.map((item, i) => (i === index ? { ...item, text: texto.slice(0, posicao) } : item))
    proximos.splice(index + 1, 0, novo)
    focarRef.current = { id: novo.id, posicao: 'inicio' }
    atualizar(proximos)
  }

  const remover = (index) => {
    const proximos = items.filter((_, i) => i !== index)
    const alvo = proximos[Math.max(0, index - 1)]
    if (alvo) focarRef.current = { id: alvo.id, posicao: 'fim' }
    atualizar(proximos.length ? proximos : [novoItem()])
  }

  const aoTeclar = (event, index) => {
    const campo = event.target
    const item = items[index]
    const texto = item.text ?? ''
    const ultimo = index === items.length - 1
    const noComeco = campo.selectionStart === 0 && campo.selectionEnd === 0

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSair?.('baixo')
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!texto) {
        if (items.length === 1) {
          onApagarBloco?.('baixo')
          return
        }
        if (ultimo) {
          atualizar(items.slice(0, -1))
          onSair?.('baixo')
          return
        }
      }
      quebrar(index, campo.selectionStart ?? texto.length)
      return
    }
    if (event.key === 'Backspace' && noComeco) {
      event.preventDefault()
      if (!texto) {
        if (items.length === 1) onApagarBloco?.('cima')
        else remover(index)
        return
      }
      if (index === 0) {
        onSair?.('cima')
        return
      }
      // Junta com o item de cima, com o cursor na emenda.
      const anterior = items[index - 1]
      const emenda = (anterior.text ?? '').length
      focarRef.current = { id: anterior.id, posicao: emenda }
      atualizar(
        items
          .map((it, i) => (i === index - 1 ? { ...it, text: `${it.text ?? ''}${texto}` } : it))
          .filter((_, i) => i !== index),
      )
      return
    }
    if (event.key === 'ArrowUp' && !event.shiftKey) {
      event.preventDefault()
      if (index === 0) onSair?.('cima')
      else focarItem(items[index - 1].id, campo.selectionStart)
      return
    }
    if (event.key === 'ArrowDown' && !event.shiftKey) {
      event.preventDefault()
      if (ultimo) onSair?.('baixo')
      else focarItem(items[index + 1].id, campo.selectionStart)
    }
  }

  return (
    <ul className="group/lista my-1 space-y-0.5" aria-label={t('{feitos} de {total} feitos', { feitos, total: items.length })}>
      {items.map((item, index) => (
        <li key={item.id ?? `pos-${index}`} className="group/item flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={!!item.done}
            disabled={readOnly}
            onChange={(e) => patch(index, { done: e.target.checked })}
            aria-label={item.text || t('Item {valor}', { valor: index + 1 })}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-ink-300 text-accent-600 focus:ring-accent-500 dark:border-ink-600 dark:bg-ink-800 [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5"
          />
          <input
            ref={(el) => {
              const id = item.id
              if (el) camposRef.current[id] = el
              else delete camposRef.current[id]
              if (el && focarRef.current?.id === id) {
                const { posicao } = focarRef.current
                focarRef.current = null
                el.focus()
                const fim = el.value.length
                const p = posicao === 'inicio' ? 0 : posicao === 'fim' ? fim : Math.min(posicao, fim)
                el.setSelectionRange(p, p)
              }
            }}
            value={item.text ?? ''}
            readOnly={readOnly}
            onChange={(e) => patch(index, { text: e.target.value })}
            onKeyDown={(e) => aoTeclar(e, index)}
            placeholder={index === items.length - 1 ? t('Item da lista...') : ''}
            className={cn(
              'min-w-0 flex-1 bg-transparent py-0.5 text-[0.9375rem] leading-[1.75] text-ink-700 outline-none placeholder:text-ink-300 dark:text-ink-200 dark:placeholder:text-ink-600',
              item.done && 'text-ink-400 line-through dark:text-ink-500',
            )}
          />
          {/* Quanto falta, só quando a lista está em uso: um rótulo fixo em
              toda lista da página seria ruído. */}
          {index === 0 && items.length > 1 && (
            <span className="shrink-0 text-[10px] tabular-nums text-ink-400 opacity-0 transition group-focus-within/lista:opacity-100 group-hover/lista:opacity-100">
              {t('{feitos} de {total} feitos', { feitos, total: items.length })}
            </span>
          )}
          {!readOnly && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => remover(index)}
              title={t('Remover item')}
              className="shrink-0 rounded p-0.5 text-ink-300 opacity-0 transition hover:text-red-600 group-hover/item:opacity-100"
            >
              <X size={12} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
})

export default ChecklistSection

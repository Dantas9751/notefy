import { Suspense, lazy, useRef, useState } from 'react'
import { Code2, GripVertical, ListChecks, Table2, Trash2, Type } from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import ChecklistSection from './ChecklistSection'
import TableSection from './TableSection'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

// Carregado sob demanda: o bloco de código arrasta o highlight.js junto,
// e uma nota só de texto não deve pagar por ele. Checklist e tabela não
// entram nessa regra — são HTML comum, e um `lazy` para cada um custaria
// mais em requisição do que economiza em bytes.
const CodeSection = lazy(() => import('./CodeSection'))

/**
 * Nota dividida em seções.
 *
 * Uma nota é uma sequência de blocos, e cada tipo existe porque guardar
 * aquilo como DADO vale mais do que desenhá-lo dentro do texto rico:
 * o código tem linguagem (dá para colorir e preservar a indentação, que
 * um contentEditable normalizaria), o checklist tem `done` (dá para
 * contar o que falta) e a tabela tem células endereçáveis (uma tabela
 * desenhada no texto só é tabela para os olhos).
 */

const uid = () => `s${Math.random().toString(36).slice(2, 9)}`

const MOLDES = {
  code: () => ({ id: uid(), type: 'code', language: 'plaintext', code: '', title: '' }),
  checklist: () => ({
    id: uid(),
    type: 'checklist',
    items: [{ id: `i${Math.random().toString(36).slice(2, 9)}`, text: '', done: false }],
  }),
  // 2×2: cabeçalho e uma linha de dados, o mínimo para parecer tabela.
  table: () => ({ id: uid(), type: 'table', rows: [['', ''], ['', '']] }),
  text: () => ({ id: uid(), type: 'text', html: '' }),
}

const newSection = (type) => (MOLDES[type] ?? MOLDES.text)()

/** Botão de inserir que aparece entre dois blocos. */
function InsertBar({ onAdd, always = false }) {
  return (
    <div
      className={cn(
        'group/insert relative flex items-center justify-center py-1 transition',
        !always && 'opacity-0 focus-within:opacity-100 hover:opacity-100',
      )}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-ink-200 dark:bg-ink-800" />
      <div className="relative flex gap-1 rounded-full border border-ink-200 bg-white p-0.5 shadow-subtle dark:border-ink-700 dark:bg-ink-900">
        <button
          onClick={() => onAdd('text')}
          title="Inserir seção de texto"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-800"
        >
          <Type size={11} /> Texto
        </button>
        <button
          onClick={() => onAdd('code')}
          title="Inserir bloco de código"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-800"
        >
          <Code2 size={11} /> Código
        </button>
        <button
          onClick={() => onAdd('checklist')}
          title="Inserir checklist"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-800"
        >
          <ListChecks size={11} /> Checklist
        </button>
        <button
          onClick={() => onAdd('table')}
          title="Inserir tabela"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-800"
        >
          <Table2 size={11} /> Tabela
        </button>
      </div>
    </div>
  )
}

export default function NoteEditor({ data, onChange, documentId, onError }) {
  // A seção de rascunho que aparece enquanto a nota ainda não tem
  // nenhuma — e uma nota RECÉM-CRIADA passa por aqui, porque nasce com
  // `data: null` e só ganha seções na primeira gravação.
  //
  // Em `useRef`, e não montada na hora: `newSection()` sorteia um id, e
  // um id novo a cada render troca a `key` do bloco. O React desmonta e
  // remonta o editor de texto por baixo do cursor — quem estivesse
  // digitando o título perdia o ponto de inserção no corpo.
  const rascunho = useRef(newSection('text'))
  const sections = data?.sections?.length ? data.sections : [rascunho.current]
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  // Id da seção que acabou de ser inserida. Ela recebe o cursor ao
  // aparecer: clicar em "Checklist" e ainda ter que clicar dentro do
  // bloco para escrever é um passo que ninguém pediu.
  const [recemInserida, setRecemInserida] = useState(null)

  const update = (next) => onChange({ ...data, sections: next })

  /**
   * Altera UMA seção, endereçada pela posição.
   *
   * Era por `id`, e isso destruía conteúdo: o backend aceita seção sem
   * `id` (`schemas.py` só recusa ids duplicados), e com duas seções sem
   * id o `s.id === id` virava `undefined === undefined` — verdadeiro para
   * as duas. Digitar numa sobrescrevia a outra, sem aviso.
   *
   * Índice é o endereço que o resto do componente já usa (`insertAt`,
   * `removeAt`, `moveSection`), então também fica tudo coerente.
   */
  const patchSection = (index, patch) =>
    update(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const insertAt = (index, type) => {
    const next = [...sections]
    const nova = newSection(type)
    next.splice(index, 0, nova)
    setRecemInserida(nova.id)
    update(next)
  }

  const removeAt = (index) => {
    // A nota nunca fica sem nenhum bloco: sem um lugar para escrever, o
    // único caminho de volta seria recriar a nota.
    const next = sections.filter((_, i) => i !== index)
    update(next.length ? next : [newSection('text')])
  }

  const moveSection = (from, to) => {
    if (from === to) return
    const next = [...sections]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    update(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-prose flex-1 pb-16">
        {sections.map((section, index) => (
          // Sem `id` o React reconcilia por índice e ainda avisa no
          // console; o backend agora preenche o id que falta, mas notas
          // gravadas antes disso continuam por aí.
          <div key={section.id ?? `pos-${index}`}>
            {index === 0 ? (
              <InsertBar onAdd={(type) => insertAt(0, type)} />
            ) : (
              <InsertBar onAdd={(type) => insertAt(index, type)} />
            )}

            <div
              onDragOver={(e) => {
                if (dragIndex === null) return
                e.preventDefault()
                setOverIndex(index)
              }}
              onDrop={(e) => {
                if (dragIndex === null) return
                e.preventDefault()
                moveSection(dragIndex, index)
                setDragIndex(null)
                setOverIndex(null)
              }}
              className={cn(
                'group/section relative rounded-lg transition',
                overIndex === index && dragIndex !== null && 'ring-2 ring-accent-400',
                dragIndex === index && 'opacity-40',
              )}
            >
              {/* Alça de arrastar fica na margem para não roubar o clique
                  do texto nem do código. */}
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', section.id)
                  setTimeout(() => setDragIndex(index), 0)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                title="Arraste para reordenar a seção"
                className="absolute -left-7 top-2 cursor-grab rounded p-1 text-ink-300 opacity-0 transition hover:text-ink-600 active:cursor-grabbing group-hover/section:opacity-100"
              >
                <GripVertical size={14} />
              </div>

              {section.type === 'code' ? (
                <Suspense
                  fallback={
                    <div className="flex h-24 items-center justify-center rounded-lg border border-ink-200 dark:border-ink-700">
                      <Spinner size={16} />
                    </div>
                  }
                >
                  <CodeSection
                    section={section}
                    onChange={(patch) => patchSection(index, patch)}
                    onDelete={() => removeAt(index)}
                  />
                </Suspense>
              ) : section.type === 'checklist' ? (
                <ChecklistSection
                  section={section}
                  autoFocus={section.id === recemInserida}
                  onChange={(patch) => patchSection(index, patch)}
                  onDelete={() => removeAt(index)}
                />
              ) : section.type === 'table' ? (
                <TableSection
                  section={section}
                  autoFocus={section.id === recemInserida}
                  onChange={(patch) => patchSection(index, patch)}
                  onDelete={() => removeAt(index)}
                />
              ) : (
                <div className="relative">
                  <RichTextEditor
                    documentId={documentId}
                    onError={onError}
                    autoFocus={section.id === recemInserida}
                    value={section.html}
                    onChange={(html) => patchSection(index, { html })}
                    placeholder={index === 0 ? 'Comece a escrever...' : 'Continue aqui...'}
                    compact
                  />
                  {sections.length > 1 && (
                    <button
                      onClick={() => removeAt(index)}
                      title="Excluir seção"
                      className="absolute -right-7 top-2 rounded p-1 text-ink-300 opacity-0 transition hover:text-red-600 group-hover/section:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Sempre visível no fim: é o caminho natural para continuar. */}
        <InsertBar onAdd={(type) => insertAt(sections.length, type)} always />
      </div>
    </div>
  )
}

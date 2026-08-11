import { Suspense, lazy, useState } from 'react'
import { Code2, GripVertical, Trash2, Type } from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

// Carregado sob demanda: o bloco de código arrasta o highlight.js junto,
// e uma nota só de texto não deve pagar por ele.
const CodeSection = lazy(() => import('./CodeSection'))

/**
 * Nota dividida em seções.
 *
 * Uma nota é uma sequência de blocos: texto rico ou código. Manter o
 * código num bloco próprio — e não como <pre> dentro do HTML — é o que
 * permite escolher a linguagem, colorir a sintaxe e preservar a
 * indentação, que um contentEditable normalizaria.
 */

const uid = () => `s${Math.random().toString(36).slice(2, 9)}`

const newSection = (type) =>
  type === 'code'
    ? { id: uid(), type: 'code', language: 'plaintext', code: '', title: '' }
    : { id: uid(), type: 'text', html: '' }

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
      </div>
    </div>
  )
}

export default function NoteEditor({ data, onChange }) {
  const sections = data?.sections?.length ? data.sections : [newSection('text')]
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)

  const update = (next) => onChange({ ...data, sections: next })

  const patchSection = (id, patch) =>
    update(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const insertAt = (index, type) => {
    const next = [...sections]
    next.splice(index, 0, newSection(type))
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
          <div key={section.id}>
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
                    onChange={(patch) => patchSection(section.id, patch)}
                    onDelete={() => removeAt(index)}
                  />
                </Suspense>
              ) : (
                <div className="relative">
                  <RichTextEditor
                    value={section.html}
                    onChange={(html) => patchSection(section.id, { html })}
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

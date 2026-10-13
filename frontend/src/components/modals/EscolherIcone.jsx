import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal } from '@/components/ui'
import api, { extractError } from '@/lib/api'
import { avisarErro } from '@/lib/avisoFlutuante'
import { EMOJIS_SUGERIDOS, emojiDe, primeiroEmoji } from '@/lib/icone'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/** No Windows o painel de emojis abre em qualquer campo de texto. */
const noWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

/**
 * Escolher o emoji de um item (`item`: o documento; `null` fecha).
 *
 * Grava direto e avisa quem mostra o item: as listas (`notefy:moved`) e um
 * editor aberto nele (`notefy:icone`), que troca o ícone sem recarregar.
 */
export default function EscolherIcone({ item, onClose, onMudou }) {
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const atual = emojiDe(item)
  const digitado = primeiroEmoji(texto)

  useEffect(() => setTexto(''), [item?.id])

  const escolher = async (icone) => {
    setSalvando(true)
    try {
      await api.patch(`/documents/${item.id}/`, { icon: icone })
      window.dispatchEvent(new CustomEvent('notefy:icone', { detail: { id: item.id, icon: icone } }))
      window.dispatchEvent(new Event('notefy:moved'))
      onMudou?.(icone)
      onClose()
    } catch (err) {
      avisarErro(extractError(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      size="sm"
      title={t('Ícone de "{nome}"', { nome: item?.title || t('Sem título') })}
      description={t('Aparece no lugar do ícone do tipo: nas listas, nas abas e no alto do item.')}
      footer={
        <>
          {atual && (
            <Button variant="ghost" className="mr-auto" onClick={() => escolher('')} disabled={salvando}>
              {t('Remover ícone')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('Cancelar')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-8 gap-1">
        {EMOJIS_SUGERIDOS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => escolher(emoji)}
            disabled={salvando}
            aria-label={emoji}
            aria-pressed={atual === emoji}
            className={cn(
              'flex aspect-square items-center justify-center rounded-md text-xl transition hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800',
              atual === emoji && 'bg-accent-50 ring-1 ring-accent-500 dark:bg-accent-500/15',
            )}
          >
            {emoji}
          </button>
        ))}
      </div>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (digitado) escolher(digitado)
        }}
      >
        <Field
          label={t('Outro emoji')}
          hint={noWindows ? t('A tecla Windows + ponto abre o painel de emojis.') : undefined}
          error={texto.trim() && !digitado ? t('Isso não é um emoji.') : null}
        >
          <div className="flex gap-2">
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🙂" className="flex-1" aria-label={t('Outro emoji')} />
            <Button type="submit" disabled={!digitado || salvando}>
              {t('Usar')}
            </Button>
          </div>
        </Field>
      </form>
    </Modal>
  )
}

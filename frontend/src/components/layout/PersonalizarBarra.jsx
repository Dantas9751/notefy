import { useState } from 'react'
import { GripVertical, RotateCcw } from 'lucide-react'
import { Button, Interruptor, Modal } from '@/components/ui'
import { usePreferencias } from '@/hooks/usePreferencias'
import { extractError } from '@/lib/api'
import { avisarErro } from '@/lib/avisoFlutuante'
import { arrumarBarra, barraParaSalvar, moverAtalho } from '@/lib/barraLateral'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'
import { ATALHOS, SECOES } from './itensDaBarra'

/** Uma linha da janela: o ícone, o nome e o liga/desliga, que é quem tem o foco. */
function Linha({ item, visivel, onAlternar, alca, className, ...props }) {
  return (
    <li className={cn('flex items-center gap-2.5 rounded-md px-1.5 py-1.5', className)} {...props}>
      {alca}
      <item.icon size={16} className={cn('shrink-0 text-ink-600 dark:text-ink-300', !visivel && 'opacity-40')} aria-hidden />
      <span className={cn('min-w-0 flex-1 truncate text-sm text-ink-800 dark:text-ink-100', !visivel && 'text-ink-400 dark:text-ink-500')}>
        {item.label}
      </span>
      <Interruptor checked={visivel} onChange={onAlternar} rotulo={item.label} />
    </li>
  )
}

/**
 * A barra lateral do jeito da pessoa: a ordem dos atalhos e o que aparece.
 *
 * Abre pelo botão direito na barra e por Aparência. Cada mudança vale na
 * hora e vai para a conta; arrastar só grava ao soltar, para não mandar um
 * pedido por linha atravessada.
 */
export default function PersonalizarBarra({ aberto, onFechar }) {
  const { prefs, salvar } = usePreferencias()
  const barra = arrumarBarra(prefs.sidebar_layout)
  //: Durante o arraste: `{ de, atalhos }`, a ordem que a janela mostra até soltar.
  const [arraste, setArraste] = useState(null)
  const atalhos = arraste?.atalhos ?? barra.atalhos

  const gravar = (proxima) => salvar({ sidebar_layout: barraParaSalvar(proxima) }).catch((err) => avisarErro(extractError(err)))
  const alternarAtalho = (id) =>
    gravar({ ...barra, atalhos: barra.atalhos.map((a) => (a.id === id ? { ...a, visivel: !a.visivel } : a)) })
  const alternarSecao = (id) => gravar({ ...barra, secoes: { ...barra.secoes, [id]: !barra.secoes[id] } })

  /** Alt + seta para cima/baixo, com o foco na linha: a mesma troca do arraste, sem mouse. */
  const teclado = (indice) => (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const para = indice + (e.key === 'ArrowUp' ? -1 : 1)
    const lista = e.currentTarget.parentElement
    gravar({ ...barra, atalhos: moverAtalho(barra.atalhos, indice, para) })
    // O foco acompanha a linha que andou: o interruptor dela, na posição nova.
    requestAnimationFrame(() => lista?.children[para]?.querySelector('[role=switch]')?.focus())
  }

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      size="sm"
      title={t('Personalizar a barra lateral')}
      description={t('Arraste para mudar a ordem e desligue o que você não usa. As categorias e as Configurações ficam sempre na barra.')}
      footer={
        <>
          <Button variant="ghost" onClick={() => gravar(arrumarBarra({}))} className="mr-auto">
            <RotateCcw size={14} aria-hidden />
            {t('Restaurar padrão')}
          </Button>
          <Button onClick={onFechar}>{t('Pronto')}</Button>
        </>
      }
    >
      <p className="label">{t('Atalhos')}</p>
      <ul aria-describedby="dica-da-ordem" className="-mx-1.5">
        {atalhos.map((a, indice) => (
          <Linha
            key={a.id}
            item={ATALHOS[a.id]}
            visivel={a.visivel}
            onAlternar={() => alternarAtalho(a.id)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              setArraste({ de: indice, atalhos: barra.atalhos })
            }}
            onDragOver={(e) => {
              if (!arraste) return
              e.preventDefault()
              if (arraste.de !== indice) setArraste({ de: indice, atalhos: moverAtalho(arraste.atalhos, arraste.de, indice) })
            }}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={() => {
              if (arraste) gravar({ ...barra, atalhos: arraste.atalhos })
              setArraste(null)
            }}
            onKeyDown={teclado(indice)}
            className={cn('cursor-grab active:cursor-grabbing', arraste?.de === indice && 'bg-ink-100 dark:bg-ink-800')}
            alca={<GripVertical size={14} className="shrink-0 text-ink-300 dark:text-ink-600" aria-hidden />}
          />
        ))}
      </ul>
      <p id="dica-da-ordem" className="mt-1 text-xs text-ink-400">
        {t('Pelo teclado: Alt + seta para cima ou para baixo muda a posição.')}
      </p>

      <p className="label mt-5">{t('Partes da barra')}</p>
      <ul className="-mx-1.5">
        {Object.entries(SECOES).map(([id, item]) => (
          <Linha key={id} item={item} visivel={barra.secoes[id]} onAlternar={() => alternarSecao(id)} />
        ))}
      </ul>
    </Modal>
  )
}

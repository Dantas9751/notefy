import { Modal } from '@/components/ui'
import { GRUPOS_DE_ATALHOS } from '@/lib/atalhos'
import { t } from '@/lib/i18n'

function Tecla({ children }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200">
      {children}
    </kbd>
  )
}

/**
 * A lista de atalhos, no Ctrl+/.
 *
 * São uns 25, espalhados por seis telas, e nenhum lugar os reunia: quem
 * não passava o mouse em cima de cada botão para ler a dica nunca sabia
 * que o F2 renomeia ou que Alt+2 pula para a segunda aba.
 */
export default function AtalhosModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Atalhos de teclado')} size="lg">
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {GRUPOS_DE_ATALHOS.map((grupo) => (
          <section key={grupo.titulo}>
            <h3 className="secao mb-2">{grupo.titulo}</h3>
            <ul className="space-y-1.5">
              {grupo.itens.map(([teclas, descricao]) => (
                // "Lista" e "Checklist" aparecem duas vezes (markdown e Ctrl+Shift): a chave leva as teclas.
                <li key={`${descricao}:${teclas.join('+')}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-600 dark:text-ink-300">{descricao}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {teclas.map((t) => (
                      <Tecla key={t}>{t}</Tecla>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}

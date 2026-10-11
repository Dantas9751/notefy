import { Link } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { Modal } from '@/components/ui'
import { Combinacao } from '@/components/ui/Teclas'
import useAtalhos from '@/hooks/useAtalhos'
import { GRUPOS, itensDoGrupo } from '@/lib/atalhos'
import { t } from '@/lib/i18n'

/**
 * A lista de atalhos, no Ctrl+/.
 *
 * São uns 100, espalhados por oito telas, e nenhum lugar os reunia: quem
 * não passava o mouse em cima de cada botão para ler a dica nunca sabia
 * que o F2 renomeia ou que Alt+2 pula para a segunda aba. As teclas vêm de
 * `lib/atalhos.js` e mostram as de AGORA, inclusive as que a pessoa trocou.
 */
export default function AtalhosModal({ open, onClose }) {
  useAtalhos()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Atalhos de teclado')}
      size="lg"
      footer={
        <Link
          to="/settings/atalhos"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm text-accent-700 hover:underline dark:text-accent-400"
        >
          <Settings size={14} aria-hidden />
          {t('Trocar as teclas')}
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {GRUPOS.map((grupo) => (
          <section key={grupo.id}>
            <h3 className="secao mb-2">{grupo.titulo}</h3>
            <ul className="space-y-1.5">
              {itensDoGrupo(grupo).map((item) => (
                <li key={item.chave} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-600 dark:text-ink-300">{item.texto}</span>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                    {item.combos.length ? (
                      item.combos.map((teclas, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-xs text-ink-400">{t('ou')}</span>}
                          <Combinacao teclas={teclas} />
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-ink-400">{t('sem tecla')}</span>
                    )}
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

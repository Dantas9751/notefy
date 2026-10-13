import { useNavigate } from 'react-router-dom'
import { SearchX, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { useTabs } from '@/context/TabsContext'
import { useSplit } from '@/context/SplitContext'
import { t } from '@/lib/i18n'

/**
 * O item saiu debaixo da aba (ou do painel).
 *
 * `lixeira` (410): a exclusão veio de outro lugar — da sidebar, de outra
 * janela, de outra aba com o mesmo item. `inexistente` (404): apagado de vez,
 * ou de OUTRA conta (uma aba que sobrou da conta anterior no mesmo aparelho).
 * Vale para documento e arquivo: "Tentar de novo" ali só repetiria o mesmo
 * erro para sempre.
 */
export default function ItemIndisponivel({ motivo, emPainel = false }) {
  const navigate = useNavigate()
  const { closeTab, activeKey } = useTabs()
  const { fecharPainel } = useSplit()
  const naLixeira = motivo === 'lixeira'
  const Icone = naLixeira ? Trash2 : SearchX

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Icone size={28} className="text-ink-300 dark:text-ink-600" />
      <p className="text-sm text-ink-600 dark:text-ink-300">
        {naLixeira ? t('Este item foi movido para a lixeira.') : t('Este item não existe nesta conta.')}
      </p>
      <div className="flex gap-2">
        {naLixeira && !emPainel && (
          <Button variant="secondary" onClick={() => navigate('/trash')}>
            {t('Ver lixeira')}
          </Button>
        )}
        <Button onClick={() => (emPainel ? fecharPainel() : activeKey && closeTab(activeKey))}>
          {emPainel ? t('Fechar painel') : t('Fechar aba')}
        </Button>
      </div>
    </div>
  )
}

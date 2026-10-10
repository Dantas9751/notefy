import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { useTabs } from '@/context/TabsContext'
import { useSplit } from '@/context/SplitContext'
import { t } from '@/lib/i18n'

/**
 * O item saiu debaixo da aba (ou do painel).
 *
 * Acontece quando a exclusão veio de outro lugar — da sidebar, de outra
 * janela, de outra aba com o mesmo item. Vale para documento e arquivo:
 * "Tentar de novo" ali só repetiria o mesmo 404 para sempre.
 */
export default function ItemNaLixeira({ emPainel = false }) {
  const navigate = useNavigate()
  const { closeTab, activeKey } = useTabs()
  const { fecharPainel } = useSplit()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Trash2 size={28} className="text-ink-300 dark:text-ink-600" />
      <p className="text-sm text-ink-600 dark:text-ink-300">{t('Este item foi movido para a lixeira.')}</p>
      <div className="flex gap-2">
        {!emPainel && (
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

import { Pipette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Círculo cromático para escolher uma cor livre.
 *
 * Fica ao lado das cores predefinidas, não no lugar delas: os presets
 * resolvem o caso comum em um clique, e este botão abre o seletor do
 * sistema para quem quer uma cor específica.
 *
 * O `<input type="color">` não é estilizável de forma confiável entre
 * navegadores, então ele fica invisível por cima de um rótulo redondo —
 * a área clicável continua sendo a dele, e a aparência é a nossa.
 */

//: Roda de cores desenhada em CSS, exibida enquanto nenhuma cor livre está
//: escolhida. É o que faz o botão se anunciar como "outras cores".
const WHEEL =
  'conic-gradient(#EF4444, #F59E0B, #FACC15, #10B981, #06B6D4, #3B82F6, #8B5CF6, #EC4899, #EF4444)'

export default function ColorWheel({
  value,
  onChange,
  selected = false,
  className = 'h-7 w-7',
  title = t('Escolher outra cor'),
  //: Quadrado, para ficar na grade de quadradinhos da barra da nota.
  quadrado = false,
}) {
  return (
    <label
      title={title}
      className={cn(
        'relative flex cursor-pointer items-center justify-center border-2 transition',
        quadrado ? 'rounded' : 'rounded-full',
        className,
        selected ? 'border-ink-900 dark:border-white' : 'border-ink-200 dark:border-ink-700',
      )}
      style={{ background: selected && value ? value : WHEEL }}
    >
      <input
        type="color"
        // Sem valor ainda: o seletor do sistema precisa de um ponto de
        // partida válido, senão abre em preto.
        value={value || '#70864C'}
        onChange={(event) => onChange(event.target.value)}
        aria-label={title}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {!selected && (
        <Pipette size={11} className="pointer-events-none text-white drop-shadow" />
      )}
    </label>
  )
}

import { RotateCcw } from 'lucide-react'
import { useUI } from '@/context/UIContext'
import { Field, Select } from '@/components/ui'
import ColorWheel from '@/components/ui/ColorWheel'
import { ACCENT_PADRAO, CORES_PADRAO } from '@/lib/accent'
import { cn } from '@/lib/utils'
import { Bloco, Chave } from './componentes'
import { usePreferencias } from './index'

export default function AbaAparencia() {
  const { theme, setTheme, zen, setZen, accent, setAccent } = useUI()
  const { prefs, savePrefs } = usePreferencias()

  const corPersonalizada = !CORES_PADRAO.includes(accent)

  return (
    <>
      <Bloco title="Tema" description="Claro, escuro ou o que o sistema estiver usando.">
        <Field label="Tema">
          <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="system">Seguir o sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </Select>
        </Field>

        <div>
          <span className="label">Cor de destaque</span>
          <div className="flex flex-wrap items-center gap-2">
            {CORES_PADRAO.map((cor) => (
              <button
                key={cor}
                type="button"
                onClick={() => setAccent(cor)}
                title={cor}
                aria-label={cor}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition',
                  accent === cor
                    ? 'border-ink-900 dark:border-white'
                    : 'border-ink-200 dark:border-ink-700',
                )}
                style={{ backgroundColor: cor }}
              />
            ))}
            <ColorWheel
              value={accent}
              onChange={setAccent}
              selected={corPersonalizada}
              title="Cor personalizada"
            />
            {accent !== ACCENT_PADRAO && (
              <button
                type="button"
                onClick={() => setAccent(ACCENT_PADRAO)}
                className="ml-1 inline-flex items-center gap-1 text-xs text-ink-500 transition hover:text-ink-800 dark:hover:text-ink-200"
              >
                <RotateCcw size={12} />
                Restaurar cor
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">
            Pinta os botões, os links e o que estiver selecionado.
          </p>
        </div>
      </Bloco>

      <Bloco title="Espaço de trabalho" description="Como o Notefy abre e o quanto ele mostra.">
        <Chave
          checked={zen}
          onChange={setZen}
          label="Modo zen"
          description="Esconde a barra lateral e os cabeçalhos para sobrar só o conteúdo. Ctrl+. liga e desliga."
        />

        {prefs.data && (
          <Field label="Tela inicial" hint="A primeira tela ao abrir o aplicativo.">
            <Select
              value={prefs.data.default_view}
              onChange={(e) => savePrefs.mutate({ default_view: e.target.value })}
            >
              <option value="dashboard">Início</option>
              <option value="calendar">Calendário</option>
              <option value="board">Quadro</option>
            </Select>
          </Field>
        )}
      </Bloco>
    </>
  )
}

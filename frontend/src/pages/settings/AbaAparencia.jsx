import { RotateCcw } from 'lucide-react'
import { useUI } from '@/context/UIContext'
import { Field, Select } from '@/components/ui'
import ColorWheel from '@/components/ui/ColorWheel'
import { ACCENT_PADRAO, CORES_PADRAO } from '@/lib/accent'
import { FONTES_DA_NOTA, FONTES_DO_APP } from '@/lib/fontes'
import { cn } from '@/lib/utils'
import { Bloco, Chave } from './componentes'
import { usePreferencias } from './index'
import { IDIOMAS, idioma, t, trocarIdioma } from '@/lib/i18n'

/** Opções de fonte, cada uma desenhada nela mesma: escolher pelo olho. */
function EscolhaDeFonte({ rotulo, opcoes, valor, onEscolher, amostra }) {
  return (
    <div role="radiogroup" aria-label={rotulo}>
      <span className="label">{rotulo}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {opcoes.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={valor === f.id}
            onClick={() => onEscolher(f.id)}
            style={{ fontFamily: f.pilha }}
            className={cn(
              'rounded-md border px-3 py-2 text-left transition',
              valor === f.id
                ? 'border-accent-500 bg-accent-50/60 dark:bg-accent-500/10'
                : 'border-ink-200 hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600',
            )}
          >
            <span className="block text-[15px] text-ink-900 dark:text-ink-50">{f.nome}</span>
            {amostra && <span className="mt-0.5 block truncate text-[13px] text-ink-500 dark:text-ink-400">{amostra}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AbaAparencia() {
  const { theme, setTheme, zen, setZen, accent, setAccent, fonteApp, setFonteApp, fonteNota, setFonteNota } = useUI()
  const { prefs, savePrefs } = usePreferencias()

  const corPersonalizada = !CORES_PADRAO.includes(accent)

  return (
    <>
      <Bloco title={t('Idioma')} description={t('O idioma do Notefy. A troca vale na hora, sem perder o que está aberto.')}>
        <Field label={t('Idioma')}>
          <Select value={idioma} onChange={(e) => trocarIdioma(e.target.value)}>
            {IDIOMAS.map((i) => (
              <option key={i.codigo} value={i.codigo}>
                {i.nome}
              </option>
            ))}
          </Select>
        </Field>
      </Bloco>

      <Bloco title={t('Tema')} description={t('Claro, escuro ou o que o sistema estiver usando.')}>
        <Field label={t('Tema')}>
          <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="system">{t('Seguir o sistema')}</option>
            <option value="light">{t('Claro')}</option>
            <option value="dark">{t('Escuro')}</option>
          </Select>
        </Field>

        <div>
          <span className="label">{t('Cor de destaque')}</span>
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
              title={t('Cor personalizada')}
            />
            {accent !== ACCENT_PADRAO && (
              <button
                type="button"
                onClick={() => setAccent(ACCENT_PADRAO)}
                className="ml-1 inline-flex items-center gap-1 text-xs text-ink-500 transition hover:text-ink-800 dark:hover:text-ink-200"
              >
                <RotateCcw size={12} />
                {t('Restaurar cor')}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">
            {t('Pinta os botões, os links e o que estiver selecionado.')}
          </p>
        </div>
      </Bloco>

      <Bloco title={t('Fontes')} description={t('Cada opção aparece escrita na própria fonte. Só fontes do sistema: nada é baixado.')}>
        <EscolhaDeFonte rotulo={t('Fonte do app')} opcoes={FONTES_DO_APP} valor={fonteApp} onEscolher={setFonteApp} />
        <EscolhaDeFonte
          rotulo={t('Fonte das notas')}
          opcoes={FONTES_DA_NOTA}
          valor={fonteNota}
          onEscolher={setFonteNota}
          amostra={t('Bellman-Ford aceita peso negativo; Dijkstra, não.')}
        />
      </Bloco>

      <Bloco title={t('Espaço de trabalho')} description={t('Como o Notefy abre e o quanto ele mostra.')}>
        <Chave
          checked={zen}
          onChange={setZen}
          label={t('Modo zen')}
          description={t('Esconde a barra lateral e os cabeçalhos para sobrar só o conteúdo. Ctrl+. liga e desliga.')}
        />

        {prefs.data && (
          <Field label={t('Tela inicial')} hint={t('A primeira tela ao abrir o aplicativo.')}>
            <Select
              value={prefs.data.default_view}
              onChange={(e) => savePrefs.mutate({ default_view: e.target.value })}
            >
              <option value="dashboard">{t('Início')}</option>
              <option value="calendar">{t('Calendário')}</option>
              <option value="board">{t('Quadro')}</option>
            </Select>
          </Field>
        )}
      </Bloco>
    </>
  )
}

import { useState } from 'react'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useUI } from '@/context/UIContext'
import { Field, Select } from '@/components/ui'
import ColorWheel from '@/components/ui/ColorWheel'
import { ACCENT_PADRAO, CORES_PADRAO } from '@/lib/accent'
import { FONTES_DA_NOTA, FONTES_DO_APP } from '@/lib/fontes'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import useTemas from '@/hooks/useTemas'
import { TEMAS, amostraDoTema, apagarTemaPersonalizado, temaPorId } from '@/lib/temas'
import { cn } from '@/lib/utils'
import { Bloco, Chave } from './componentes'
import EditorDeTema from './EditorDeTema'
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

/** Fundo, texto e destaque de cada opção, para a amostra se parecer com o tema. */
const AMOSTRAS_BASE = [
  { id: 'system', get nome() { return t('Seguir o sistema') }, fundo: 'linear-gradient(135deg, #faf9f8 50%, #0f0e0d 50%)', texto: '#7c766e' },
  { id: 'light', get nome() { return t('Claro') }, fundo: '#ffffff', texto: '#2a2724' },
  { id: 'dark', get nome() { return t('Escuro') }, fundo: '#0f0e0d', texto: '#e9e6e2' },
]

/** Os temas como amostras: um quadradinho com o fundo, duas linhas de texto e o destaque. */
function EscolhaDeTema({ valor, destaque, onEscolher, onCriar, onEditar, onApagar }) {
  const personalizados = useTemas()
  const comoOpcao = (tema) => ({ id: tema.id, nome: tema.nome, ...amostraDoTema(tema), cor: tema.destaque, tema })
  const opcoes = [
    ...AMOSTRAS_BASE.map((o) => ({ ...o, cor: destaque })),
    ...TEMAS.map(comoOpcao),
    ...personalizados.map(comoOpcao),
  ]
  return (
    <div role="radiogroup" aria-label={t('Tema')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {opcoes.map((o) => (
        <div
          key={o.id}
          className={cn(
            'relative overflow-hidden rounded-md border transition',
            valor === o.id ? 'border-accent-500 ring-1 ring-accent-500' : 'border-ink-200 hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600',
          )}
        >
          <button type="button" role="radio" aria-checked={valor === o.id} onClick={() => onEscolher(o)} className="block w-full text-left">
            <span className="flex h-14 gap-1.5 p-2" style={{ background: o.fundo }} aria-hidden>
              {o.painel && <span className="w-5 rounded-sm" style={{ background: o.painel }} />}
              <span className="flex flex-1 flex-col justify-center gap-1">
                <span className="h-1.5 w-3/4 rounded-full" style={{ background: o.texto }} />
                <span className="h-1.5 w-1/2 rounded-full opacity-60" style={{ background: o.texto }} />
                <span className="h-1.5 w-1/3 rounded-full" style={{ background: o.cor }} />
              </span>
            </span>
            <span className={cn('block truncate border-t border-ink-100 px-2 py-1.5 text-xs text-ink-700 dark:border-ink-800 dark:text-ink-200', o.tema?.personalizado && 'pr-14')}>{o.nome}</span>
          </button>
          {o.tema?.personalizado && (
            <span className="absolute bottom-0.5 right-0.5 flex">
              <button
                type="button"
                onClick={() => onEditar(o.tema)}
                title={t('Editar o tema')}
                aria-label={`${t('Editar o tema')}: ${o.nome}`}
                className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
              >
                <Pencil size={12} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onApagar(o.tema)}
                title={t('Apagar o tema')}
                aria-label={`${t('Apagar o tema')}: ${o.nome}`}
                className="rounded p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </span>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={onCriar}
        className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink-300 text-xs text-ink-500 transition hover:border-accent-400 hover:text-accent-700 dark:border-ink-600 dark:text-ink-400 dark:hover:text-accent-400"
      >
        <Plus size={16} aria-hidden />
        {t('Criar tema')}
      </button>
    </div>
  )
}

export default function AbaAparencia() {
  const { theme, setTheme, zen, setZen, accent, setAccent, fonteApp, setFonteApp, fonteNota, setFonteNota } = useUI()
  const { prefs, savePrefs } = usePreferencias()

  const corPersonalizada = !CORES_PADRAO.includes(accent)
  // O editor de tema: `null` fechado, `{ tema }` aberto (`tema: null` é um tema novo).
  const [editor, setEditor] = useState(null)
  const [apagando, setApagando] = useState(null)

  /** Usa o tema e a cor de destaque dele: é o que escolher uma paleta já faz. */
  const usarTema = (id) => {
    const tema = temaPorId(id)
    setTheme(id)
    if (tema) setAccent(tema.destaque)
  }

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

      <Bloco title={t('Tema')} description={t('Claro, escuro, o do sistema, uma paleta no estilo dos editores de código, ou um tema seu, com a cor de cada coisa. Uma paleta traz a cor de destaque dela, que dá para trocar logo abaixo.')}>
        <EscolhaDeTema
          valor={theme}
          destaque={accent}
          onEscolher={(opcao) => {
            setTheme(opcao.id)
            if (opcao.tema) setAccent(opcao.tema.destaque)
          }}
          onCriar={() => setEditor({ tema: null })}
          onEditar={(tema) => setEditor({ tema })}
          onApagar={setApagando}
        />

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

      <EditorDeTema aberto={!!editor} tema={editor?.tema ?? null} onFechar={() => setEditor(null)} onSalvo={usarTema} />
      <ConfirmDialog
        open={!!apagando}
        title={t('Apagar o tema')}
        message={t('O tema “{nome}” será apagado deste aparelho. Se for o que está em uso, o Notefy volta a seguir o sistema.', { nome: apagando?.nome ?? '' })}
        confirmLabel={t('Apagar')}
        onClose={() => setApagando(null)}
        onConfirm={() => apagarTemaPersonalizado(apagando.id)}
      />

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

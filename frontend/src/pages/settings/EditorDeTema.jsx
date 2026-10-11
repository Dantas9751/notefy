import { useMemo, useState } from 'react'
import { AlertTriangle, FileText, Home, Search, Table2 } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import SeletorDeCor from '@/components/ui/SeletorDeCor'
import { escalaEfetiva } from '@/lib/accent'
import { contraste, luminancia, normalizarHex, rgbParaHex } from '@/lib/cor'
import {
  CORES_DE_PARTIDA,
  PAPEIS,
  TEMAS,
  coresDoTema,
  escalaDosPapeis,
  salvarTemaPersonalizado,
  temasPersonalizados,
} from '@/lib/temas'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

const BASES = [
  { id: 'dark', get nome() { return t('Escuro') } },
  { id: 'light', get nome() { return t('Claro') } },
]

const mesmasCores = (a, b) => PAPEIS.every(({ id }) => a[id] === b[id])

/** O que cada papel pinta na prévia, na escala (escuro e claro leem passos diferentes dela). */
function coresDaPrevia(base, cores) {
  const ink = escalaDosPapeis(base, cores)
  const escuro = base === 'dark'
  const accent = escalaEfetiva(cores.destaque)
  const rgb = (canais) => rgbParaHex(canais.split(' ').map(Number))
  return {
    fundo: cores.fundo,
    painel: escuro ? ink[10] : ink[0],
    realce: escuro ? ink[9] : ink[1],
    borda: escuro ? ink[8] : ink[3],
    texto: escuro ? ink[1] : ink[9],
    suave: escuro ? ink[5] : ink[6],
    destaque: rgb(accent[600]),
    destaqueSuave: `rgba(${accent[500].replace(/ /g, ', ')}, ${escuro ? 0.2 : 0.14})`,
    destaqueTexto: rgb(accent[escuro ? 300 : 700]),
  }
}

/**
 * Uma telinha do Notefy pintada com o tema em edição: barra lateral, item
 * selecionado, cartão, campo e botões. Usa a MESMA escala que o app vai usar
 * (`escalaDosPapeis`), não as sete cores cruas, então o que aparece aqui é o
 * que o app vai mostrar, inclusive os tons do meio que a pessoa não escolheu.
 *
 * Cores em estilo direto, e não em classes do Tailwind: as classes `dark:`
 * dependem do tema do app que está ABERTO, e a prévia precisa mostrar o do outro.
 */
function Previa({ base, cores }) {
  const c = useMemo(() => coresDaPrevia(base, cores), [base, cores])
  const item = (Icone, nome, ativo) => (
    <div
      className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px]"
      style={ativo ? { background: c.destaqueSuave, color: c.destaqueTexto } : { color: c.suave }}
    >
      <Icone size={12} aria-hidden />
      {nome}
    </div>
  )
  return (
    <div
      aria-label={t('Pré-visualização')}
      role="img"
      className="flex h-44 overflow-hidden rounded-lg border text-left md:h-60"
      style={{ background: c.fundo, borderColor: c.borda, color: c.texto }}
    >
      <div className="w-[34%] shrink-0 space-y-0.5 border-r p-2" style={{ background: c.painel, borderColor: c.borda }}>
        <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold">
          <span className="h-3 w-3 rounded-sm" style={{ background: c.destaque }} aria-hidden />
          Notefy
        </div>
        {item(Home, t('Início'), true)}
        {item(FileText, t('Notas'), false)}
        {item(Table2, t('Planilhas'), false)}
        <div className="mt-1 rounded px-1.5 py-1 text-[11px]" style={{ background: c.realce, color: c.texto }}>
          {t('Sob o mouse')}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2 p-3">
        <div>
          <div className="truncate text-sm font-semibold">{t('Anotações da semana')}</div>
          <div className="truncate text-[11px]" style={{ color: c.suave }}>
            {t('Texto suave, para legendas e dicas.')}
          </div>
        </div>
        <div className="rounded-md border p-2" style={{ background: c.painel, borderColor: c.borda }}>
          <div className="text-[11px] font-medium">{t('Um cartão')}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: c.suave }}>
            {t('Bellman-Ford aceita peso negativo; Dijkstra, não.')}
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]" style={{ borderColor: c.borda, color: c.suave }}>
          <Search size={11} aria-hidden />
          {t('Buscar')}
        </div>
        <div className="flex gap-1.5">
          <span className="rounded px-2 py-1 text-[11px] font-medium text-white" style={{ background: c.destaque }}>
            {t('Salvar')}
          </span>
          <span className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: c.borda }}>
            {t('Cancelar')}
          </span>
          <span className="px-1 py-1 text-[11px] underline" style={{ color: c.destaqueTexto }}>
            {t('Ver tudo')}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Avisos de leitura difícil. Não impedem nada: a pessoa pode querer assim. */
function avisosDe(base, cores) {
  const c = coresDaPrevia(base, cores)
  const razao = (a, b) => contraste(a, b).toFixed(1)
  const avisos = []
  if (contraste(c.texto, c.fundo) < 4.5) avisos.push(t('O texto tem pouco contraste com o fundo ({razao}:1).', { razao: razao(c.texto, c.fundo) }))
  else if (contraste(c.texto, c.painel) < 4.5) avisos.push(t('O texto tem pouco contraste com os painéis ({razao}:1).', { razao: razao(c.texto, c.painel) }))
  if (contraste(c.suave, c.fundo) < 3) avisos.push(t('O texto suave quase some no fundo ({razao}:1).', { razao: razao(c.suave, c.fundo) }))
  if (contraste('#FFFFFF', c.destaque) < 3) avisos.push(t('O texto branco dos botões fica difícil de ler neste destaque ({razao}:1).', { razao: razao('#FFFFFF', c.destaque) }))
  const claroDemais = base === 'dark' && luminancia(cores.fundo) > 0.3
  const escuroDemais = base === 'light' && luminancia(cores.fundo) < 0.35
  if (claroDemais) avisos.push(t('O fundo é claro para um tema escuro. Se for de propósito, escolha “Claro” em Base.'))
  if (escuroDemais) avisos.push(t('O fundo é escuro para um tema claro. Se for de propósito, escolha “Escuro” em Base.'))
  return avisos
}

/**
 * Criar ou editar um tema personalizado: nome, base (escuro ou claro), as
 * sete cores — cada uma com o seu seletor — e a prévia ao lado, que muda a
 * cada movimento. Nada vale no app até o "Salvar tema".
 *
 * `tema` é o tema a editar (de `temasPersonalizados()`), ou `null` para um novo.
 */
export default function EditorDeTema({ aberto, tema, onFechar, onSalvo }) {
  // O conteúdo só existe enquanto o modal está aberto: montar de novo a cada abertura zera o rascunho.
  if (!aberto) return null
  return <Corpo tema={tema} onFechar={onFechar} onSalvo={onSalvo} />
}

function Corpo({ tema, onFechar, onSalvo }) {
  const [nome, setNome] = useState(tema?.nome ?? '')
  const [base, setBase] = useState(tema?.base ?? 'dark')
  const [cores, setCores] = useState(() => tema?.cores ?? { ...CORES_DE_PARTIDA.dark })

  const avisos = useMemo(() => avisosDe(base, cores), [base, cores])
  const pronto = nome.trim().length > 0

  // Trocar a base leva as cores de fábrica junto, se a pessoa ainda não mexeu nelas.
  const trocarBase = (nova) => {
    if (nova === base) return
    if (mesmasCores(cores, CORES_DE_PARTIDA[base])) setCores({ ...CORES_DE_PARTIDA[nova] })
    setBase(nova)
  }

  const comecarDe = (valor) => {
    if (!valor) return
    if (valor === 'dark' || valor === 'light') {
      setBase(valor)
      setCores({ ...CORES_DE_PARTIDA[valor] })
      return
    }
    const origem = [...TEMAS, ...temasPersonalizados()].find((x) => x.id === valor)
    if (!origem) return
    setBase(origem.base ?? 'dark')
    setCores(coresDoTema(origem))
  }

  const mudarCor = (papel, valor) => {
    const hex = normalizarHex(valor)
    if (hex) setCores((atual) => ({ ...atual, [papel]: hex }))
  }

  const salvar = () => {
    if (!pronto) return
    onSalvo(salvarTemaPersonalizado({ id: tema?.id, nome, base, cores }))
    onFechar()
  }

  const outros = temasPersonalizados().filter((x) => x.id !== tema?.id)

  return (
    <Modal
      open
      onClose={onFechar}
      size="xl"
      title={tema ? t('Editar tema') : t('Criar tema')}
      description={t('Escolha a cor de cada coisa e veja o resultado ao lado. O tema só vale depois de Salvar.')}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar}>
            {t('Cancelar')}
          </Button>
          <Button onClick={salvar} disabled={!pronto}>
            {t('Salvar tema')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
        className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
      >
        <div className="space-y-4">
          <Field label={t('Nome do tema')}>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} placeholder={t('Meu tema')} autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <div role="radiogroup" aria-label={t('Base')}>
              <span className="label">{t('Base')}</span>
              <div className="flex rounded-md border border-ink-200 p-0.5 dark:border-ink-700">
                {BASES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={base === b.id}
                    onClick={() => trocarBase(b.id)}
                    className={cn(
                      'h-8 flex-1 rounded text-sm transition',
                      base === b.id ? 'bg-accent-600 text-white' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
                    )}
                  >
                    {b.nome}
                  </button>
                ))}
              </div>
            </div>
            <Field label={t('Começar de')}>
              <Select value="" onChange={(e) => comecarDe(e.target.value)}>
                <option value="">{t('Escolher…')}</option>
                <option value="dark">{t('Escuro de fábrica')}</option>
                <option value="light">{t('Claro de fábrica')}</option>
                <optgroup label={t('Paletas')}>
                  {TEMAS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </optgroup>
                {outros.length > 0 && (
                  <optgroup label={t('Meus temas')}>
                    {outros.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
          </div>

          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {PAPEIS.map((papel) => (
              <li key={papel.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-ink-800 dark:text-ink-100">{papel.nome}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">{papel.dica}</div>
                </div>
                <SeletorDeCor
                  rotulo={papel.nome}
                  valor={cores[papel.id]}
                  onChange={(valor) => mudarCor(papel.id, valor)}
                  sugestoes={PAPEIS.filter((outro) => outro.id !== papel.id).map((outro) => ({ nome: outro.nome, cor: cores[outro.id] }))}
                  className="shrink-0"
                />
              </li>
            ))}
          </ul>
        </div>

        {/* No celular a prévia vem antes da lista: é o que se quer ver ao abrir. */}
        <div className="order-first space-y-3 md:sticky md:top-0 md:order-none md:self-start">
          <span className="label">{t('Pré-visualização')}</span>
          <Previa base={base} cores={cores} />
          {avisos.length > 0 && (
            <ul className="space-y-1.5 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="status">
              {avisos.map((aviso) => (
                <li key={aviso} className="flex gap-1.5">
                  <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
                  {aviso}
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </Modal>
  )
}

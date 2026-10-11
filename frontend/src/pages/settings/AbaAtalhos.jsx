import { useEffect, useMemo, useState } from 'react'
import { Lock, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { Combinacao } from '@/components/ui/Teclas'
import {
  GRUPOS,
  acaoPorId,
  bindsDe,
  bindsSalvos,
  comboDoEvento,
  conflitoCom,
  grupoDa,
  itensDoGrupo,
  salvarBinds,
  teclasDoCombo,
  validar,
} from '@/lib/atalhos'
import { avisarSucesso } from '@/lib/avisoFlutuante'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/** Os mesmos grupos do Ctrl+/, na mesma ordem. */

const MAXIMO_DE_TECLAS = 3

const mesmas = (a, b) => a.length === b.length && a.every((c, i) => c === b[i])

/**
 * Configurações → Atalhos.
 *
 * Tudo é rascunho até o "Salvar": a pessoa troca quantas teclas quiser, vê
 * o resultado, e só então vale. Cada linha tem a tecla (clique para trocar),
 * um `+` para uma segunda tecla e a seta de voltar ao padrão; "Redefinir
 * todos" volta o rascunho inteiro (e também precisa do Salvar).
 *
 * Uma tecla que outro atalho já usa é recusada com o nome de quem a tem,
 * em vez de trocar escondido: dois atalhos na mesma tecla é um dos dois
 * parando de funcionar sem aviso.
 */
export default function AbaAtalhos() {
  const [rascunho, setRascunho] = useState(bindsSalvos)
  // Quem está esperando uma tecla: `{ id, indice }`. `indice` é a posição da tecla trocada, ou o fim da lista para uma nova.
  const [captura, setCaptura] = useState(null)
  const [aviso, setAviso] = useState(null)

  const [salvo, setSalvo] = useState(bindsSalvos)
  const mudou = useMemo(() => JSON.stringify(sorted(rascunho)) !== JSON.stringify(sorted(salvo)), [rascunho, salvo])
  const trocados = Object.keys(rascunho).length

  /** Grava a lista da linha no rascunho; a que for igual à de fábrica sai dele. */
  const guardar = (id, combos) => {
    setRascunho((atual) => {
      const proximo = { ...atual }
      if (mesmas(combos, acaoPorId(id).padrao)) delete proximo[id]
      else proximo[id] = combos
      return proximo
    })
  }

  // Avisa antes de fechar a janela com troca sem salvar.
  useEffect(() => {
    if (!mudou) return undefined
    const avisar = (e) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [mudou])

  // A captura vê o teclado ANTES de todo mundo (fase de captura) e o engole: apertar Ctrl+K aqui
  // escolhe a tecla, não abre a busca.
  useEffect(() => {
    if (!captura) return undefined
    const { id, indice } = captura
    const ouvir = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCaptura(null)
        setAviso(null)
        return
      }
      const combo = comboDoEvento(e)
      if (!combo) return
      const conferido = validar(id, combo)
      if (conferido.erro) {
        setAviso({ id, texto: conferido.erro })
        return
      }
      const dono = conflitoCom(id, conferido.combo, rascunho)
      if (dono) {
        setAviso({ id, texto: t('Já é de “{nome}” ({grupo}). Troque a tecla de lá primeiro.', { nome: acaoPorId(dono).texto, grupo: grupoDa(dono).titulo }) })
        return
      }
      const atuais = [...bindsDe(id, rascunho)]
      // Repetir uma tecla que a própria linha já tem não muda nada.
      if (!atuais.includes(conferido.combo)) {
        atuais[indice] = conferido.combo
        guardar(id, atuais)
      }
      setCaptura(null)
      setAviso(null)
    }
    window.addEventListener('keydown', ouvir, true)
    return () => window.removeEventListener('keydown', ouvir, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captura, rascunho])

  const trocar = (id, indice) => {
    setAviso(null)
    setCaptura({ id, indice })
  }

  const remover = (id, indice) => {
    setCaptura(null)
    setAviso(null)
    guardar(id, bindsDe(id, rascunho).filter((_, i) => i !== indice))
  }

  const voltarAoPadrao = (id) => {
    const padrao = acaoPorId(id).padrao
    // Outra linha pode ter ficado com a tecla de fábrica desta, enquanto esta era outra.
    const dono = padrao.map((combo) => conflitoCom(id, combo, rascunho)).find(Boolean)
    if (dono) {
      setAviso({ id, texto: t('A tecla de fábrica já é de “{nome}” ({grupo}). Troque a tecla de lá primeiro.', { nome: acaoPorId(dono).texto, grupo: grupoDa(dono).titulo }) })
      return
    }
    setCaptura(null)
    setAviso(null)
    guardar(id, padrao)
  }

  const salvar = () => {
    salvarBinds(rascunho)
    setCaptura(null)
    setAviso(null)
    avisarSucesso(t('Atalhos salvos.'))
    // O que vale agora é o que acabou de ser salvo.
    setSalvo(bindsSalvos())
    setRascunho(bindsSalvos())
  }

  return (
    <>
      <section>
        <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">{t('Atalhos de teclado')}</h2>
        <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
          {t('Clique numa tecla para trocá-la e aperte a nova combinação (Esc cancela). As trocas só valem depois de Salvar, e ficam neste aparelho.')}
        </p>
      </section>

      {/* Fica à vista enquanto a lista rola: salvar é o fim de uma lista longa. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
        <span className={cn('text-sm', mudou ? 'text-amber-700 dark:text-amber-400' : 'text-ink-500 dark:text-ink-400')} role="status">
          {mudou ? t('Alterações sem salvar') : trocados ? t('{n} atalhos trocados', { n: trocados }) : t('Todos nas teclas de fábrica')}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled={!trocados} onClick={() => { setCaptura(null); setAviso(null); setRascunho({}) }}>
            <RotateCcw size={14} aria-hidden />
            {t('Redefinir todos')}
          </Button>
          <Button variant="ghost" size="sm" disabled={!mudou} onClick={() => { setCaptura(null); setAviso(null); setRascunho(salvo) }}>
            {t('Descartar')}
          </Button>
          <Button size="sm" disabled={!mudou} onClick={salvar}>
            {t('Salvar')}
          </Button>
        </span>
      </div>

      {GRUPOS.map((grupo) => (
        <section key={grupo.id} aria-label={grupo.titulo}>
          <h3 className="secao mb-1">{grupo.titulo}</h3>
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {itensDoGrupo(grupo, rascunho).map((item) => (
              <Linha
                key={item.chave}
                item={item}
                combosBrutos={item.id ? bindsDe(item.id, rascunho) : []}
                trocado={!!item.id && !!rascunho[item.id]}
                captura={item.id && captura?.id === item.id ? captura : null}
                aviso={item.id && aviso?.id === item.id ? aviso.texto : null}
                onTrocar={trocar}
                onRemover={remover}
                onPadrao={voltarAoPadrao}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

/** Para comparar dois mapas sem depender da ordem das chaves. */
const sorted = (mapa) => Object.fromEntries(Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b)))

function Linha({ item, combosBrutos, trocado, captura, aviso, onTrocar, onRemover, onPadrao }) {
  if (item.fixo) {
    return (
      <li className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className="text-ink-600 dark:text-ink-300">{item.texto}</span>
        <span className="flex items-center gap-2" title={t('Esta tecla não troca')}>
          <Combinacao teclas={item.combos[0]} className="opacity-70" />
          <Lock size={12} className="text-ink-300 dark:text-ink-600" aria-label={t('Esta tecla não troca')} />
        </span>
      </li>
    )
  }

  const serie = acaoPorId(item.id).serie
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <span className={cn('text-ink-700 dark:text-ink-200', trocado && 'font-medium')}>{item.texto}</span>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {combosBrutos.map((combo, i) =>
            captura?.indice === i ? (
              <Aguardando key={i} />
            ) : (
              <span key={combo} className="inline-flex items-center rounded-md ring-1 ring-transparent focus-within:ring-accent-400 hover:bg-ink-50 dark:hover:bg-ink-800">
                <button
                  type="button"
                  onClick={() => onTrocar(item.id, i)}
                  title={t('Trocar esta tecla')}
                  aria-label={`${t('Trocar esta tecla')}: ${teclasDoCombo(combo, serie).join(' ')}`}
                  className="rounded-md px-1 py-0.5 outline-none"
                >
                  <Combinacao teclas={teclasDoCombo(combo, serie)} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemover(item.id, i)}
                  title={t('Tirar esta tecla')}
                  aria-label={t('Tirar esta tecla')}
                  className="rounded p-0.5 text-ink-400 opacity-50 outline-none transition hover:text-red-500 hover:opacity-100 focus-visible:text-red-500 focus-visible:opacity-100"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            ),
          )}
          {captura && captura.indice >= combosBrutos.length && <Aguardando />}
          {!serie && !captura && combosBrutos.length < MAXIMO_DE_TECLAS && (
            <button
              type="button"
              onClick={() => onTrocar(item.id, combosBrutos.length)}
              title={combosBrutos.length ? t('Adicionar outra tecla') : t('Escolher uma tecla')}
              aria-label={combosBrutos.length ? t('Adicionar outra tecla') : t('Escolher uma tecla')}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-1.5 py-0.5 text-xs text-ink-500 transition hover:border-accent-400 hover:text-accent-700 dark:border-ink-600 dark:hover:text-accent-400"
            >
              <Plus size={12} aria-hidden />
              {!combosBrutos.length && t('sem tecla')}
            </button>
          )}
          {trocado && (
            <button
              type="button"
              onClick={() => onPadrao(item.id)}
              title={t('Voltar ao padrão')}
              aria-label={t('Voltar ao padrão')}
              className="ml-1 rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
            >
              <RotateCcw size={13} aria-hidden />
            </button>
          )}
        </span>
      </div>
      {aviso && (
        <p role="alert" className="mt-1 text-right text-xs text-red-600 dark:text-red-400">
          {aviso}
        </p>
      )}
    </li>
  )
}

function Aguardando() {
  return (
    <span className="animate-pulse rounded-md border border-accent-400 bg-accent-50 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-500/15 dark:text-accent-200" role="status">
      {t('Aperte a combinação…')}
    </span>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, StickyNote } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { usePreferencias } from '@/hooks/usePreferencias'
import DestinationModal from '@/components/modals/DestinationModal'
import Bloco from './Bloco'
import { tituloDoRascunho } from '@/lib/inicio'
import { escaparTexto } from '@/lib/sanitizar'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

const MAX_RASCUNHO = 20000

/**
 * Bloco de rascunho — o "scratch pad" do Evernote.
 *
 * Um papel sempre aberto no Início para o número de telefone, a ideia do
 * banho, a lista do mercado: escrever aqui não pede pasta nem título. Se
 * crescer, "Virar nota" leva o texto para uma nota de verdade e limpa o
 * papel. Salva sozinho, na conta (preferências), e não no aparelho: o
 * mesmo rascunho em qualquer lugar que a pessoa entrar.
 */
export default function BlocoRascunho({ className }) {
  const navigate = useNavigate()
  const { prefs, salvar } = usePreferencias()
  const [texto, setTexto] = useState(prefs.scratch_pad ?? '')
  const [estado, setEstado] = useState('salvo')
  const [escolhendo, setEscolhendo] = useState(false)
  const [erro, setErro] = useState(null)
  const timer = useRef(null)
  const pendente = useRef(null)

  // Chegou um rascunho diferente de fora (outra janela salvou) e não há
  // digitação em curso aqui: adota.
  useEffect(() => {
    if (pendente.current === null && (prefs.scratch_pad ?? '') !== texto) setTexto(prefs.scratch_pad ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.scratch_pad])

  const gravar = async (valor) => {
    setEstado('salvando')
    try {
      await salvar({ scratch_pad: valor })
      if (pendente.current === valor) pendente.current = null
      setEstado('salvo')
    } catch (err) {
      setEstado('erro')
      setErro(extractError(err))
    }
  }

  // Sair da tela dentro da pausa do autosave não pode jogar a última frase fora.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (pendente.current !== null) api.patch('/me/preferences/', { scratch_pad: pendente.current }).catch(() => {})
    },
    [],
  )

  const mudar = (valor) => {
    setTexto(valor)
    setErro(null)
    setEstado('digitando')
    pendente.current = valor
    clearTimeout(timer.current)
    timer.current = setTimeout(() => gravar(valor), 800)
  }

  const virarNota = async (pasta) => {
    setEscolhendo(false)
    setErro(null)
    const html = texto
      .split('\n')
      .map((linha) => (linha.trim() ? `<p>${escaparTexto(linha)}</p>` : '<p><br></p>'))
      .join('')
    try {
      const { data } = await api.post('/documents/', {
        kind: 'note',
        folder: pasta,
        title: tituloDoRascunho(texto) || t('Rascunho'),
        status: 'draft',
        data: { sections: [{ id: 's1', type: 'text', html }] },
      })
      clearTimeout(timer.current)
      pendente.current = null
      setTexto('')
      await gravar('')
      window.dispatchEvent(new Event('notefy:moved'))
      navigate(`/notes/${data.id}`)
    } catch (err) {
      setErro(extractError(err))
    }
  }

  return (
    <Bloco
      titulo={t('Bloco de rascunho')}
      icon={StickyNote}
      className={className}
      corpoClassName="flex flex-col p-0"
      acoes={
        <>
          <span className={cn('text-[10px] text-ink-400', estado === 'erro' && 'text-red-500')}>
            {estado === 'salvando' ? t('salvando...') : estado === 'salvo' && texto ? t('salvo') : ''}
          </span>
          <button
            type="button"
            onClick={() => setEscolhendo(true)}
            disabled={!texto.trim()}
            title={t('Levar este texto para uma nota nova e limpar o rascunho')}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent-700 transition hover:bg-accent-50 disabled:opacity-40 dark:text-accent-300 dark:hover:bg-accent-500/10"
          >
            <FilePlus2 size={12} />
            {t('Virar nota')}
          </button>
        </>
      }
    >
      <textarea
        value={texto}
        onChange={(e) => mudar(e.target.value)}
        maxLength={MAX_RASCUNHO}
        placeholder={t('Anote rápido: um número, uma ideia, a lista do mercado...')}
        aria-label={t('Bloco de rascunho')}
        className="min-h-[11rem] w-full flex-1 resize-none rounded-b-lg border-0 bg-amber-50/70 px-4 py-3 text-[14px] leading-relaxed text-ink-800 placeholder:text-ink-400 focus:ring-0 dark:bg-amber-400/[0.06] dark:text-ink-100"
      />
      {erro && <p className="px-4 py-2 text-xs text-red-500">{erro}</p>}

      <DestinationModal
        open={escolhendo}
        kind="note"
        title={t('Onde guardar a nota')}
        confirmLabel={t('Criar nota')}
        onClose={() => setEscolhendo(false)}
        onPick={virarNota}
      />
    </Bloco>
  )
}

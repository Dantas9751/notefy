import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { emCelular, noDesktop } from '@/lib/desktop'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/** Só o app do computador desenha a própria moldura; no navegador e no celular não há janela a controlar. */
export const temMolduraPropria = () => noDesktop() && !emCelular()

async function janela() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

function Botao({ rotulo, onClick, perigo, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        'flex w-11 shrink-0 items-center justify-center text-ink-500 transition-colors dark:text-ink-400',
        perigo ? 'hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white' : 'hover:bg-ink-200/70 hover:text-ink-800 dark:hover:bg-ink-800 dark:hover:text-ink-100',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Minimizar, maximizar/restaurar e fechar, no canto de cima à direita da
 * própria faixa de abas — a janela do app não tem a barra de título do
 * Windows (`decorations: false`), que destoava do tema. O ícone do meio
 * acompanha o estado (maximizada ou não), inclusive quando a mudança vem
 * do duplo clique na faixa ou do atalho do Windows.
 */
export default function ControlesDaJanela({ className }) {
  const [maximizada, setMaximizada] = useState(false)

  useEffect(() => {
    if (!temMolduraPropria()) return undefined
    let vivo = true
    let desligar
    janela().then(async (w) => {
      const ler = async () => {
        const agora = await w.isMaximized()
        if (vivo) setMaximizada(agora)
      }
      await ler()
      desligar = await w.onResized(ler)
      if (!vivo) desligar()
    })
    return () => {
      vivo = false
      desligar?.()
    }
  }, [])

  if (!temMolduraPropria()) return null

  return (
    <div className={cn('flex shrink-0 items-stretch', className)}>
      <Botao rotulo={t('Minimizar')} onClick={() => janela().then((w) => w.minimize())}>
        <Minus size={15} />
      </Botao>
      <Botao rotulo={maximizada ? t('Restaurar') : t('Maximizar')} onClick={() => janela().then((w) => w.toggleMaximize())}>
        {maximizada ? <Copy size={12} className="-scale-x-100" /> : <Square size={12} />}
      </Botao>
      <Botao rotulo={t('Fechar')} perigo onClick={() => janela().then((w) => w.close())}>
        <X size={16} />
      </Botao>
    </div>
  )
}

/**
 * A faixa de cima das telas que ficam fora do layout principal (entrar,
 * criar conta, carregando, página não encontrada). Sem ela, a janela sem a
 * barra do Windows abria no login sem nada para arrastar, minimizar ou
 * fechar.
 */
export function FaixaDaJanela() {
  if (!temMolduraPropria()) return null
  return (
    <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-50 flex h-9 justify-end">
      <ControlesDaJanela />
    </div>
  )
}

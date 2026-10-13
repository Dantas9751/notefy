import { useEffect, useState } from 'react'
import { emCelular, noDesktop } from '@/lib/desktop'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/** Só o app do computador desenha a própria moldura; no navegador e no celular não há janela a controlar. */
export const temMolduraPropria = () => noDesktop() && !emCelular()

async function janela() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

/**
 * Glifos pequenos e macios: traço de 1,8 px com pontas e cantos
 * arredondados — o quadrado de canto redondo e o X de pontas redondas.
 *
 * Caixa de 10 px, menos o restaurar, que tem 12: são dois quadrados, e com
 * esse traço numa caixa de 10 eles se fundiam num borrão mais pesado que o
 * quadrado do maximizar. Com 12, o da frente fica quase do tamanho dele e
 * sobra um vão limpo entre os dois.
 */
const GLIFOS = {
  minimizar: { caixa: 10, desenho: <path d="M0.9 5h8.2" /> },
  maximizar: { caixa: 10, desenho: <rect x="1" y="1" width="8" height="8" rx="2.2" /> },
  restaurar: {
    caixa: 12,
    desenho: (
      <>
        <rect x="1" y="4" width="7" height="7" rx="2" />
        <path d="M4 1h5a2 2 0 0 1 2 2v5" />
      </>
    ),
  },
  fechar: { caixa: 10, desenho: <path d="M1 1l8 8m0-8l-8 8" /> },
}

function Glifo({ nome }) {
  const { caixa, desenho } = GLIFOS[nome]
  return (
    <svg width={caixa} height={caixa} viewBox={`0 0 ${caixa} ${caixa}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {desenho}
    </svg>
  )
}

function Botao({ rotulo, onClick, perigo, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        'flex h-7 w-[26px] shrink-0 items-center justify-center text-ink-600 transition-colors dark:text-ink-300',
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
 *
 * Sempre 26 × 28 px, no alto, como os botões de janela do Windows: na janela
 * estreita o cabeçalho é mais alto (o de celular), e esticados nele os botões
 * ficavam com outra cara da faixa de abas da janela maximizada.
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
    <div className={cn('flex shrink-0 items-start self-start', className)}>
      <Botao rotulo={t('Minimizar')} onClick={() => janela().then((w) => w.minimize())}>
        <Glifo nome="minimizar" />
      </Botao>
      <Botao rotulo={maximizada ? t('Restaurar') : t('Maximizar')} onClick={() => janela().then((w) => w.toggleMaximize())}>
        <Glifo nome={maximizada ? 'restaurar' : 'maximizar'} />
      </Botao>
      <Botao rotulo={t('Fechar')} perigo onClick={() => janela().then((w) => w.close())}>
        <Glifo nome="fechar" />
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
    <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-50 flex h-7 justify-end">
      <ControlesDaJanela />
    </div>
  )
}

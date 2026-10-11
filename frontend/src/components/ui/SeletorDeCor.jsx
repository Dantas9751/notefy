import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pipette } from 'lucide-react'
import { hexParaRgb, hsvParaRgb, normalizarHex, rgbParaHex, rgbParaHsv } from '@/lib/cor'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Escolher uma cor qualquer: o quadrado de saturação e brilho, a faixa de
 * matiz e o código hexadecimal, num popup ao lado do botão.
 *
 * Existe porque o `<input type="color">` nativo abre um seletor diferente em
 * cada navegador (e no app de desktop), sem o código à vista nem como mostrar
 * as outras cores do tema ao lado. O `ColorWheel` continua valendo para
 * quem só quer "outra cor" numa linha de cores prontas.
 *
 * Cada movimento chama `onChange` com a cor nova: quem usa mostra o resultado
 * ao vivo (a prévia do tema).
 */

const LARGURA = 248
const MARGEM = 8

/** Hex → HSV, guardando o matiz quando o cinza o apaga (saturação 0 não tem matiz). */
const paraHsv = (hex) => rgbParaHsv(hexParaRgb(hex))
const paraHex = (hsv) => rgbParaHex(hsvParaRgb(hsv))

function Popup({ ancora, valor, onChange, onFechar, sugestoes, rotulo }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  const [hsv, setHsv] = useState(() => paraHsv(valor))
  const [texto, setTexto] = useState(valor)

  // Debaixo do botão, ou em cima se não couber; sempre dentro da tela.
  useLayoutEffect(() => {
    const a = ancora.getBoundingClientRect()
    const altura = ref.current?.offsetHeight ?? 0
    const left = Math.min(Math.max(MARGEM, a.left), window.innerWidth - LARGURA - MARGEM)
    const cabeEmbaixo = a.bottom + 6 + altura <= window.innerHeight - MARGEM
    setPos({ left, top: cabeEmbaixo ? a.bottom + 6 : Math.max(MARGEM, a.top - 6 - altura) })
  }, [ancora])

  // Fora, Esc ou rolar o fundo fecham. O Esc é engolido aqui: sem isso fechava também a janela de trás.
  useEffect(() => {
    const fora = (e) => !ref.current?.contains(e.target) && !ancora.contains(e.target) && onFechar()
    const tecla = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onFechar()
      ancora.focus()
    }
    window.addEventListener('pointerdown', fora, true)
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('pointerdown', fora, true)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [ancora, onFechar])

  // Uma cor que veio de fora (outra sugestão, o campo hex) atualiza o seletor; a que ele mesmo emitiu, não.
  useEffect(() => {
    setHsv((atual) => (paraHex(atual) === valor ? atual : paraHsv(valor)))
    setTexto(valor)
  }, [valor])

  const mudar = (proximo) => {
    setHsv(proximo)
    onChange(paraHex(proximo))
  }

  /** Arrastar dentro do quadrado: x é a saturação, y o brilho. */
  const arrastarQuadrado = (e) => {
    const caixa = e.currentTarget.getBoundingClientRect()
    const mover = (ev) =>
      mudar({
        ...hsv,
        s: Math.min(1, Math.max(0, (ev.clientX - caixa.left) / caixa.width)),
        v: 1 - Math.min(1, Math.max(0, (ev.clientY - caixa.top) / caixa.height)),
      })
    e.currentTarget.setPointerCapture(e.pointerId)
    mover(e)
    const alvo = e.currentTarget
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover)
      alvo.removeEventListener('pointerup', soltar)
      alvo.removeEventListener('pointercancel', soltar)
    }
    alvo.addEventListener('pointermove', mover)
    alvo.addEventListener('pointerup', soltar)
    alvo.addEventListener('pointercancel', soltar)
  }

  const teclasDoQuadrado = (e) => {
    const passo = e.shiftKey ? 0.1 : 0.02
    const delta = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, passo], ArrowDown: [0, -passo] }[e.key]
    if (!delta) return
    e.preventDefault()
    mudar({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + delta[0])), v: Math.min(1, Math.max(0, hsv.v + delta[1])) })
  }

  const digitar = (e) => {
    setTexto(e.target.value)
    const hex = normalizarHex(e.target.value)
    if (hex) {
      setHsv(paraHsv(hex))
      onChange(hex)
    }
  }

  const contaGotas = typeof window !== 'undefined' && 'EyeDropper' in window
  const pegarDaTela = async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open()
      const hex = normalizarHex(sRGBHex)
      if (hex) {
        setHsv(paraHsv(hex))
        onChange(hex)
      }
    } catch {
      // Cancelou (Esc) ou o sistema não deixou: fica a cor que estava.
    }
  }

  const cor = paraHex(hsv)

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={rotulo}
      style={{ left: pos.left, top: pos.top, width: LARGURA }}
      className="fixed z-[70] space-y-3 rounded-xl border border-ink-200 bg-white p-3 shadow-pop dark:border-ink-700 dark:bg-ink-900"
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label={t('Saturação e brilho')}
        aria-valuetext={`${Math.round(hsv.s * 100)}% / ${Math.round(hsv.v * 100)}%`}
        aria-valuenow={Math.round(hsv.v * 100)}
        onPointerDown={arrastarQuadrado}
        onKeyDown={teclasDoQuadrado}
        className="relative h-36 w-full cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        style={{
          backgroundColor: `hsl(${hsv.h} 100% 50%)`,
          backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: cor }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={Math.round(hsv.h)}
        onChange={(e) => mudar({ ...hsv, h: Number(e.target.value) })}
        aria-label={t('Matiz')}
        className="h-3 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,.45)]"
        style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
      />

      <div className="flex items-center gap-2">
        <span className="h-8 w-8 shrink-0 rounded-md border border-ink-200 dark:border-ink-700" style={{ backgroundColor: cor }} aria-hidden />
        <input
          value={texto}
          onChange={digitar}
          onBlur={() => setTexto(cor)}
          spellCheck={false}
          maxLength={7}
          aria-label={t('Código da cor')}
          aria-invalid={!normalizarHex(texto)}
          className={cn(
            'h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 font-mono text-sm uppercase text-ink-800 outline-none focus:border-accent-500 dark:text-ink-100',
            normalizarHex(texto) ? 'border-ink-200 dark:border-ink-700' : 'border-red-400',
          )}
        />
        {contaGotas && (
          <button
            type="button"
            onClick={pegarDaTela}
            title={t('Pegar uma cor da tela')}
            aria-label={t('Pegar uma cor da tela')}
            className="grid h-8 w-8 place-items-center rounded-md border border-ink-200 text-ink-500 transition hover:bg-ink-100 dark:border-ink-700 dark:hover:bg-ink-800"
          >
            <Pipette size={14} aria-hidden />
          </button>
        )}
      </div>

      {sugestoes?.length > 0 && (
        <div>
          <span className="mb-1 block text-[11px] text-ink-500 dark:text-ink-400">{t('Cores deste tema')}</span>
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((s) => (
              <button
                key={s.nome}
                type="button"
                title={`${s.nome} ${s.cor}`}
                aria-label={`${s.nome} ${s.cor}`}
                onClick={() => onChange(s.cor)}
                className="h-6 w-6 rounded-md border border-ink-200 dark:border-ink-600"
                style={{ backgroundColor: s.cor }}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

/**
 * O botão da cor (um quadradinho com o código ao lado) e o popup que ele abre.
 * `sugestoes`: `[{ nome, cor }]`, as outras cores do tema, para combinar.
 */
export default function SeletorDeCor({ valor, onChange, rotulo, sugestoes, className }) {
  const [aberto, setAberto] = useState(false)
  const botaoRef = useRef(null)
  const fechar = useCallback(() => setAberto(false), [])

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`${rotulo}: ${valor}`}
        className={cn(
          'flex items-center gap-2 rounded-md border border-ink-200 py-1 pl-1 pr-2 text-left transition hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600',
          aberto && 'border-accent-500 ring-1 ring-accent-500 dark:border-accent-500',
          className,
        )}
      >
        <span className="h-7 w-7 shrink-0 rounded border border-black/10 dark:border-white/15" style={{ backgroundColor: valor }} aria-hidden />
        <span className="font-mono text-xs uppercase text-ink-600 dark:text-ink-300">{valor}</span>
      </button>
      {aberto && <Popup ancora={botaoRef.current} valor={valor} onChange={onChange} onFechar={fechar} sugestoes={sugestoes} rotulo={rotulo} />}
    </>
  )
}

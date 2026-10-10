import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SquareFunction } from 'lucide-react'
import { assinaturaDe, contextoDoCursor, sugerirFuncoes } from '@/lib/formula'
import { idioma, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const nomeNoIdioma = (funcao) => (String(idioma).startsWith('en') ? funcao.en : funcao.pt)

/**
 * Campo de texto de uma célula — o mesmo na célula e na barra de fórmula.
 *
 * Quando o texto é fórmula, ajuda a escrever: o autocompletar oferece as
 * funções que começam com o que se digita (Tab ou Enter aceita, setas
 * escolhem, Esc fecha), e dentro dos parênteses mostra os argumentos da
 * função, como o Excel e o Google Planilhas fazem.
 *
 * As teclas que a lista não usa vão para `onTeclar`: é a planilha quem
 * decide o que Enter, Tab e as setas fazem com a célula.
 */
export function CampoDeFormula({ valor, onMudar, onTeclar, campoRef, className, ...resto }) {
  const interno = useRef(null)
  const ref = campoRef ?? interno
  const [cursor, setCursor] = useState(null)
  const [escolhida, setEscolhida] = useState(0)
  const [fechada, setFechada] = useState(false)
  const [caixa, setCaixa] = useState(null)

  const texto = String(valor ?? '')
  const contexto = cursor === null ? { palavra: null, dentroDe: null } : contextoDoCursor(texto, cursor)
  const sugestoes = !fechada && contexto.palavra ? sugerirFuncoes(contexto.palavra.texto) : []
  const dica = sugestoes.length === 0 && contexto.dentroDe ? contexto.dentroDe : null
  const aberta = sugestoes.length > 0 || !!dica

  // Onde desenhar a lista: logo abaixo do campo, medido depois de pintar.
  useLayoutEffect(() => {
    if (!aberta || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setCaixa((antes) => (antes && antes.left === r.left && antes.top === r.bottom ? antes : { left: r.left, top: r.bottom }))
  }, [aberta, texto, ref])

  const lerCursor = (e) => setCursor(e.currentTarget.selectionStart)

  const aceitar = (funcao) => {
    const nome = nomeNoIdioma(funcao)
    const inicio = contexto.palavra.inicio
    const depois = texto.slice(cursor)
    const novo = `${texto.slice(0, inicio)}${nome}${depois.startsWith('(') ? '' : '('}${depois}`
    const posicao = inicio + nome.length + 1
    onMudar(novo)
    setCursor(posicao)
    cursorPedido.current = posicao
  }

  // O cursor vai para depois do "(" só quando o texto novo já está no
  // campo: antes disso o React ainda escreveria por cima.
  const cursorPedido = useRef(null)
  useLayoutEffect(() => {
    if (cursorPedido.current === null || !ref.current) return
    ref.current.setSelectionRange(cursorPedido.current, cursorPedido.current)
    cursorPedido.current = null
  })

  const teclar = (e) => {
    if (sugestoes.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const passo = e.key === 'ArrowDown' ? 1 : -1
        setEscolhida((i) => (i + passo + sugestoes.length) % sugestoes.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        aceitar(sugestoes[Math.min(escolhida, sugestoes.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        // O primeiro Esc fecha só a lista; o segundo cancela a edição.
        e.preventDefault()
        setFechada(true)
        return
      }
    }
    onTeclar?.(e)
  }

  return (
    <>
      <input
        ref={ref}
        value={texto}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          onMudar(e.target.value)
          setCursor(e.target.selectionStart)
          setEscolhida(0)
          setFechada(false)
        }}
        onKeyDown={teclar}
        onSelect={lerCursor}
        onFocus={(e) => {
          lerCursor(e)
          resto.onFocus?.(e)
        }}
        onBlur={(e) => {
          setCursor(null)
          resto.onBlur?.(e)
        }}
        className={cn(texto.startsWith('=') && 'font-mono text-[13px]', className)}
        {...semEventos(resto)}
      />
      {aberta &&
        caixa &&
        createPortal(
          <div
            style={{ left: caixa.left, top: caixa.top + 4 }}
            // `mousedown` com preventDefault: clicar na lista não pode tirar
            // o foco do campo, senão a edição termina antes de aceitar.
            onMouseDown={(e) => e.preventDefault()}
            className="fixed z-[80] w-72 overflow-hidden rounded-md border border-ink-200 bg-white text-xs shadow-pop dark:border-ink-700 dark:bg-ink-900"
          >
            {dica ? (
              <div className="px-2.5 py-2">
                <code className="block font-mono text-[11.5px] text-accent-700 dark:text-accent-300">{assinaturaDe(dica)}</code>
                <span className="text-ink-500 dark:text-ink-400">{dica.desc}</span>
              </div>
            ) : (
              <ul role="listbox" aria-label={t('Funções')}>
                {sugestoes.map((funcao, i) => (
                  <li
                    key={funcao.pt}
                    role="option"
                    aria-selected={i === escolhida}
                    onClick={() => aceitar(funcao)}
                    className={cn(
                      'cursor-pointer px-2.5 py-1.5',
                      i === escolhida ? 'bg-accent-50 dark:bg-accent-500/15' : 'hover:bg-ink-50 dark:hover:bg-ink-800',
                    )}
                  >
                    <code className="font-mono text-[11.5px] font-medium text-ink-800 dark:text-ink-100">{assinaturaDe(funcao)}</code>
                    <span className="block text-ink-500 dark:text-ink-400">{funcao.desc}</span>
                  </li>
                ))}
                <li className="border-t border-ink-100 px-2.5 py-1 text-[10.5px] text-ink-400 dark:border-ink-800">
                  {t('Tab ou Enter para escolher')}
                </li>
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

/** Props de evento que o campo já trata por conta própria (e repassa). */
function semEventos({ onFocus: _f, onBlur: _b, ...props }) {
  return props
}

/**
 * Barra de fórmula: o endereço da célula, e o que ela guarda de verdade.
 *
 * A célula mostra o RESULTADO (`12`); a barra mostra o que foi escrito
 * (`=A1+B1`). Sem ela não havia como saber se um número era digitado ou
 * calculado — nem ver a fórmula sem entrar na edição. Editar aqui ou na
 * célula é a mesma edição.
 *
 * O campo de endereço também leva a qualquer célula: escrever "C10" e
 * apertar Enter seleciona C10.
 */
export function BarraDeFormula({
  endereco,
  valor,
  somenteLeitura,
  erro,
  resumo,
  campoRef,
  onIrPara,
  onComecar,
  onMudar,
  onTeclar,
  onSair,
}) {
  const [destino, setDestino] = useState(null)

  return (
    <div className="flex items-stretch border-b border-ink-100 text-sm dark:border-ink-800">
      <input
        value={destino ?? endereco}
        onFocus={(e) => {
          setDestino(endereco)
          e.target.select()
        }}
        onChange={(e) => setDestino(e.target.value.toUpperCase())}
        onBlur={() => setDestino(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onIrPara?.(destino ?? endereco)
            setDestino(null)
          }
          if (e.key === 'Escape') {
            setDestino(null)
            onSair?.()
          }
        }}
        aria-label={t('Endereço da célula')}
        title={t('Escreva um endereço (ex.: C10) e aperte Enter para ir até ele')}
        className="w-20 shrink-0 border-0 border-r border-ink-100 bg-transparent px-2 py-1.5 text-center font-mono text-xs text-ink-600 focus:bg-ink-50 focus:outline-none dark:border-ink-800 dark:text-ink-300 dark:focus:bg-ink-900"
      />
      <span className="flex shrink-0 items-center px-2 text-ink-400" aria-hidden>
        <SquareFunction size={14} />
      </span>
      <div className="relative min-w-0 flex-1">
        <CampoDeFormula
          campoRef={campoRef}
          valor={valor}
          readOnly={somenteLeitura}
          onMudar={onMudar}
          onTeclar={onTeclar}
          // Quem decide é a planilha, pela ref da edição: a prop `editando`
          // pode estar um render atrasada quando o foco vem de uma célula
          // que acabou de gravar.
          onFocus={() => !somenteLeitura && onComecar?.()}
          onBlur={() => onSair?.('blur')}
          aria-label={t('Conteúdo da célula')}
          placeholder={somenteLeitura ? '' : t('Escreva um valor ou uma fórmula, como =A1+B1')}
          className="h-full w-full border-0 bg-transparent px-1 py-1.5 text-ink-800 placeholder:text-ink-300 focus:outline-none dark:text-ink-100 dark:placeholder:text-ink-600"
        />
      </div>
      {erro ? (
        <span className="flex max-w-[45%] shrink-0 items-center truncate px-3 text-xs text-red-600 dark:text-red-400" title={erro}>
          {erro}
        </span>
      ) : (
        resumo && (
          <span className="flex shrink-0 items-center gap-3 px-3 text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
            {resumo.map(([rotulo, texto]) => (
              <span key={rotulo}>
                {rotulo} <strong className="font-medium text-ink-700 dark:text-ink-200">{texto}</strong>
              </span>
            ))}
          </span>
        )
      )}
    </div>
  )
}

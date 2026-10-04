import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { MAX_COLUNAS_TABELA, MAX_ITENS_SECAO } from '@/lib/limites'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * Tabela da página.
 *
 * A primeira linha é o cabeçalho — sem campo separado declarando isso.
 * Um `header: true` seria um segundo lugar guardando a mesma verdade, e
 * os dois sairiam do ar assim que alguém removesse a linha de cima.
 *
 * A largura também não é declarada: é a da linha mais larga, e as curtas
 * são completadas na hora de desenhar. Guardar um `columns: 4` ao lado
 * das linhas é a mesma armadilha, com o agravante de a tabela poder
 * ficar com célula inacessível se os dois divergirem.
 *
 * Isto não substitui a planilha: aqui não há fórmula, tipo de coluna nem
 * agregação. É a tabela que cabe DENTRO de um texto — comparar três
 * abordagens, listar um cronograma.
 *
 * Teclado do Word: Tab anda célula a célula e cria a linha no fim; as
 * setas sobem e descem (e saem da tabela nas pontas); Enter desce, e na
 * última linha volta ao texto; Ctrl+Enter sai de qualquer célula.
 */

const celulaVazia = () => ''

/** Matriz nova com `linhas` × `colunas`, preservando o que já existe. */
function redimensionar(rows, linhas, colunas) {
  return Array.from({ length: linhas }, (_, l) =>
    Array.from({ length: colunas }, (_, c) => rows[l]?.[c] ?? celulaVazia()),
  )
}

const TableSection = forwardRef(function TableSection(
  { section, onChange, readOnly = false, onSair, onApagarBloco },
  ref,
) {
  const bruto = (section.rows ?? []).filter(Array.isArray)
  // Uma tabela recém-criada nasce 2×2: uma linha de cabeçalho e uma de
  // dados é o mínimo em que dá para ver que aquilo é uma tabela.
  const largura = Math.max(2, ...bruto.map((r) => r.length))
  // Piso de duas linhas: cabeçalho e um registro. Uma tabela gravada com
  // uma linha só (backup, versão anterior) ficava com a linha impossível
  // de apagar, presa pelo guarda de `removerLinha`.
  const rows = redimensionar(bruto, Math.max(2, bruto.length), largura)

  // Os campos, endereçados por `linha:coluna`. Com o mapa em mãos, mover
  // o cursor é chamar `focus()` no elemento certo.
  const camposRef = useRef({})
  // Qual célula focar depois do PRÓXIMO render: a criada por Tab na
  // última linha ainda não existe no render atual.
  const focarRef = useRef(null)

  const focar = (chave, posicao = 'fim') => {
    const campo = camposRef.current[chave]
    if (!campo) {
      focarRef.current = chave
      return
    }
    campo.focus()
    const p = posicao === 'inicio' ? 0 : campo.value.length
    campo.setSelectionRange(p, p)
  }

  useImperativeHandle(ref, () => ({
    // Vindo de cima, a primeira célula; vindo de baixo, a primeira da última linha.
    focar: (onde = 'fim') => focar(onde === 'inicio' ? '0:0' : `${rows.length - 1}:0`, onde),
  }))

  const atualizar = (proximas) => onChange({ rows: proximas })

  const patch = (linha, coluna, valor) =>
    atualizar(rows.map((r, l) => (l === linha ? r.map((c, i) => (i === coluna ? valor : c)) : r)))

  const adicionarLinha = (depoisDe = rows.length - 1) => {
    // Impedir aqui é o que importa: passando do teto, o backend recusa o
    // payload inteiro e o documento para de ser salvo enquanto a pessoa
    // continua digitando.
    if (rows.length >= MAX_ITENS_SECAO) return
    const proximas = [...rows]
    proximas.splice(depoisDe + 1, 0, Array.from({ length: largura }, celulaVazia))
    focarRef.current = `${depoisDe + 1}:0`
    atualizar(proximas)
  }

  const adicionarColuna = () => {
    if (largura >= MAX_COLUNAS_TABELA) return
    focarRef.current = `0:${largura}`
    atualizar(rows.map((r) => [...r, celulaVazia()]))
  }

  const removerLinha = (linha) => {
    // O cabeçalho e uma linha de dados são o piso.
    if (rows.length <= 2) return
    atualizar(rows.filter((_, l) => l !== linha))
  }

  const removerColuna = (coluna) => {
    if (largura <= 1) return
    atualizar(rows.map((r) => r.filter((_, c) => c !== coluna)))
  }

  const tabelaVazia = () => rows.every((r) => r.every((c) => !c))

  /**
   * O percurso do Tab é explícito, e não o do navegador, porque a ordem
   * natural de foco passava pelo botão de remover linha da margem — e as
   * letras iam parar num botão que ninguém estava vendo.
   */
  const aoTeclar = (event, linha, coluna) => {
    const campo = event.target
    const ultimaLinha = linha === rows.length - 1

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSair?.('baixo')
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (ultimaLinha) onSair?.('baixo')
      else focar(`${linha + 1}:${coluna}`)
      return
    }
    if (event.key === 'ArrowUp' && !event.shiftKey) {
      event.preventDefault()
      if (linha === 0) onSair?.('cima')
      else focar(`${linha - 1}:${coluna}`)
      return
    }
    if (event.key === 'ArrowDown' && !event.shiftKey) {
      event.preventDefault()
      if (ultimaLinha) onSair?.('baixo')
      else focar(`${linha + 1}:${coluna}`)
      return
    }
    // Backspace na primeira célula de uma tabela toda vazia: desistiu dela.
    if (
      event.key === 'Backspace' &&
      linha === 0 &&
      coluna === 0 &&
      campo.selectionStart === 0 &&
      campo.selectionEnd === 0 &&
      tabelaVazia()
    ) {
      event.preventDefault()
      onApagarBloco?.('cima')
      return
    }
    if (event.key !== 'Tab') return

    // No canto de cima à esquerda, Shift+Tab sai do bloco.
    if (event.shiftKey && linha === 0 && coluna === 0) {
      event.preventDefault()
      onSair?.('cima')
      return
    }
    event.preventDefault()
    if (event.shiftKey) {
      focar(coluna > 0 ? `${linha}:${coluna - 1}` : `${linha - 1}:${largura - 1}`)
      return
    }
    if (ultimaLinha && coluna === largura - 1) {
      adicionarLinha()
      return
    }
    focar(coluna < largura - 1 ? `${linha}:${coluna + 1}` : `${linha + 1}:0`)
  }

  return (
    <div className="group/tabela relative my-2">
      {/* Rola no eixo X: uma tabela de dez colunas não pode espremer a
          coluna da nota nem vazar por cima do texto ao lado. */}
      <div className="overflow-x-auto pb-1">
        <table className="w-full border-collapse text-[13.5px]">
          <tbody>
            {rows.map((row, linha) => (
              <tr key={linha} className="group/linha">
                {row.map((celula, coluna) => (
                  <td
                    key={coluna}
                    className={cn(
                      'border border-ink-200 p-0 align-top dark:border-ink-700',
                      linha === 0 && 'bg-ink-50 dark:bg-ink-800/60',
                    )}
                  >
                    <input
                      ref={(el) => {
                        const chave = `${linha}:${coluna}`
                        if (el) camposRef.current[chave] = el
                        else delete camposRef.current[chave]
                        if (el && focarRef.current === chave) {
                          focarRef.current = null
                          el.focus()
                        }
                      }}
                      value={celula ?? ''}
                      readOnly={readOnly}
                      onChange={(e) => patch(linha, coluna, e.target.value)}
                      onKeyDown={(e) => aoTeclar(e, linha, coluna)}
                      placeholder={linha === 0 ? t('Coluna') : ''}
                      aria-label={t('Linha {valor}, coluna {valor2}', { valor: linha + 1, valor2: coluna + 1 })}
                      className={cn(
                        'w-full min-w-[7rem] bg-transparent px-2 py-1.5 outline-none placeholder:text-ink-300 focus:bg-accent-50/60 dark:focus:bg-accent-500/10',
                        linha === 0 && 'font-medium text-ink-700 dark:text-ink-200',
                      )}
                    />
                  </td>
                ))}
                {!readOnly && (
                  // Fora da tabela, na margem: dentro de uma <td> ele
                  // roubaria largura de uma coluna de dados. Na linha do
                  // cabeçalho moram também o "+" de coluna: solto na borda,
                  // no toque (onde tudo fica à vista) ele caía em cima da
                  // lixeira de uma linha.
                  <td className="w-0 whitespace-nowrap border-0 p-0">
                    {linha === 0 && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={adicionarColuna}
                        disabled={largura >= MAX_COLUNAS_TABELA}
                        title={
                          largura >= MAX_COLUNAS_TABELA
                            ? t('Máximo de {MAX_COLUNAS_TABELA} colunas', { MAX_COLUNAS_TABELA })
                            : t('Adicionar coluna')
                        }
                        aria-label={t('Adicionar coluna')}
                        className="ml-1 rounded p-1 text-ink-300 opacity-0 transition hover:text-accent-600 disabled:opacity-0 group-focus-within/tabela:opacity-100 group-hover/tabela:opacity-100"
                      >
                        <Plus size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      // Fora da ordem de tabulação: no caminho do Tab ele
                      // engolia o cursor de quem preenchia a tabela.
                      tabIndex={-1}
                      onClick={() => (linha === 0 ? removerColuna(largura - 1) : removerLinha(linha))}
                      disabled={linha === 0 ? largura <= 1 : rows.length <= 2}
                      title={linha === 0 ? t('Remover a última coluna') : t('Remover esta linha')}
                      className={cn(
                        'rounded p-1 text-ink-300 opacity-0 transition hover:text-red-600 disabled:opacity-0 group-hover/linha:opacity-100',
                        linha !== 0 && 'ml-1',
                      )}
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alça de crescer, na borda de baixo: cria linha. Aparece com o
          mouse por cima ou com o cursor dentro da tabela; no toque fica
          sempre à vista (index.css). */}
      {!readOnly && (
        <>
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adicionarLinha()}
            title={t('Adicionar linha')}
            aria-label={t('Adicionar linha')}
            className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 opacity-0 shadow-subtle transition hover:text-accent-600 group-focus-within/tabela:opacity-100 group-hover/tabela:opacity-100 dark:border-ink-700 dark:bg-ink-900"
          >
            <Plus size={12} />
          </button>
        </>
      )}
    </div>
  )
})

export default TableSection

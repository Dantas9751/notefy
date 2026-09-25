import { useRef } from 'react'
import { Columns3, Rows3, Trash2 } from 'lucide-react'
import { MAX_COLUNAS_TABELA, MAX_ITENS_SECAO } from '@/lib/limites'
import { cn } from '@/lib/utils'

/**
 * Bloco de tabela de uma nota.
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
 * abordagens, listar um cronograma — e que hoje obrigava a sair da nota.
 */

const celulaVazia = () => ''

/** Matriz nova com `linhas` × `colunas`, preservando o que já existe. */
function redimensionar(rows, linhas, colunas) {
  return Array.from({ length: linhas }, (_, l) =>
    Array.from({ length: colunas }, (_, c) => rows[l]?.[c] ?? celulaVazia()),
  )
}

export default function TableSection({
  section,
  onChange,
  onDelete,
  readOnly = false,
  //: Recém-inserida pela barra: o cursor cai na primeira célula.
  autoFocus = false,
}) {
  const bruto = (section.rows ?? []).filter(Array.isArray)
  // Uma tabela recém-criada nasce 2×2: uma linha de cabeçalho e uma de
  // dados é o mínimo em que dá para ver que aquilo é uma tabela.
  const largura = Math.max(2, ...bruto.map((r) => r.length))
  // Piso de duas linhas: cabeçalho e um registro. Uma tabela gravada com
  // uma linha só (backup, versão anterior) exibia "0 × 2" e ficava com a
  // linha impossível de apagar, presa pelo guarda de `removerLinha`.
  const rows = redimensionar(bruto, Math.max(2, bruto.length), largura)

  // Os campos, endereçados por `linha:coluna`. Com o mapa em mãos, mover
  // o cursor é chamar `focus()` no elemento certo — sem `querySelector`
  // e sem esperar um render quando nada nos dados mudou.
  const camposRef = useRef({})
  // Qual célula focar depois do PRÓXIMO render: a criada por Tab na
  // última linha ainda não existe no render atual.
  const focarRef = useRef(autoFocus ? '0:0' : null)

  const focar = (chave) => camposRef.current[chave]?.focus()

  const atualizar = (proximas) => onChange({ rows: proximas })

  const patch = (linha, coluna, valor) =>
    atualizar(
      rows.map((r, l) => (l === linha ? r.map((c, i) => (i === coluna ? valor : c)) : r)),
    )

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
    atualizar(rows.map((r) => [...r, celulaVazia()]))
  }

  const removerLinha = (linha) => {
    // O cabeçalho e uma linha de dados são o piso: sem eles não sobra
    // tabela nenhuma para editar.
    if (rows.length <= 2) return
    atualizar(rows.filter((_, l) => l !== linha))
  }

  const removerColuna = (coluna) => {
    if (largura <= 1) return
    atualizar(rows.map((r) => r.filter((_, c) => c !== coluna)))
  }

  /**
   * Tab anda célula a célula; na última, cria a linha seguinte.
   *
   * O percurso é explícito, e não o do navegador, porque a ordem natural
   * de foco passa pelo botão de remover linha que mora na margem —
   * invisível até o mouse chegar perto. Preenchendo a tabela pelo
   * teclado, o cursor sumia entre uma coluna e outra e as letras iam
   * parar num botão que ninguém estava vendo.
   *
   * Criar a linha no fim é o que o Word e o Google Docs fazem, e é o que
   * deixa preencher a tabela inteira sem tocar no mouse.
   */
  const aoTeclar = (event, linha, coluna) => {
    if (event.key !== 'Tab') return

    // No canto de cima à esquerda, Shift+Tab sai do bloco: dentro de uma
    // nota, prender o foco numa tabela seria pior do que a confusão que
    // isto conserta.
    if (event.shiftKey && linha === 0 && coluna === 0) return

    event.preventDefault()

    if (event.shiftKey) {
      focar(coluna > 0 ? `${linha}:${coluna - 1}` : `${linha - 1}:${largura - 1}`)
      return
    }
    if (linha === rows.length - 1 && coluna === largura - 1) {
      adicionarLinha()
      return
    }
    focar(coluna < largura - 1 ? `${linha}:${coluna + 1}` : `${linha + 1}:0`)
  }

  return (
    // A mesma casca do bloco de código e do checklist. Ver ali o porquê.
    <div className="group/tabela overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
      <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-2 py-1.5 dark:border-ink-700 dark:bg-ink-900">
        {/* "3 × 2" no lugar de "TABELA": a grade abaixo já diz que é uma
            tabela, e o tamanho é o que some quando ela rola na
            horizontal. Conta as linhas de DADOS — o cabeçalho não é um
            registro. */}
        <span className="flex-1 text-[10px] tabular-nums text-ink-400">
          {rows.length - 1} × {largura}
        </span>
        {!readOnly && (
          <>
            <button
              onClick={() => adicionarLinha()}
              title="Adicionar linha"
              className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 dark:hover:bg-ink-700"
            >
              <Rows3 size={12} />
            </button>
            <button
              onClick={adicionarColuna}
              disabled={largura >= MAX_COLUNAS_TABELA}
              title={
                largura >= MAX_COLUNAS_TABELA
                  ? `Máximo de ${MAX_COLUNAS_TABELA} colunas`
                  : 'Adicionar coluna'
              }
              className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700 disabled:opacity-40 dark:hover:bg-ink-700"
            >
              <Columns3 size={12} />
            </button>
          </>
        )}
        {onDelete && !readOnly && (
          <button
            onClick={onDelete}
            title="Excluir seção"
            className="shrink-0 rounded p-1 text-ink-400 transition hover:bg-ink-200 hover:text-red-600 dark:hover:bg-ink-700"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Rola no eixo X: uma tabela de dez colunas não pode espremer a
          coluna da nota nem vazar por cima do texto ao lado.

          O respiro não é enfeite: encostada na borda do bloco, a borda de
          1px das células soma com ela e o contorno externo sai com o
          dobro da espessura do resto da grade. */}
      <div className="overflow-x-auto p-2">
        <table className="w-full border-collapse text-[13px]">
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
                      placeholder={linha === 0 ? 'Coluna' : ''}
                      aria-label={`Linha ${linha + 1}, coluna ${coluna + 1}`}
                      className={cn(
                        'w-full min-w-[7rem] bg-transparent px-2 py-1.5 outline-none placeholder:text-ink-300 focus:bg-accent-50/60 dark:focus:bg-accent-500/10',
                        linha === 0 && 'font-medium text-ink-700 dark:text-ink-200',
                      )}
                    />
                  </td>
                ))}
                {!readOnly && (
                  // Fora da tabela, na margem: dentro de uma <td> ele
                  // roubaria largura de uma coluna de dados.
                  <td className="w-0 border-0 p-0">
                    <button
                      // Fora da ordem de tabulação: é um atalho de mouse
                      // que duplicaria os botões do cabeçalho, e no
                      // caminho do Tab ele engolia o cursor de quem
                      // estava preenchendo a tabela.
                      tabIndex={-1}
                      onClick={() => (linha === 0 ? removerColuna(largura - 1) : removerLinha(linha))}
                      disabled={linha === 0 ? largura <= 1 : rows.length <= 2}
                      title={linha === 0 ? 'Remover a última coluna' : 'Remover esta linha'}
                      className="ml-1 rounded p-1 text-ink-300 opacity-0 transition hover:text-red-600 disabled:opacity-0 group-hover/linha:opacity-100"
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
    </div>
  )
}

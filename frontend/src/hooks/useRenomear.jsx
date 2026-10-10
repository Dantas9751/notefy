import { useCallback, useRef, useState } from 'react'
import api, { extractError } from '@/lib/api'
import { cn } from '@/lib/utils'
import useListenerDeJanela from '@/hooks/useListenerDeJanela'
import { parseKey } from '@/hooks/useMultiSelect'

/**
 * Renomear no lugar: o texto vira um campo, e o campo vira texto de volta.
 *
 * Uma porta só para as quatro telas que listam item (pasta, categoria,
 * recentes, busca) e para a sidebar. Cada uma tinha o seu jeito de abrir
 * um modal de edição, ou simplesmente não tinha — um PDF importado não
 * podia trocar de nome em lugar nenhum do aplicativo.
 *
 * Gestos, os três que todo gerenciador de arquivos tem: F2, duplo clique
 * e o item "Renomear" do botão direito. Enter e sair do campo gravam;
 * Esc desiste.
 */
export function useRenomear({ onRenamed } = {}) {
  //: Id em edição. Um por vez: dois campos abertos é ambiguidade sobre
  //: qual deles o Enter grava.
  const [editando, setEditando] = useState(null)
  const [erro, setErro] = useState(null)
  //: Trava o blur enquanto o PATCH viaja, senão Enter grava e o blur que
  //: vem logo atrás grava de novo.
  const gravandoRef = useRef(false)

  const abrir = useCallback((id) => {
    setErro(null)
    setEditando(id)
  }, [])

  const fechar = useCallback(() => {
    gravandoRef.current = false
    setEditando(null)
  }, [])

  /**
   * Grava o nome novo.
   *
   * `endpoint` e `campo` vêm de quem chama porque documento usa
   * `title` e pasta/categoria usam `name` — a alternativa seria um
   * `if` por tipo aqui dentro, que é a mesma bifurcação num lugar pior.
   */
  const gravar = useCallback(
    async (endpoint, campo, valorBruto, valorAtual) => {
      const valor = (valorBruto ?? '').trim()
      // Nome vazio some das listas e o servidor o chamaria de "Sem
      // título": desistir é o que o usuário quis dizer.
      if (!valor || valor === valorAtual) return fechar()
      if (gravandoRef.current) return undefined

      gravandoRef.current = true
      try {
        await api.patch(endpoint, { [campo]: valor })
        fechar()
        onRenamed?.()
        // As outras listagens mostram o mesmo item: sem o aviso, o nome
        // novo só aparecia nelas depois de recarregar a página.
        window.dispatchEvent(new Event('notefy:moved'))
      } catch (err) {
        // O nome é único por pasta. Sem mostrar o motivo, o campo só
        // voltava ao nome antigo e parecia que renomear não funciona.
        setErro(extractError(err))
        gravandoRef.current = false
      }
      return undefined
    },
    [fechar, onRenamed],
  )

  return { editando, erro, abrir, fechar, gravar, estaEditando: (id) => editando === id }
}

/** Props do `<input>` de renomear: os mesmos handlers em todo lugar, para Enter/Esc/blur não divergirem. */
function propsDoCampo({ valorAtual, endpoint, campo, gravar, fechar }) {
  return {
    defaultValue: valorAtual,
    autoFocus: true,
    spellCheck: false,
    // Seleciona tudo ao abrir: renomear quase sempre é trocar o nome
    // inteiro, não emendar no fim dele.
    onFocus: (e) => e.currentTarget.select(),
    // O clique que posiciona o cursor não pode abrir o item nem mexer na
    // seleção múltipla da lista.
    onClick: (e) => e.stopPropagation(),
    onMouseDown: (e) => e.stopPropagation(),
    onDoubleClick: (e) => e.stopPropagation(),
    onBlur: (e) => gravar(endpoint, campo, e.currentTarget.value, valorAtual),
    onKeyDown: (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        gravar(endpoint, campo, e.currentTarget.value, valorAtual)
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        // Devolve o valor antigo ANTES de fechar: sem isto o `onBlur`
        // dispara com o texto digitado e grava o que o Esc recusou.
        e.currentTarget.value = valorAtual
        fechar()
      }
    },
  }
}

/**
 * O nome que vira campo, no lugar e no mesmo tipo do texto: o único
 * desenho dele no app (cartões, árvore, busca). A recusa do servidor
 * aparece embaixo: o nome é único por pasta, e sem o motivo à vista o
 * campo só voltava ao nome antigo e parecia que renomear não funciona.
 *
 * `campo` é `title` para documento e `name` para pasta e categoria.
 */
export function CampoDeRenomear({ renomear, valorAtual, endpoint, campo = 'name', className }) {
  const { erro, gravar, fechar } = renomear
  return (
    <span className="min-w-0 flex-1">
      <input
        {...propsDoCampo({ valorAtual, endpoint, campo, gravar, fechar })}
        aria-invalid={!!erro}
        className={cn(
          'w-full rounded-sm px-1 outline-none ring-1',
          erro ? 'bg-red-50 ring-red-400 dark:bg-red-500/10' : 'bg-accent-50 ring-accent-400 dark:bg-accent-500/15',
          className,
        )}
      />
      {erro && <span className="mt-1 block text-[11px] font-normal text-red-500">{erro}</span>}
    </span>
  )
}

/**
 * F2 renomeia o item selecionado.
 *
 * Na TELA, e não no cartão: depois de um clique direito o foco do teclado
 * está no menu, e um handler preso ao cartão nunca receberia a tecla.
 *
 * Estava copiado em quatro páginas com a mesma lógica e uma diferença só
 * — quais tipos aceitam renomear. Virou parâmetro.
 *
 * @param renomear       o que `useRenomear` devolveu
 * @param chaves         as chaves selecionadas ("tipo:id")
 * @param tiposAceitos   tipos que abrem o campo
 */
export function useF2(renomear, chaves, tiposAceitos = ['document']) {
  // Pelo hook, e não por um `useEffect` sem array de dependências: o
  // efeito sem array rodava em TODO render — digitar na busca trocava o
  // listener a cada tecla. O hook mantém o fechamento fresco (que era a
  // razão de não haver array) e registra uma vez só.
  useListenerDeJanela('keydown', (evento) => {
    // Só com UM item marcado: renomear vários de uma vez não existe.
    if (evento.key !== 'F2' || renomear.editando || chaves.length !== 1) return
    const { type, id } = parseKey(chaves[0])
    if (!tiposAceitos.includes(type)) return
    evento.preventDefault()
    renomear.abrir(id)
  })
}

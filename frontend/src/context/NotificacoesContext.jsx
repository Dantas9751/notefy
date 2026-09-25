import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import TaskFormModal from '@/components/modals/TaskFormModal'
import {
  TODAS_AS_ETAPAS,
  avisosNovos,
  janelaDeBusca,
  podarDisparados,
} from '@/lib/avisos'

/**
 * A central de notificações: o que venceu ou vai vencer, dentro do app.
 *
 * Substitui a notificação do navegador. Aquela exigia pedir permissão ao
 * sistema, saía com a marca do Chrome, sumia da tela em segundos e não
 * levava a lugar nenhum ao ser clicada. No app empacotado, sem o plugin
 * de notificação do Tauri, provavelmente nem aparecia. Aqui o aviso é do
 * Notefy: sai no canto superior direito, fica guardado no sino e abre a
 * tarefa.
 *
 * Quem avisa é o app aberto, de minuto em minuto. Não há cron no desktop.
 */

const NotificacoesContext = createContext(null)

const INTERVALO_MS = 60_000
const MAX_GUARDADAS = 50
const MAX_FLUTUANTES = 3

const PREFERENCIAS_KEY = 'notefy.avisos'
const PREFERENCIAS_PADRAO = {
  etapas: Object.fromEntries([...TODAS_AS_ETAPAS].map((id) => [id, true])),
  flutuante: true,
}

/**
 * As notificações moram por USUÁRIO. Elas carregam título de tarefa, e
 * duas contas no mesmo computador não podem ver a lista uma da outra.
 * As preferências não: são do aparelho, como o tema.
 */
const chaveDoUsuario = (id) => `notefy.notificacoes.${id}`

function lerJson(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto ? { ...padrao, ...JSON.parse(bruto) } : padrao
  } catch {
    return padrao
  }
}

function gravarJson(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    /* sem storage: a lista vale só nesta sessão */
  }
}

const ESTADO_VAZIO = { itens: [], disparados: {} }
const lerEstado = (chave) => (chave ? lerJson(chave, ESTADO_VAZIO) : ESTADO_VAZIO)

export function NotificacoesProvider({ children }) {
  const { user } = useAuth()
  const chave = user?.id ? chaveDoUsuario(user.id) : null

  const [estado, setEstado] = useState(() => lerEstado(chave))
  const [preferencias, setPreferenciasState] = useState(() =>
    lerJson(PREFERENCIAS_KEY, PREFERENCIAS_PADRAO),
  )
  const [flutuantes, setFlutuantes] = useState([])
  const [tarefaAberta, setTarefaAberta] = useState(null)

  // Em ref: o intervalo roda com o fechamento da primeira execução, e
  // recriá-lo a cada troca de preferência reiniciaria o relógio.
  const preferenciasRef = useRef(preferencias)
  preferenciasRef.current = preferencias

  // Trocou de conta: a lista é outra.
  useEffect(() => {
    setEstado(lerEstado(chave))
    setFlutuantes([])
  }, [chave])

  const salvar = useCallback(
    (proximo) => {
      if (chave) gravarJson(chave, proximo)
      setEstado(proximo)
    },
    [chave],
  )

  useEffect(() => {
    if (!chave) return undefined
    let cancelado = false

    const verificar = async () => {
      const agora = Date.now()
      try {
        const { data } = await api.get('/tasks/', {
          params: { open: true, page_size: 100, ...janelaDeBusca(agora) },
        })
        if (cancelado) return

        const { etapas, flutuante } = preferenciasRef.current
        const ligadas = new Set(Object.keys(etapas).filter((id) => etapas[id]))

        // Relido do storage, e não do estado: com duas janelas abertas,
        // a outra pode ter disparado neste minuto, e sem reler as duas
        // mostrariam o mesmo aviso.
        const atual = lerEstado(chave)
        const novos = avisosNovos(data?.results ?? [], {
          agora,
          disparados: atual.disparados,
          ligadas,
        })
        if (!novos.length) return

        const disparados = { ...atual.disparados }
        for (const n of novos) disparados[n.chave] = agora

        salvar({
          itens: [...novos.map((n) => ({ ...n, lida: false })), ...atual.itens].slice(
            0,
            MAX_GUARDADAS,
          ),
          disparados: podarDisparados(disparados, agora),
        })

        if (flutuante) {
          setFlutuantes((f) => [...novos.map((n) => n.chave), ...f].slice(0, MAX_FLUTUANTES))
        }
      } catch {
        /* sem rede ou sessão expirada: tenta de novo no próximo minuto */
      }
    }

    verificar()
    const timer = setInterval(verificar, INTERVALO_MS)
    // Criou uma tarefa para daqui a 5 minutos: o aviso não espera o
    // próximo minuto cheio para existir.
    window.addEventListener('notefy:task-changed', verificar)
    return () => {
      cancelado = true
      clearInterval(timer)
      window.removeEventListener('notefy:task-changed', verificar)
    }
  }, [chave, salvar])

  // A outra janela marcou como lida ou limpou: esta acompanha.
  useEffect(() => {
    if (!chave) return undefined
    const aoMudar = (e) => {
      if (e.key === chave) setEstado(lerEstado(chave))
    }
    window.addEventListener('storage', aoMudar)
    return () => window.removeEventListener('storage', aoMudar)
  }, [chave])

  const setPreferencias = useCallback((mudanca) => {
    setPreferenciasState((atual) => {
      const proximo = typeof mudanca === 'function' ? mudanca(atual) : mudanca
      gravarJson(PREFERENCIAS_KEY, proximo)
      return proximo
    })
  }, [])

  const marcarLidas = useCallback(
    (chaves) => {
      const alvo = chaves ? new Set(chaves) : null
      const atual = lerEstado(chave)
      if (!atual.itens.some((i) => !i.lida && (!alvo || alvo.has(i.chave)))) return
      salvar({
        ...atual,
        itens: atual.itens.map((i) => (!alvo || alvo.has(i.chave) ? { ...i, lida: true } : i)),
      })
    },
    [chave, salvar],
  )

  // Limpar tira da LISTA, não dos disparados: sem essa separação, limpar
  // o sino faria cada aviso sair de novo no minuto seguinte.
  const limpar = useCallback(() => {
    salvar({ ...lerEstado(chave), itens: [] })
    setFlutuantes([])
  }, [chave, salvar])

  const dispensarFlutuante = useCallback((c) => {
    setFlutuantes((f) => f.filter((x) => x !== c))
  }, [])

  /**
   * Abre a tarefa do aviso no mesmo formulário do quadro e do calendário.
   *
   * Busca de novo em vez de usar o que veio no aviso: o aviso é uma foto
   * de quando saiu, e editar a partir dela sobrescreveria o que mudou
   * desde então.
   */
  const abrirTarefa = useCallback(
    async (item) => {
      marcarLidas([item.chave])
      dispensarFlutuante(item.chave)
      try {
        const { data } = await api.get(`/tasks/${item.tarefaId}/`)
        setTarefaAberta(data)
      } catch (err) {
        if (err.response?.status !== 404) return
        // Excluída depois que o aviso saiu. O aviso fica, marcado, para
        // o clique não parecer ter falhado em silêncio.
        const atual = lerEstado(chave)
        salvar({
          ...atual,
          itens: atual.itens.map((i) =>
            i.chave === item.chave ? { ...i, texto: 'Esta tarefa foi excluída.', excluida: true } : i,
          ),
        })
      }
    },
    [chave, salvar, marcarLidas, dispensarFlutuante],
  )

  const naoLidas = estado.itens.filter((i) => !i.lida).length
  // Memo: array novo a cada render mudaria o `value` do contexto toda vez
  // que o layout re-renderizasse (troca de rota), e o sino e os avisos
  // flutuantes re-renderizariam junto sem nada ter mudado.
  const itensFlutuantes = useMemo(
    () => flutuantes.map((c) => estado.itens.find((i) => i.chave === c)).filter(Boolean),
    [flutuantes, estado.itens],
  )

  const value = useMemo(
    () => ({
      itens: estado.itens,
      naoLidas,
      flutuantes: itensFlutuantes,
      preferencias,
      setPreferencias,
      marcarLidas,
      limpar,
      dispensarFlutuante,
      abrirTarefa,
    }),
    [
      estado.itens,
      naoLidas,
      itensFlutuantes,
      preferencias,
      setPreferencias,
      marcarLidas,
      limpar,
      dispensarFlutuante,
      abrirTarefa,
    ],
  )

  return (
    <NotificacoesContext.Provider value={value}>
      {children}
      <TaskFormModal
        open={!!tarefaAberta}
        task={tarefaAberta}
        onClose={() => setTarefaAberta(null)}
        onSaved={() => {
          setTarefaAberta(null)
          window.dispatchEvent(new CustomEvent('notefy:task-changed'))
        }}
      />
    </NotificacoesContext.Provider>
  )
}

export function useNotificacoes() {
  const ctx = useContext(NotificacoesContext)
  if (!ctx) throw new Error('useNotificacoes precisa estar dentro de <NotificacoesProvider>.')
  return ctx
}

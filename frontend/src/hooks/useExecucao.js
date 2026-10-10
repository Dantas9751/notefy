import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'

export const LINGUAGENS_EXECUTAVEIS = ['javascript', 'python']
export const podeExecutar = (linguagem) => LINGUAGENS_EXECUTAVEIS.includes(linguagem)

//: Um `while True: print(1)` mandaria texto até travar a tela; passando
//: disto a execução para.
const LIMITE_DA_SAIDA = 100_000

/** Pedaços seguidos do mesmo fluxo viram um só: a lista fica curta. */
function juntar(saida, novos) {
  const resultado = [...saida]
  for (const pedaco of novos) {
    const ultimo = resultado.at(-1)
    if (ultimo?.fluxo === pedaco.fluxo) resultado[resultado.length - 1] = { ...ultimo, texto: ultimo.texto + pedaco.texto }
    else resultado.push(pedaco)
  }
  return resultado
}

const urlDoCanal = (canal) => new URL(`${api.defaults.baseURL.replace(/\/$/, '')}/entrada/${canal}/`, window.location.href).href

/**
 * Execução do código de UM bloco: o worker (vivo entre execuções de
 * Python, para o Pyodide não recarregar), o canal do `input()` e a saída.
 *
 * `estado`: parado, carregando (o Python da primeira vez), rodando ou
 * esperando (um `input()` aguarda a resposta). `saida` é `null` antes da
 * primeira execução e depois de fechada: o painel aparece mesmo quando o
 * código termina sem escrever nada.
 */
export function useExecucao() {
  const [estado, setEstado] = useState('parado')
  const [saida, setSaida] = useState(null)
  const worker = useRef(null)
  const linguagem = useRef(null)
  const canal = useRef(null)
  const pendente = useRef([])
  const quadro = useRef(0)
  const tamanho = useRef(0)
  //: Muda a cada execução e a cada "Parar": a execução que perdeu a vez
  //: enquanto abria o canal não segue adiante.
  const vez = useRef(0)

  const despejar = () => {
    quadro.current = 0
    const novos = pendente.current
    pendente.current = []
    setSaida((atual) => juntar(atual ?? [], novos))
  }

  const anexar = (fluxo, texto) => {
    pendente.current.push({ fluxo, texto })
    quadro.current ||= requestAnimationFrame(despejar)
  }

  const fecharCanal = () => {
    if (canal.current) api.delete(`/entrada/${canal.current}/`).catch(() => {})
    canal.current = null
  }

  const descartarWorker = () => {
    worker.current?.terminate()
    worker.current = null
  }

  const encerrar = (aviso) => {
    vez.current += 1
    descartarWorker()
    fecharCanal()
    if (aviso) anexar('aviso', `${aviso}\n`)
    setEstado('parado')
  }

  const receber = ({ data }) => {
    if (data.tipo === 'saida') {
      if (tamanho.current > LIMITE_DA_SAIDA) return
      tamanho.current += data.texto.length
      anexar(data.fluxo, data.texto)
      if (tamanho.current > LIMITE_DA_SAIDA) encerrar(t('A saída ficou longa demais e a execução parou.'))
    } else if (data.tipo === 'estado') setEstado(data.estado)
    else if (data.tipo === 'entrada') setEstado('esperando')
    else if (data.tipo === 'entrada-fim') setEstado('rodando')
    else if (data.tipo === 'sem-python') {
      anexar('erro', `${t('O Python não carregou. Tente de novo; se continuar, reinstale o Notefy.')}\n`)
    }
    else if (data.tipo === 'fim') {
      // JavaScript não tem o que aproveitar entre execuções, e o worker
      // vivo deixaria um setInterval esquecido escrevendo numa saída que
      // já terminou. O Python fica: recarregar o Pyodide custa segundos.
      if (linguagem.current === 'javascript') descartarWorker()
      fecharCanal()
      setEstado('parado')
    }
  }

  const rodar = async (qual, codigo) => {
    if (estado !== 'parado' || !podeExecutar(qual)) return
    linguagem.current = qual
    setSaida([])
    pendente.current = []
    tamanho.current = 0
    setEstado('rodando')
    const minhaVez = (vez.current += 1)
    // Sem canal o código roda igual; só o input() recebe "fim da entrada".
    const aberto = await api.post('/entrada/').then(({ data }) => data.canal, () => null)
    if (minhaVez !== vez.current) {
      if (aberto) api.delete(`/entrada/${aberto}/`).catch(() => {})
      return
    }
    canal.current = aberto
    worker.current ??= new Worker(new URL('../lib/executar/worker.js', import.meta.url), { type: 'module' })
    worker.current.onmessage = receber
    worker.current.onerror = (evento) => encerrar(evento.message || t('Não foi possível iniciar a execução.'))
    worker.current.postMessage({ linguagem: qual, codigo, urlDaEntrada: canal.current && urlDoCanal(canal.current) })
  }

  const responder = (valor) => {
    if (!canal.current) return
    setEstado('rodando')
    api.post(`/entrada/${canal.current}/`, { valor }).catch(() => encerrar(t('A resposta não chegou ao código.')))
  }

  const parar = () => encerrar(t('Execução interrompida.'))
  const limpar = () => setSaida(null)

  // Sair da nota com o código rodando não deixa worker nem canal para trás.
  useEffect(
    () => () => {
      worker.current?.terminate()
      if (canal.current) api.delete(`/entrada/${canal.current}/`).catch(() => {})
      cancelAnimationFrame(quadro.current)
    },
    [],
  )

  return { estado, saida, rodar, parar, responder, limpar }
}

import { useNotificacoes } from '@/context/NotificacoesContext'
import { ETAPAS } from '@/lib/avisos'
import { Bloco, Chave } from './componentes'

export default function AbaNotificacoes() {
  const { preferencias, setPreferencias } = useNotificacoes()

  const ligarEtapa = (id, ligada) =>
    setPreferencias((p) => ({ ...p, etapas: { ...p.etapas, [id]: ligada } }))

  return (
    <>
      <Bloco
        title="Quando avisar"
        description="Tarefas com prazo avisam no sino do canto superior direito. O prazo é o fim da tarefa ou, se ela não tiver fim, o início."
      >
        {ETAPAS.map(({ id, rotulo }) => (
          <Chave
            key={id}
            label={rotulo}
            // Ausente conta como ligada: uma etapa nova que entre depois
            // já nasce valendo para quem nunca mexeu aqui.
            checked={preferencias.etapas[id] !== false}
            onChange={(ligada) => ligarEtapa(id, ligada)}
          />
        ))}
        <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">
          Tarefas de dia inteiro não têm horário, então avisam só na véspera e no próprio
          dia. Quem avisa é o Notefy aberto: se ele estiver fechado na hora, o aviso aparece
          quando você abrir de novo, até um dia depois do prazo.
        </p>
      </Bloco>

      <Bloco title="Na tela">
        <Chave
          checked={preferencias.flutuante}
          onChange={(flutuante) => setPreferencias((p) => ({ ...p, flutuante }))}
          label="Mostrar o aviso na hora"
          description="Aparece por alguns segundos embaixo do sino. Desligado, a notificação vai direto para o sino, sem interromper o que você está fazendo."
        />
      </Bloco>
    </>
  )
}

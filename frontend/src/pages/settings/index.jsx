import { NavLink, Outlet, useOutletContext } from 'react-router-dom'
import { Bell, Database, Palette, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useFetch, useMutation } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { ICONE } from '@/lib/ui'
import { cn } from '@/lib/utils'

/**
 * As abas, na ordem em que aparecem.
 *
 * A ordem não é alfabética nem por importância: é da que se mexe toda
 * semana para a que se mexe uma vez na vida. Aparência é a primeira
 * porque é o motivo mais comum de alguém abrir esta tela; Segurança é a
 * última porque é onde mora o botão de apagar a conta, e ele não tem
 * nada que fazer no caminho de quem só queria trocar o tema.
 */
export const ABAS = [
  { rota: 'aparencia', label: 'Aparência', icon: Palette },
  { rota: 'conta', label: 'Conta', icon: UserRound },
  { rota: 'notificacoes', label: 'Notificações', icon: Bell },
  { rota: 'laviel', label: 'Laviel', icon: Sparkles },
  { rota: 'dados', label: 'Dados', icon: Database },
  { rota: 'seguranca', label: 'Segurança', icon: ShieldCheck },
]

/**
 * Configurações, divididas por assunto.
 *
 * Era uma página só, rolando por seis assuntos seguidos: quem entrava
 * para trocar a chave da IA passava pelo tema, pelos lembretes e pelo
 * backup no caminho, e o botão de excluir a conta ficava a um scroll de
 * distância de tudo. Cada aba agora tem URL própria (`/settings/dados`),
 * então dá para voltar direto, recarregar sem perder o lugar e mandar o
 * endereço para alguém.
 *
 * As preferências (`/me/preferences/`) são buscadas AQUI, e não em cada
 * aba: Aparência e Laviel leem o mesmo objeto, e duas buscas
 * independentes trariam duas cópias que só divergem — salvar o provedor
 * numa deixaria a outra com a tela inicial velha na mão.
 */
export default function Settings() {
  const { setUser } = useAuth()

  const prefs = useFetch('/me/preferences/')
  const savePrefs = useMutation(async (payload) => {
    const { data } = await api.patch('/me/preferences/', payload)
    prefs.setData(data)
    setUser((u) => ({ ...u, preferences: data }))
    return data
  })

  return (
    <>
      <PageHeader title="Configurações" subtitle="Como o Notefy se comporta neste computador." />

      <PageBody className="max-w-4xl">
        {/* Coluna no desktop, duas fileiras no celular. Seis abas não
            cabem em 375px de largura, e a primeira ideia foi deixar a
            fila rolar de lado: o resultado era um item ativo fora da
            vista (abrir /settings/laviel mostrava "Aparência, Conta,
            Lembretes" e nada indicando onde você estava) mais uma barra
            de rolagem atravessada embaixo. Quebrar a linha mostra as
            seis de uma vez, que é o ponto de ter abas. */}
        <div className="flex flex-col gap-6 md:flex-row md:gap-8">
          <nav
            aria-label="Seções das configurações"
            className="flex shrink-0 flex-wrap gap-1 md:w-44 md:flex-col md:flex-nowrap"
          >
            {ABAS.map(({ rota, label, icon: Icon }) => (
              <NavLink
                key={rota}
                to={rota}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition',
                    isActive
                      ? 'bg-ink-100 font-medium text-ink-900 dark:bg-ink-800 dark:text-ink-50'
                      : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800/70',
                  )
                }
              >
                <Icon size={ICONE.md} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="min-w-0 flex-1 space-y-8">
            <Outlet context={{ prefs, savePrefs }} />
          </div>
        </div>
      </PageBody>
    </>
  )
}

/** As preferências e o salvador, para as abas que precisam deles. */
export function usePreferencias() {
  return useOutletContext()
}

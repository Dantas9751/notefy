import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Tag } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useUI } from '@/context/UIContext'
import { useFetch, useMutation } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, ErrorState, Field, Input, Select } from '@/components/ui'

function Section({ title, description, children }) {
  return (
    <section className="border-b border-ink-100 pb-8 last:border-0 dark:border-ink-800">
      <h2 className="text-sm font-semibold tracking-tight text-ink-900 dark:text-ink-100">
        {title}
      </h2>
      {description && (
        <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{description}</p>
      )}
      <div className="mt-4 max-w-md space-y-4">{children}</div>
    </section>
  )
}

export default function Settings() {
  const { user, setUser } = useAuth()
  const { theme, setTheme } = useUI()

  const [profile, setProfile] = useState({ full_name: '' })
  const [profileSaved, setProfileSaved] = useState(false)

  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' })
  const [passwordSaved, setPasswordSaved] = useState(false)

  const prefs = useFetch('/me/preferences/')

  useEffect(() => {
    if (user) setProfile({ full_name: user.full_name ?? '' })
  }, [user])

  const saveProfile = useMutation(async (payload) => {
    const { data } = await api.patch('/me/', payload)
    setUser(data)
    return data
  })

  const savePassword = useMutation(async (payload) => api.post('/auth/change-password/', payload))

  const savePrefs = useMutation(async (payload) => {
    const { data } = await api.patch('/me/preferences/', payload)
    prefs.setData(data)
    return data
  })

  const handleProfile = async (e) => {
    e.preventDefault()
    setProfileSaved(false)
    try {
      await saveProfile.mutate(profile)
      setProfileSaved(true)
    } catch {
      /* erro exibido */
    }
  }

  const handlePassword = async (e) => {
    e.preventDefault()
    setPasswordSaved(false)
    try {
      await savePassword.mutate(passwords)
      setPasswords({ current_password: '', new_password: '' })
      setPasswordSaved(true)
    } catch {
      /* erro exibido */
    }
  }

  return (
    <>
      <PageHeader title="Configurações" subtitle="Perfil, aparência e preferências." />

      <PageBody className="max-w-2xl space-y-8">
        <Section title="Perfil" description="Como você aparece no Notefy.">
          {saveProfile.error && <ErrorState message={saveProfile.error} />}
          <form onSubmit={handleProfile} className="space-y-4">
            <Field label="E-mail" hint="O e-mail de login não pode ser alterado por aqui.">
              <Input value={user?.email ?? ''} disabled />
            </Field>
            <Field label="Nome">
              <Input
                value={profile.full_name}
                onChange={(e) => setProfile({ full_name: e.target.value })}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" loading={saveProfile.loading}>
                Salvar perfil
              </Button>
              {profileSaved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check size={13} /> salvo
                </span>
              )}
            </div>
          </form>
        </Section>

        <Section title="Aparência" description="Tema da interface.">
          <Field label="Tema">
            <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">Seguir o sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </Select>
          </Field>

          {prefs.data && (
            <Field label="Tela inicial">
              <Select
                value={prefs.data.default_view}
                onChange={(e) => savePrefs.mutate({ default_view: e.target.value })}
              >
                <option value="dashboard">Dashboard</option>
                <option value="calendar">Calendário</option>
                <option value="board">Quadro</option>
              </Select>
            </Field>
          )}
        </Section>

        <Section
          title="Organização"
          description="Categorias e pastas se gerenciam onde você as usa: na tela inicial e na sidebar, com o botão direito."
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md border border-ink-200 px-3.5 py-2 text-sm text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            <Tag size={15} />
            Ver categorias
          </Link>
        </Section>

        <Section title="Segurança" description="Altere sua senha de acesso.">
          {savePassword.error && <ErrorState message={savePassword.error} />}
          <form onSubmit={handlePassword} className="space-y-4">
            <Field label="Senha atual">
              <Input
                type="password"
                autoComplete="current-password"
                value={passwords.current_password}
                onChange={(e) =>
                  setPasswords((p) => ({ ...p, current_password: e.target.value }))
                }
                required
              />
            </Field>
            <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
              <Input
                type="password"
                autoComplete="new-password"
                value={passwords.new_password}
                onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))}
                required
                minLength={8}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary" loading={savePassword.loading}>
                Alterar senha
              </Button>
              {passwordSaved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check size={13} /> senha alterada
                </span>
              )}
            </div>
          </form>
        </Section>
      </PageBody>
    </>
  )
}

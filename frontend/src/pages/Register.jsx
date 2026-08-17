import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { extractError } from '@/lib/api'
import { Button, Field, Input } from '@/components/ui'

export default function Register() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    username: '',
    password: '',
    password_confirm: '',
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.password_confirm) {
      setError(t('cadastro.senhasDiferentes'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      await register({ ...form, username: form.username.trim() })
      navigate('/', { replace: true })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50/50 px-4 py-10 dark:bg-ink-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {t('cadastro.titulo')}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
            {t('cadastro.subtitulo')}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-ink-200 bg-white p-6 shadow-subtle dark:border-ink-800 dark:bg-ink-900"
        >
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          <Field label={t('login.usuario')}>
            <Input
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={set('username')}
              placeholder="Usuário"
              autoFocus
              required
            />
          </Field>

          <Field label={t('login.senha')} hint={t('cadastro.dicaSenha')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
            />
          </Field>

          <Field label={t('cadastro.confirmarSenha')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password_confirm}
              onChange={set('password_confirm')}
              required
            />
          </Field>

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {t('cadastro.titulo')}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500 dark:text-ink-400">
          {t('cadastro.jaTemConta')}{' '}
          <Link
            to="/login"
            className="font-medium text-accent-600 underline-offset-2 hover:underline dark:text-accent-400"
          >
            {t('login.entrar')}
          </Link>
        </p>
      </div>
    </div>
  )
}

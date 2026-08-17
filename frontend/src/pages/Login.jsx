import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { extractError } from '@/lib/api'
import { Button, Field, Input } from '@/components/ui'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(form.username.trim(), form.password)
      // Volta para a rota que o usuário tentou abrir antes de ser barrado.
      navigate(location.state?.from?.pathname ?? '/', { replace: true })
    } catch (err) {
      setError(
        err?.response?.status === 401
          ? t('login.erro')
          : extractError(err),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50/50 px-4 dark:bg-ink-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            Notefy
          </h1>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
            {t('login.subtitulo')}
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
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="Usuário"
              autoFocus
              required
            />
          </Field>

          <Field label={t('login.senha')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              required
            />
          </Field>

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {t('login.entrar')}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500 dark:text-ink-400">
          {t('login.semConta')}{' '}
          <Link
            to="/register"
            className="font-medium text-accent-600 underline-offset-2 hover:underline dark:text-accent-400"
          >
            {t('login.criarConta')}
          </Link>
        </p>
      </div>
    </div>
  )
}

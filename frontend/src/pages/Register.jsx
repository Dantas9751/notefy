import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { extractError } from '@/lib/api'
import { Button, ErrorState, Field, Input } from '@/components/ui'
import { t } from '@/lib/i18n'

export default function Register() {
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
      setError(t('As senhas não conferem.'))
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
          <h1 className="titulo text-[28px] font-medium">
            {t('Criar conta')}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
            {t('Usuário e senha, só. Não pedimos e-mail.')}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-ink-200 bg-white p-6 shadow-subtle dark:border-ink-800 dark:bg-ink-900"
        >
          {error && <ErrorState message={error} />}

          <Field label={t('Nome de usuário')}>
            <Input
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={set('username')}
              placeholder={t('Usuário')}
              autoFocus
              required
            />
          </Field>

          <Field label={t('Senha')} hint={t('Mínimo de 8 caracteres.')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
            />
          </Field>

          <Field label={t('Confirmar senha')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password_confirm}
              onChange={set('password_confirm')}
              required
            />
          </Field>

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {t('Criar conta')}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500 dark:text-ink-400">
          {t('Já tem conta?')}{' '}
          <Link
            to="/login"
            className="font-medium text-accent-600 underline-offset-2 hover:underline dark:text-accent-400"
          >
            {t('Entrar')}
          </Link>
        </p>
      </div>
    </div>
  )
}

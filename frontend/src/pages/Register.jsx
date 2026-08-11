import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { extractError } from '@/lib/api'
import { Button, Field, Input } from '@/components/ui'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    password_confirm: '',
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.password_confirm) {
      setError('As senhas não conferem.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await register({ ...form, email: form.email.trim() })
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
            Criar conta
          </h1>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
            Comece a organizar seus estudos hoje.
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

          <Field label="Nome">
            <Input value={form.full_name} onChange={set('full_name')} autoFocus />
          </Field>

          <Field label="E-mail">
            <Input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              required
            />
          </Field>

          <Field label="Senha" hint="Mínimo de 8 caracteres.">
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
            />
          </Field>

          <Field label="Confirmar senha">
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password_confirm}
              onChange={set('password_confirm')}
              required
            />
          </Field>

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Criar conta
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500 dark:text-ink-400">
          Já tem conta?{' '}
          <Link
            to="/login"
            className="font-medium text-accent-600 underline-offset-2 hover:underline dark:text-accent-400"
          >
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}

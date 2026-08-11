import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-semibold tracking-tight text-ink-200 dark:text-ink-800">404</p>
      <h1 className="mt-4 text-lg font-medium text-ink-900 dark:text-ink-100">
        Página não encontrada
      </h1>
      <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
        O endereço acessado não existe ou foi movido.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700"
      >
        Voltar ao início
      </Link>
    </div>
  )
}

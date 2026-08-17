import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Trash2, User as UserIcon } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, ErrorState, Field, Input } from '@/components/ui'

/** 5 MB — o mesmo teto que o avatar tem sentido de ter numa tela pequena. */
const LIMITE_FOTO = 5 * 1024 * 1024

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

/**
 * Editar perfil.
 */
export default function Profile() {
  const { user, setUser } = useAuth()

  const [form, setForm] = useState({ username: '', full_name: '' })
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const [senhas, setSenhas] = useState({ current_password: '', new_password: '' })
  const [senhaSalva, setSenhaSalva] = useState(false)
  const [erroSenha, setErroSenha] = useState(null)
  const [trocandoSenha, setTrocandoSenha] = useState(false)

  const [previa, setPrevia] = useState(null)
  const fotoRef = useRef(null)

  useEffect(() => {
    if (user) setForm({ username: user.username ?? '', full_name: user.full_name ?? '' })
  }, [user])

  // A prévia é um object URL; sem revogar, cada troca de foto vaza memória.
  useEffect(() => () => previa && URL.revokeObjectURL(previa), [previa])

  const enviarFoto = async (file) => {
    if (!file) return
    if (file.size > LIMITE_FOTO) {
      setErro(`A imagem passa do limite de ${LIMITE_FOTO / (1024 * 1024)} MB.`)
      return
    }
    setErro(null)
    setPrevia(URL.createObjectURL(file))
    try {
      const body = new FormData()
      body.append('avatar', file)
      const { data } = await api.patch('/me/', body)
      setUser(data)
      setPrevia(null)
    } catch (err) {
      setErro(extractError(err))
      setPrevia(null)
    } finally {
      if (fotoRef.current) fotoRef.current.value = ''
    }
  }

  const removerFoto = async () => {
    setErro(null)
    try {
      const body = new FormData()
      body.append('avatar', '')
      const { data } = await api.patch('/me/', body)
      setUser(data)
    } catch (err) {
      setErro(extractError(err))
    }
  }

  const salvarConta = async (e) => {
    e.preventDefault()
    setSalvo(false)
    setErro(null)
    setSalvando(true)
    try {
      const { data } = await api.patch('/me/', form)
      setUser(data)
      setSalvo(true)
    } catch (err) {
      setErro(extractError(err))
    } finally {
      setSalvando(false)
    }
  }

  const trocarSenha = async (e) => {
    e.preventDefault()
    setSenhaSalva(false)
    setErroSenha(null)
    setTrocandoSenha(true)
    try {
      await api.post('/auth/change-password/', senhas)
      setSenhas({ current_password: '', new_password: '' })
      setSenhaSalva(true)
    } catch (err) {
      setErroSenha(extractError(err))
    } finally {
      setTrocandoSenha(false)
    }
  }

  const foto = previa || user?.avatar
  const inicial = (user?.full_name || user?.username || '?').charAt(0).toUpperCase()

  return (
    <>
      <PageHeader
        title="Perfil"
        subtitle="Gerencie suas informações pessoais e senha."
      />

      <PageBody className="max-w-2xl space-y-8">
        <Section title="Foto" description="Sua foto de perfil exibida no sistema.">
          {erro && <ErrorState message={erro} />}
          <div className="flex items-center gap-4">
            <div className="relative">
              {foto ? (
                <img
                  src={foto}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover ring-1 ring-ink-200 dark:ring-ink-700"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-600 text-2xl font-semibold text-white">
                  {inicial}
                </div>
              )}
            </div>

            <input
              ref={fotoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => enviarFoto(e.target.files?.[0])}
            />
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={Camera}
                onClick={() => fotoRef.current?.click()}
              >
                Trocar foto
              </Button>
              {user?.avatar && (
                <Button variant="secondary" size="sm" icon={Trash2} onClick={removerFoto}>
                  Remover foto
                </Button>
              )}
            </div>
          </div>
        </Section>

        <Section title="Conta">
          <form onSubmit={salvarConta} className="space-y-4">
            <Field label="Nome de usuário" hint="Como você é identificado no sistema.">
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Nome de exibição" hint="Seu nome completo para exibição.">
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" icon={UserIcon} loading={salvando}>
                Salvar alterações
              </Button>
              {salvo && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check size={13} /> Salvo!
                </span>
              )}
            </div>
          </form>
        </Section>

        <Section title="Segurança">
          {erroSenha && <ErrorState message={erroSenha} />}
          <form onSubmit={trocarSenha} className="space-y-4">
            <Field label="Senha atual">
              <Input
                type="password"
                autoComplete="current-password"
                value={senhas.current_password}
                onChange={(e) =>
                  setSenhas((p) => ({ ...p, current_password: e.target.value }))
                }
                required
              />
            </Field>
            <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
              <Input
                type="password"
                autoComplete="new-password"
                value={senhas.new_password}
                onChange={(e) => setSenhas((p) => ({ ...p, new_password: e.target.value }))}
                required
                minLength={8}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary" loading={trocandoSenha}>
                Alterar senha
              </Button>
              {senhaSalva && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check size={13} /> Senha alterada com sucesso!
                </span>
              )}
            </div>
          </form>
        </Section>
      </PageBody>
    </>
  )
}
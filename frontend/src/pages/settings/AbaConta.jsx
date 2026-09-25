import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Trash2, User as UserIcon } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button, ErrorState, Field, Input } from '@/components/ui'
import { Bloco } from './componentes'

/** 5 MB: o maior que uma foto de 80px de lado tem motivo para ser. */
const LIMITE_FOTO = 5 * 1024 * 1024

export default function AbaConta() {
  const { user, setUser } = useAuth()

  const [form, setForm] = useState({ username: '', full_name: '' })
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

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

  const salvar = async (e) => {
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

  const foto = previa || user?.avatar
  const inicial = (user?.full_name || user?.username || '?').charAt(0).toUpperCase()

  return (
    <>
      <Bloco title="Foto" description="Aparece no rodapé da barra lateral.">
        {erro && <ErrorState message={erro} />}
        <div className="flex items-center gap-4">
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
      </Bloco>

      <Bloco title="Seus dados">
        <form onSubmit={salvar} className="space-y-4">
          <Field label="Nome de usuário" hint="É com ele que você entra no aplicativo.">
            <Input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Nome de exibição" hint="O nome que aparece na barra lateral.">
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
                <Check size={13} /> Salvo
              </span>
            )}
          </div>
        </form>
      </Bloco>
    </>
  )
}

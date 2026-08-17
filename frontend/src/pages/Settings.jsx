import { useRef, useState } from 'react'
import { Check, Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import api, { extractError, tokenStore } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useUI } from '@/context/UIContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useFetch, useMutation } from '@/hooks/useFetch'
import { PageBody, PageHeader } from '@/components/layout/AppLayout'
import { Button, ErrorState, Field, Input, Select } from '@/components/ui'
import ColorWheel from '@/components/ui/ColorWheel'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { ACCENT_PADRAO, CORES_PADRAO } from '@/lib/accent'
import { IDIOMAS } from '@/lib/i18n'
import { cn } from '@/lib/utils'

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

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition',
          checked ? 'bg-accent-600' : 'bg-ink-300 dark:bg-ink-700',
        )}
      >
        <span
          className={cn(
            'block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-ink-800 dark:text-ink-100">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}

export default function Settings() {
  const { user, setUser } = useAuth()
  const { theme, setTheme, zen, setZen, accent, setAccent, language, setLanguage } =
    useUI()
  const { refresh } = useWorkspace()

  const prefs = useFetch('/me/preferences/')
  const savePrefs = useMutation(async (payload) => {
    const { data } = await api.patch('/me/preferences/', payload)
    prefs.setData(data)
    setUser((u) => ({ ...u, preferences: data }))
    return data
  })

  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [substituir, setSubstituir] = useState(false)
  const [resumo, setResumo] = useState(null)
  const [erroDados, setErroDados] = useState(null)
  const [confirmarSubstituir, setConfirmarSubstituir] = useState(null)
  const backupRef = useRef(null)

  const [deletePassword, setDeletePassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const exportar = async () => {
    setErroDados(null)
    setExportando(true)
    try {
      const resposta = await api.get('/me/backup/', { responseType: 'blob' })
      const nome =
        /filename="([^"]+)"/.exec(resposta.headers['content-disposition'] ?? '')?.[1] ??
        'notefy-backup.zip'
      const url = URL.createObjectURL(resposta.data)
      const link = document.createElement('a')
      link.href = url
      link.download = nome
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      setErroDados(extractError(err))
    } finally {
      setExportando(false)
    }
  }

  const enviarBackup = async (file) => {
    setErroDados(null)
    setResumo(null)
    setImportando(true)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('replace', substituir ? 'true' : 'false')
      const { data } = await api.post('/me/backup/import/', body)
      setResumo(data)
      refresh()
    } catch (err) {
      setErroDados(extractError(err))
    } finally {
      setImportando(false)
      if (backupRef.current) backupRef.current.value = ''
    }
  }

  const escolherBackup = (file) => {
    if (!file) return
    if (substituir) setConfirmarSubstituir(file)
    else enviarBackup(file)
  }

  const corPersonalizada = !CORES_PADRAO.includes(accent)

  return (
    <>
      <PageHeader title="Configurações" subtitle="Gerencie as preferências e os dados do seu Notefy." />

      <PageBody className="max-w-2xl space-y-8">

        <Section title="Aparência" description="Personalize o visual do aplicativo.">
          <Field label="Tema">
            <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">Seguir o sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </Select>
          </Field>

          <Toggle
            checked={zen}
            onChange={setZen}
            label="Modo zen"
            description="Esconde a barra lateral e os cabeçalhos para sobrar só o conteúdo. Ctrl+. liga e desliga."
          />

          <div>
            <span className="label">Cor de destaque</span>
            <div className="flex flex-wrap items-center gap-2">
              {CORES_PADRAO.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setAccent(cor)}
                  title={cor}
                  aria-label={cor}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition',
                    accent === cor
                      ? 'border-ink-900 dark:border-white'
                      : 'border-ink-200 dark:border-ink-700',
                  )}
                  style={{ backgroundColor: cor }}
                />
              ))}
              <ColorWheel
                value={accent}
                onChange={setAccent}
                selected={corPersonalizada}
                title="Cor personalizada"
              />
              {accent !== ACCENT_PADRAO && (
                <button
                  type="button"
                  onClick={() => setAccent(ACCENT_PADRAO)}
                  className="ml-1 inline-flex items-center gap-1 text-xs text-ink-500 transition hover:text-ink-800 dark:hover:text-ink-200"
                >
                  <RotateCcw size={12} />
                  Restaurar cor
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">
              Esta cor será usada para botões e elementos ativos.
            </p>
          </div>

          {prefs.data && (
            <Field label="Tela inicial">
              <Select
                value={prefs.data.default_view}
                onChange={(e) => savePrefs.mutate({ default_view: e.target.value })}
              >
                <option value="dashboard">Início</option>
                <option value="calendar">Calendário</option>
                <option value="board">Quadro</option>
              </Select>
            </Field>
          )}
        </Section>

        <Section title="Dados" description="Faça backup ou importe seus dados.">
          {erroDados && <ErrorState message={erroDados} />}
          {resumo && (
            <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Check size={13} className="mt-0.5 shrink-0" />
              Importação concluída: {resumo.categorias} categorias, {resumo.pastas} pastas, {resumo.documentos} itens e {resumo.tarefas} tarefas.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={exportar} loading={exportando}>
              {exportando ? 'Exportando...' : 'Exportar Backup'}
            </Button>

            <input
              ref={backupRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => escolherBackup(e.target.files?.[0])}
            />
            <Button
              variant="secondary"
              icon={Upload}
              onClick={() => backupRef.current?.click()}
              loading={importando}
            >
              {importando ? 'Importando...' : 'Importar Backup'}
            </Button>
          </div>

          <Toggle
            checked={substituir}
            onChange={setSubstituir}
            label="Substituir dados atuais"
            description="Ao importar, apaga todos os dados existentes."
          />
        </Section>

        <Section
          title="Excluir conta"
          description="Esta ação é irreversível e apagará tudo."
        >
          <Field label="Senha" hint="Digite sua senha para confirmar a exclusão.">
            <Input
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button
            variant="danger"
            icon={Trash2}
            disabled={!deletePassword}
            onClick={() => setConfirmingDelete(true)}
          >
            Excluir minha conta
          </Button>
        </Section>
      </PageBody>

      <ConfirmDialog
        open={!!confirmarSubstituir}
        title="Confirmar substituição"
        message="Tem certeza? Seus dados atuais serão apagados permanentemente antes da importação."
        confirmLabel="Importar"
        onClose={() => {
          setConfirmarSubstituir(null)
          if (backupRef.current) backupRef.current.value = ''
        }}
        onConfirm={async () => {
          const file = confirmarSubstituir
          setConfirmarSubstituir(null)
          await enviarBackup(file)
        }}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="Excluir conta"
        message={
          <>
            Tem certeza? A conta <strong>{user?.username}</strong> e todo o seu conteúdo
            serão apagados permanentemente. Isso não pode ser desfeito.
          </>
        }
        confirmLabel="Excluir minha conta"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await api.delete('/me/', { data: { password: deletePassword } })
          tokenStore.clear()
          setUser(null)
        }}
      />
    </>
  )
}
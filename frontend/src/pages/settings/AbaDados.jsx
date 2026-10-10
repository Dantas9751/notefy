import { useRef, useState } from 'react'
import { Check, Download, Upload } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useWorkspace } from '@/context/WorkspaceContext'
import { Button, ErrorState } from '@/components/ui'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { baixar } from '@/lib/desktop'
import { Bloco, Chave } from './componentes'
import { t } from '@/lib/i18n'

export default function AbaDados() {
  const { refresh } = useWorkspace()

  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [substituir, setSubstituir] = useState(false)
  const [resumo, setResumo] = useState(null)
  const [erro, setErro] = useState(null)
  const [confirmarSubstituir, setConfirmarSubstituir] = useState(null)
  const arquivoRef = useRef(null)

  const exportar = async () => {
    setExportando(true)
    await baixar('notefy-backup.zip', async () => {
      const resposta = await api.get('/me/backup/', { responseType: 'blob' })
      const nome = /filename="([^"]+)"/.exec(resposta.headers['content-disposition'] ?? '')?.[1]
      return { blob: resposta.data, nome: nome ?? 'notefy-backup.zip' }
    })
    setExportando(false)
  }

  const enviar = async (file) => {
    setErro(null)
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
      setErro(extractError(err))
    } finally {
      setImportando(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  const escolher = (file) => {
    if (!file) return
    if (substituir) setConfirmarSubstituir(file)
    else enviar(file)
  }

  return (
    <>
      <Bloco
        title={t('Backup')}
        description={t('Seu conteúdo fica neste computador. O backup leva tudo num arquivo .zip: categorias, pastas, itens, arquivos e tarefas.')}
      >
        {erro && <ErrorState message={erro} />}
        {resumo && (
          <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Check size={13} className="mt-0.5 shrink-0" />
            {t('Importação concluída: {categorias} categorias, {pastas} pastas, {documentos} itens e {tarefas} tarefas.', resumo)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button icon={Download} onClick={exportar} loading={exportando}>
            {exportando ? t('Exportando...') : t('Exportar backup')}
          </Button>

          <input
            ref={arquivoRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => escolher(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            icon={Upload}
            onClick={() => arquivoRef.current?.click()}
            loading={importando}
          >
            {importando ? t('Importando...') : t('Importar backup')}
          </Button>
        </div>

        <Chave
          checked={substituir}
          onChange={setSubstituir}
          label={t('Substituir o conteúdo atual')}
          description={t('Sem marcar, o backup é adicionado ao que você já tem e nada é apagado.')}
        />
      </Bloco>

      <ConfirmDialog
        open={!!confirmarSubstituir}
        title={t('Substituir tudo?')}
        message={t('Seus dados atuais serão apagados permanentemente antes da importação.')}
        confirmLabel={t('Importar')}
        onClose={() => {
          setConfirmarSubstituir(null)
          if (arquivoRef.current) arquivoRef.current.value = ''
        }}
        onConfirm={async () => {
          const file = confirmarSubstituir
          setConfirmarSubstituir(null)
          await enviar(file)
        }}
      />
    </>
  )
}

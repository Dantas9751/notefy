import { useRef, useState } from 'react'
import { Check, Download, Upload } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { useWorkspace } from '@/context/WorkspaceContext'
import { Button, ErrorState } from '@/components/ui'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { salvarArquivo } from '@/lib/desktop'
import { Bloco, Chave } from './componentes'

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
    setErro(null)
    setExportando(true)
    try {
      const resposta = await api.get('/me/backup/', { responseType: 'blob' })
      const nome =
        /filename="([^"]+)"/.exec(resposta.headers['content-disposition'] ?? '')?.[1] ??
        'notefy-backup.zip'
      await salvarArquivo(resposta.data, nome)
    } catch (err) {
      setErro(extractError(err))
    } finally {
      setExportando(false)
    }
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
        title="Backup"
        description="Seu conteúdo fica neste computador. O backup leva tudo num arquivo .zip: categorias, pastas, itens, arquivos e tarefas."
      >
        {erro && <ErrorState message={erro} />}
        {resumo && (
          <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Check size={13} className="mt-0.5 shrink-0" />
            Importação concluída: {resumo.categorias} categorias, {resumo.pastas} pastas,{' '}
            {resumo.documentos} itens e {resumo.tarefas} tarefas.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button icon={Download} onClick={exportar} loading={exportando}>
            {exportando ? 'Exportando...' : 'Exportar backup'}
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
            {importando ? 'Importando...' : 'Importar backup'}
          </Button>
        </div>

        <Chave
          checked={substituir}
          onChange={setSubstituir}
          label="Substituir o conteúdo atual"
          description="Sem marcar, o backup é adicionado ao que você já tem e nada é apagado."
        />
      </Bloco>

      <ConfirmDialog
        open={!!confirmarSubstituir}
        title="Substituir tudo?"
        message="Seus dados atuais serão apagados permanentemente antes da importação."
        confirmLabel="Importar"
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

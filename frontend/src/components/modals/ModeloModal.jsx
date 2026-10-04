import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import api, { extractError } from '@/lib/api'
import { Button, Field, Input, Modal, Textarea } from '@/components/ui'
import { t } from '@/lib/i18n'

/**
 * "Salvar como modelo" de um item, ou renomear um modelo salvo.
 *
 * Salvar copia o item no servidor (`document`): o modelo é uma foto do que
 * o item é agora, e editar o item depois não mexe nele. Ao terminar, o
 * modal diz onde o modelo foi parar — sem isso a pessoa salvaria e não
 * saberia como usar.
 */
export default function ModeloModal({ open, onClose, documento = null, modelo = null, onSalvo }) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const [pronto, setPronto] = useState(false)
  const nomeRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return undefined
    setNome((modelo?.name ?? documento?.title ?? '').slice(0, 120))
    setDescricao(modelo?.description ?? '')
    setErro(null)
    setPronto(false)
    const id = setTimeout(() => nomeRef.current?.select(), 0)
    return () => clearTimeout(id)
  }, [open, modelo, documento])

  const salvar = async () => {
    if (!nome.trim() || salvando) return
    setSalvando(true)
    setErro(null)
    try {
      const corpo = { name: nome.trim(), description: descricao.trim() }
      const { data } = modelo
        ? await api.patch(`/templates/${modelo.id}/`, corpo)
        : await api.post('/templates/', { ...corpo, document: documento.id })
      onSalvo?.(data)
      if (modelo) onClose()
      else setPronto(true)
    } catch (err) {
      setErro(extractError(err))
    } finally {
      setSalvando(false)
    }
  }

  if (pronto) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={t('Modelo salvo')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('Fechar')}
            </Button>
            <Button
              onClick={() => {
                onClose()
                navigate('/templates')
              }}
            >
              {t('Ver modelos')}
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-sm text-ink-600 dark:text-ink-300">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
          {t('"{nome}" está em Modelos, na barra lateral. Use para começar itens novos já com este conteúdo.', { nome: nome.trim() })}
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modelo ? t('Editar modelo') : t('Salvar como modelo')}
      description={modelo ? null : t('Uma cópia do conteúdo de agora. O item original não muda.')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          <Button onClick={salvar} loading={salvando} disabled={!nome.trim()}>
            {t('Salvar')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('Nome')} error={erro}>
          <Input
            ref={nomeRef}
            value={nome}
            maxLength={120}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                salvar()
              }
            }}
          />
        </Field>
        <Field label={t('Descrição (opcional)')}>
          <Textarea rows={2} maxLength={300} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

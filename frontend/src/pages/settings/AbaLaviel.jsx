import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button, Field, Input, Select } from '@/components/ui'
import { Bloco } from './componentes'
import { usePreferencias } from './index'

export default function AbaLaviel() {
  const { prefs, savePrefs } = usePreferencias()

  // A chave fica só no backend: o GET devolve `ai_key_set` (booleano),
  // nunca a chave em si. O campo local começa vazio e só é enviado
  // quando o usuário digita algo; vazio enviado remove.
  const [ai, setAi] = useState({ provider: '', key: '', model: '', baseUrl: '' })
  const [iniciado, setIniciado] = useState(false)

  useEffect(() => {
    if (!iniciado && prefs.data) {
      setAi({
        provider: prefs.data.ai_provider || '',
        key: '',
        model: prefs.data.ai_model || '',
        baseUrl: prefs.data.ai_base_url || '',
      })
      setIniciado(true)
    }
  }, [prefs.data, iniciado])

  const salvar = async () => {
    const payload = {
      ai_provider: ai.provider,
      ai_model: ai.model,
      ai_base_url: ai.provider === 'custom' || ai.provider === 'ollama' ? ai.baseUrl : '',
    }
    if (ai.key) payload.ai_key = ai.key
    await savePrefs.mutate(payload)
    setAi((a) => ({ ...a, key: '' }))
  }

  const removerChave = async () => {
    // Limpa a configuração toda (provedor, url, modelo e chave), não só a
    // chave: assim o app volta ao estado "sem IA" e o painel volta a
    // oferecer configurar. Mandar só `ai_key: ''` deixava o provedor
    // marcado e a tela achava que ainda tinha IA.
    await savePrefs.mutate({
      ai_provider: '',
      ai_base_url: '',
      ai_model: '',
      ai_key: '',
    })
    setAi({ provider: '', key: '', model: '', baseUrl: '' })
  }

  return (
    <Bloco
      title="Laviel"
      description="O assistente de estudos do Notefy: o chat (Ctrl+J), as ações de IA dos editores e a busca por pergunta. Escolha um provedor para ligá-lo. A chave fica guardada só neste computador."
    >
      {iniciado && (
        <>
          <Field label="Provedor">
            <Select
              value={ai.provider}
              onChange={(e) => setAi((a) => ({ ...a, provider: e.target.value }))}
            >
              <option value="">Desativado</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Ollama (local)</option>
              <option value="custom">Personalizado (compatível com OpenAI)</option>
            </Select>
          </Field>

          {ai.provider && (
            <>
              {(ai.provider === 'custom' || ai.provider === 'ollama') && (
                <Field
                  label="URL base"
                  hint={
                    ai.provider === 'ollama'
                      ? 'Opcional. Vazio usa http://localhost:11434/v1.'
                      : 'Endereço do serviço, com ou sem /v1. Ex.: https://api.9router.com/v1'
                  }
                >
                  <Input
                    value={ai.baseUrl}
                    onChange={(e) => setAi((a) => ({ ...a, baseUrl: e.target.value }))}
                    placeholder={
                      ai.provider === 'ollama'
                        ? 'http://localhost:11434/v1'
                        : 'https://api.9router.com/v1'
                    }
                  />
                </Field>
              )}

              <Field
                label="Chave de API"
                hint={
                  ai.provider === 'ollama'
                    ? 'O Ollama roda na sua máquina e normalmente não pede chave.'
                    : 'Enviada apenas para o servidor local do Notefy.'
                }
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={ai.key}
                  onChange={(e) => setAi((a) => ({ ...a, key: e.target.value }))}
                  placeholder={
                    prefs.data?.ai_key_set ? '••••••••••••••••••••' : 'Cole sua chave'
                  }
                />
              </Field>

              <Field
                label="Modelo"
                hint={
                  ai.provider === 'custom'
                    ? 'Obrigatório: use o nome exato que o seu serviço espera.'
                    : 'Opcional. Vazio usa o padrão do provedor.'
                }
              >
                <Input
                  value={ai.model}
                  onChange={(e) => setAi((a) => ({ ...a, model: e.target.value }))}
                  placeholder={
                    ai.provider === 'ollama' ? 'llama3.2'
                    : ai.provider === 'custom' ? 'ex.: opencode'
                    : 'ex.: gpt-4o-mini'
                  }
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <Button icon={Check} onClick={salvar} loading={savePrefs.loading}>
                  Salvar configuração
                </Button>
                {prefs.data?.ai_key_set && (
                  <Button variant="secondary" onClick={removerChave}>
                    Remover chave
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Bloco>
  )
}

import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import api, { extractError, tokenStore } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button, ErrorState, Field, Input } from '@/components/ui'
import ConfirmDialog from '@/components/modals/ConfirmDialog'
import { Bloco } from './componentes'
import { t } from '@/lib/i18n'

/**
 * As duas coisas que pedem a senha: trocá-la e apagar a conta.
 *
 * Ficavam em telas diferentes (a troca em Perfil, a exclusão no fim de
 * Configurações). São o mesmo assunto e a mesma confirmação, e juntas
 * elas ficam onde alguém as procura de verdade — em vez de a exclusão
 * aparecer de surpresa embaixo do backup.
 */
export default function AbaSeguranca() {
  const { user, setUser } = useAuth()

  const [senhas, setSenhas] = useState({ current_password: '', new_password: '' })
  const [senhaSalva, setSenhaSalva] = useState(false)
  const [erroSenha, setErroSenha] = useState(null)
  const [trocando, setTrocando] = useState(false)

  const [senhaExclusao, setSenhaExclusao] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const trocarSenha = async (e) => {
    e.preventDefault()
    setSenhaSalva(false)
    setErroSenha(null)
    setTrocando(true)
    try {
      // A troca derruba todas as sessões, inclusive esta: o servidor
      // devolve um par novo, e sem guardá-lo a pessoa seria deslogada
      // no próximo refresh, minutos depois de ter trocado a senha.
      const { data } = await api.post('/auth/change-password/', senhas)
      tokenStore.set(data)
      setSenhas({ current_password: '', new_password: '' })
      setSenhaSalva(true)
    } catch (err) {
      setErroSenha(extractError(err))
    } finally {
      setTrocando(false)
    }
  }

  return (
    <>
      <Bloco title={t('Senha')} description={t('Troque a senha de entrada no aplicativo.')}>
        {erroSenha && <ErrorState message={erroSenha} />}
        <form onSubmit={trocarSenha} className="space-y-4">
          <Field label={t('Senha atual')}>
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
          <Field label={t('Nova senha')} hint={t('Mínimo de 8 caracteres.')}>
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
            <Button type="submit" variant="secondary" loading={trocando}>
              {t('Alterar senha')}
            </Button>
            {senhaSalva && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check size={13} /> {t('Senha alterada')}
              </span>
            )}
          </div>
        </form>
      </Bloco>

      <Bloco
        title={t('Excluir conta')}
        description={t('Apaga a conta e tudo que está nela: categorias, pastas, notas, arquivos, planilhas, diagramas, canvas e tarefas. Não há como desfazer.')}
      >
        <Field label={t('Senha')} hint={t('Confirme sua senha para liberar a exclusão.')}>
          <Input
            type="password"
            autoComplete="current-password"
            value={senhaExclusao}
            onChange={(e) => setSenhaExclusao(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button
          variant="danger"
          icon={Trash2}
          disabled={!senhaExclusao}
          onClick={() => setConfirmando(true)}
        >
          {t('Excluir minha conta')}
        </Button>
      </Bloco>

      <ConfirmDialog
        open={confirmando}
        title={t('Excluir conta')}
        message={
          <>
            {t('A conta')} <strong>{user?.username}</strong> {t('e todo o seu conteúdo serão apagados permanentemente. Isso não pode ser desfeito.')}
          </>
        }
        confirmLabel={t('Excluir minha conta')}
        onClose={() => setConfirmando(false)}
        // Sem try/catch: o `ConfirmDialog` já mostra o erro da API
        // dentro dele, e senha errada volta 400. Engolir aqui fecharia o
        // diálogo calado, como se a conta tivesse sido apagada.
        onConfirm={async () => {
          await api.delete('/me/', { data: { password: senhaExclusao } })
          tokenStore.clear()
          setUser(null)
        }}
      />
    </>
  )
}

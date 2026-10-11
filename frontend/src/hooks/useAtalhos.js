import { useSyncExternalStore } from 'react'
import { assinar, versao } from '@/lib/atalhos'

/** Redesenha quem usa quando as teclas são salvas em Configurações → Atalhos. */
export default function useAtalhos() {
  return useSyncExternalStore(assinar, versao)
}

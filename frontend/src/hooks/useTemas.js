import { useSyncExternalStore } from 'react'
import { assinarTemas, temasPersonalizados, versaoDeTemas } from '@/lib/temas'

/** Os temas personalizados, e redesenha quem usa quando um é criado, editado ou apagado. */
export default function useTemas() {
  useSyncExternalStore(assinarTemas, versaoDeTemas)
  return temasPersonalizados()
}

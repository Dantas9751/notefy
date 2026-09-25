import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { UIProvider } from '@/context/UIContext'
import { WorkspaceProvider } from '@/context/WorkspaceContext'
import { TabsProvider } from '@/context/TabsContext'
import { SplitProvider } from '@/context/SplitContext'
import { AssistenteProvider } from '@/context/AssistenteContext'
import { Spinner } from '@/components/ui'
import AppLayout from '@/components/layout/AppLayout'

import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Home from '@/pages/Home'
import Recent from '@/pages/Recent'
import Files from '@/pages/Files'
import CategoryDetail from '@/pages/CategoryDetail'
import FolderDetail from '@/pages/FolderDetail'
import DocumentEditor from '@/pages/DocumentEditor'
import FileViewer from '@/pages/FileViewer'
import Calendar from '@/pages/Calendar'
import Board from '@/pages/Board'
import SearchPage from '@/pages/Search'
import Settings from '@/pages/settings'
import AbaAparencia from '@/pages/settings/AbaAparencia'
import AbaConta from '@/pages/settings/AbaConta'
import AbaNotificacoes from '@/pages/settings/AbaNotificacoes'
import AbaLaviel from '@/pages/settings/AbaLaviel'
import AbaDados from '@/pages/settings/AbaDados'
import AbaSeguranca from '@/pages/settings/AbaSeguranca'
import Trash from '@/pages/Trash'
import Roadmap from '@/pages/Roadmap'
import NotFound from '@/pages/NotFound'

/**
 * Cada tipo tem sua rota de edição, mas todas apontam para o mesmo
 * componente: é o `kind` que troca o miolo do editor. Não há rota de
 * LISTAGEM por tipo — navegar é entrar em categoria e depois em pasta.
 */
const EDITOR_ROUTES = [
  { path: 'notes', kind: 'note' },
  { path: 'sheets', kind: 'spreadsheet' },
  { path: 'diagrams', kind: 'diagram' },
  { path: 'canvas', kind: 'canvas' },
]

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-white dark:bg-ink-950">
      <Spinner size={22} />
    </div>
  )
}

/** Exige sessão. Guarda a rota pretendida para voltar após o login. */
function ProtectedRoute({ children }) {
  const { isAuthenticated, booting } = useAuth()
  const location = useLocation()

  if (booting) return <FullScreenLoader />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

/** Impede que quem já está logado veja login/cadastro. */
function PublicOnlyRoute({ children }) {
  const { isAuthenticated, booting } = useAuth()
  if (booting) return <FullScreenLoader />
  if (isAuthenticated) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <Register />
          </PublicOnlyRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <WorkspaceProvider>
              <TabsProvider>
                <SplitProvider>
                  <AssistenteProvider>
                    <AppLayout />
                  </AssistenteProvider>
                </SplitProvider>
              </TabsProvider>
            </WorkspaceProvider>
          </ProtectedRoute>
        }
      >
        {/* Navegação: Início → categoria → pasta → item */}
        <Route index element={<Home />} />
        <Route path="categories/:id" element={<CategoryDetail />} />
        <Route path="folders/:id" element={<FolderDetail />} />

        {EDITOR_ROUTES.map(({ path, kind }) => (
          <Route key={path} path={path}>
            <Route path="new" element={<DocumentEditor mode="create" kind={kind} />} />
            <Route path=":id" element={<DocumentEditor kind={kind} />} />
          </Route>
        ))}

        <Route path="files">
          <Route index element={<Files />} />
          <Route path=":id" element={<FileViewer />} />
        </Route>

        <Route path="recent" element={<Recent />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="board" element={<Board />} />
        <Route path="calendar" element={<Calendar />} />
        {/* Uma aba, uma URL: dá para recarregar sem cair na primeira,
            voltar com o botão do navegador e guardar o endereço. */}
        <Route path="settings" element={<Settings />}>
          <Route index element={<Navigate to="aparencia" replace />} />
          <Route path="aparencia" element={<AbaAparencia />} />
          <Route path="conta" element={<AbaConta />} />
          <Route path="notificacoes" element={<AbaNotificacoes />} />
          <Route path="laviel" element={<AbaLaviel />} />
          <Route path="dados" element={<AbaDados />} />
          <Route path="seguranca" element={<AbaSeguranca />} />
        </Route>
        {/* O perfil virou a aba "Conta". A rota antiga continua de pé
            porque ela está em atalhos e em janelas já abertas. */}
        <Route path="profile" element={<Navigate to="/settings/conta" replace />} />
        <Route path="trash" element={<Trash />} />
        <Route path="roadmap" element={<Roadmap />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  // Suprime o menu de contexto do navegador em TODA a aplicação.
  // O Notefy tem seus próprios menus. Inputs/textareas mantêm o nativo.
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName
      const editavel =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        e.target.isContentEditable
      if (!editavel) e.preventDefault()
    }
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  return (
    <UIProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </UIProvider>
  )
}

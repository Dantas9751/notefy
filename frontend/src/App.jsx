import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { UIProvider } from '@/context/UIContext'
import { WorkspaceProvider } from '@/context/WorkspaceContext'
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
import Settings from '@/pages/Settings'
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
              <AppLayout />
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
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <UIProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </UIProvider>
  )
}

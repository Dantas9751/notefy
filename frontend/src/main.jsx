import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Uma janela destacada nasce em `/?open=/notes/<id>`, e não direto na
// rota: no desktop a janela faz um carregamento de verdade, e o
// `index.html` precisa ser encontrado como arquivo antes de existir React
// para interpretar o caminho. Desviar aqui, ANTES de montar, é o que
// impede a rota real de piscar como "página não encontrada".
// `//outro.site` também começa com barra e sairia da origem — daí a
// segunda checagem.
const rotaPedida = new URLSearchParams(window.location.search).get('open')
if (rotaPedida?.startsWith('/') && !rotaPedida.startsWith('//')) {
  window.history.replaceState(null, '', rotaPedida)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// `tauri android dev` avisa por aqui o endereço da máquina na rede: o celular
// acessa o Vite por esse IP (e o proxy abaixo leva /api até o Django do PC).
const hostDeDev = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    host: hostDeDev || undefined,
    hmr: hostDeDev ? { protocol: 'ws', host: hostDeDev, port: 5174 } : undefined,
    // Proxy para o Django: em dev o navegador só fala com :5173, o que
    // mantém as chamadas same-origin e tira o CORS do caminho.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})

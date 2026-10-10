// Copia o Pyodide do node_modules para public/pyodide, de onde o worker
// dos blocos de código o carrega (src/lib/executar/python.js). Vai junto
// no build: o Python da nota roda sem internet. Roda no `npm install`.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const origem = join(raiz, 'node_modules', 'pyodide')
const destino = join(raiz, 'public', 'pyodide')
// Só o núcleo: pacotes como numpy ficam de fora (centenas de MB).
const ARQUIVOS = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']

mkdirSync(destino, { recursive: true })
for (const arquivo of ARQUIVOS) copyFileSync(join(origem, arquivo), join(destino, arquivo))

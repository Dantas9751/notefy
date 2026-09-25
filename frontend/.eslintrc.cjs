/**
 * Config mínima, com um objetivo: pegar identificador que não existe.
 *
 * O `vite build` não reclama de um `<Download />` cujo import foi
 * removido — o bundle sai limpo e o erro só aparece como tela branca em
 * runtime. `no-undef` com o plugin de JSX é o que transforma isso num
 * erro de terminal, que é onde ele custa segundos em vez de uma sessão
 * de depuração.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  plugins: ['react', 'react-hooks'],
  rules: {
    // O que motivou esta config.
    'no-undef': 'error',
    // Marca o componente JSX como "usado", senão todo import de
    // componente vira falso positivo de no-unused-vars.
    'react/jsx-uses-vars': 'error',
    'react/jsx-uses-react': 'error',
    // Import que sobrou depois de uma remoção: aviso, não erro — não
    // quebra nada em runtime, mas suja o bundle.
    'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
    'react-hooks/rules-of-hooks': 'error',
  },
  ignorePatterns: ['dist', 'node_modules', 'src-tauri'],
}

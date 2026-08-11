/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Stack de sistema: zero requisição de rede, renderização imediata
        // e a fonte nativa de cada SO — o que mantém a leitura confortável
        // em sessões longas de estudo.
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Cinzas levemente quentes — o cinza puro do Tailwind fica frio
        // demais numa tela de leitura predominantemente branca.
        ink: {
          50: '#faf9f8',
          100: '#f4f2f0',
          200: '#e9e6e2',
          300: '#d7d2cc',
          400: '#a8a29b',
          500: '#7c766e',
          600: '#5c574f',
          700: '#403c36',
          800: '#2a2724',
          900: '#1a1816',
          950: '#0f0e0d',
        },
        accent: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      fontSize: {
        // Corpo de texto ligeiramente maior e com entrelinha generosa.
        base: ['0.9375rem', { lineHeight: '1.7' }],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        pop: '0 10px 30px -12px rgb(0 0 0 / 0.18), 0 4px 12px -6px rgb(0 0 0 / 0.08)',
      },
      maxWidth: {
        // ~70 caracteres por linha, a faixa confortável de leitura.
        prose: '46rem',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}

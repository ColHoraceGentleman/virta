/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        'primary-hover': '#4f46e5',
        surface: {
          dark: '#0f172a',
          'dark-2': '#1e293b',
          'dark-3': '#334155'
        }
      }
    }
  },
  plugins: []
};
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      },
      colors: {
        slate: {
          950: 'rgb(var(--color-slate-950) / <alpha-value>)',
          900: 'rgb(var(--color-slate-900) / <alpha-value>)',
          850: 'rgb(var(--color-slate-850) / <alpha-value>)',
          800: 'rgb(var(--color-slate-800) / <alpha-value>)',
          750: 'rgb(var(--color-slate-750) / <alpha-value>)',
          700: 'rgb(var(--color-slate-700) / <alpha-value>)',
          500: 'rgb(var(--color-slate-500) / <alpha-value>)',
          400: 'rgb(var(--color-slate-400) / <alpha-value>)',
          350: 'rgb(var(--color-slate-350) / <alpha-value>)',
          300: 'rgb(var(--color-slate-300) / <alpha-value>)',
          200: 'rgb(var(--color-slate-200) / <alpha-value>)',
          100: 'rgb(var(--color-slate-100) / <alpha-value>)',
        },
        zinc: {
          950: 'rgb(var(--color-zinc-950) / <alpha-value>)',
          900: 'rgb(var(--color-zinc-900) / <alpha-value>)',
          800: 'rgb(var(--color-zinc-800) / <alpha-value>)',
          700: 'rgb(var(--color-zinc-700) / <alpha-value>)',
          500: 'rgb(var(--color-zinc-500) / <alpha-value>)',
          400: 'rgb(var(--color-zinc-400) / <alpha-value>)',
          300: 'rgb(var(--color-zinc-300) / <alpha-value>)',
          200: 'rgb(var(--color-zinc-200) / <alpha-value>)',
          100: 'rgb(var(--color-zinc-100) / <alpha-value>)',
        }
      }
    },
  },
  plugins: [],
}

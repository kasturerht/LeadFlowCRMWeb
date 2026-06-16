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
          650: 'rgb(var(--color-slate-650) / <alpha-value>)',
          505: 'rgb(var(--color-slate-505) / <alpha-value>)',
          500: 'rgb(var(--color-slate-500) / <alpha-value>)',
          450: 'rgb(var(--color-slate-450) / <alpha-value>)',
          400: 'rgb(var(--color-slate-400) / <alpha-value>)',
          350: 'rgb(var(--color-slate-350) / <alpha-value>)',
          300: 'rgb(var(--color-slate-300) / <alpha-value>)',
          202: 'rgb(var(--color-slate-202) / <alpha-value>)',
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
        },
        violet: {
          300: 'rgb(var(--color-violet-300) / <alpha-value>)',
          400: 'rgb(var(--color-violet-400) / <alpha-value>)',
          500: 'rgb(var(--color-violet-500) / <alpha-value>)',
          600: 'rgb(var(--color-violet-600) / <alpha-value>)',
        },
        cyan: {
          300: 'rgb(var(--color-cyan-300) / <alpha-value>)',
          400: 'rgb(var(--color-cyan-400) / <alpha-value>)',
          500: 'rgb(var(--color-cyan-500) / <alpha-value>)',
          600: 'rgb(var(--color-cyan-600) / <alpha-value>)',
        },
        emerald: {
          300: 'rgb(var(--color-emerald-300) / <alpha-value>)',
          400: 'rgb(var(--color-emerald-400) / <alpha-value>)',
          500: 'rgb(var(--color-emerald-500) / <alpha-value>)',
          600: 'rgb(var(--color-emerald-600) / <alpha-value>)',
        },
        sky: {
          300: 'rgb(var(--color-sky-300) / <alpha-value>)',
          400: 'rgb(var(--color-sky-400) / <alpha-value>)',
          500: 'rgb(var(--color-sky-500) / <alpha-value>)',
          600: 'rgb(var(--color-sky-600) / <alpha-value>)',
        },
        amber: {
          300: 'rgb(var(--color-amber-300) / <alpha-value>)',
          400: 'rgb(var(--color-amber-400) / <alpha-value>)',
          500: 'rgb(var(--color-amber-500) / <alpha-value>)',
          600: 'rgb(var(--color-amber-600) / <alpha-value>)',
        },
        indigo: {
          300: 'rgb(var(--color-indigo-300) / <alpha-value>)',
          400: 'rgb(var(--color-indigo-400) / <alpha-value>)',
          500: 'rgb(var(--color-indigo-500) / <alpha-value>)',
          600: 'rgb(var(--color-indigo-600) / <alpha-value>)',
        },
        red: {
          300: 'rgb(var(--color-red-300) / <alpha-value>)',
          400: 'rgb(var(--color-red-400) / <alpha-value>)',
          500: 'rgb(var(--color-red-500) / <alpha-value>)',
          600: 'rgb(var(--color-red-600) / <alpha-value>)',
        }
      }
    },
  },
  plugins: [],
}

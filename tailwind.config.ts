import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm therapeutic palette
        sage: {
          50: '#f6f7f6',
          100: '#e3e7e3',
          200: '#c7d0c7',
          300: '#a3b2a3',
          400: '#7d917d',
          500: '#627562',
          600: '#4d5d4d',
          700: '#404c40',
          800: '#363f36',
          900: '#2e352e',
          950: '#171c17',
        },
        warm: {
          50: '#faf8f6',
          100: '#f3efe9',
          200: '#e6ddd2',
          300: '#d5c6b4',
          400: '#c1a992',
          500: '#b19478',
          600: '#a4836a',
          700: '#896b59',
          800: '#70584c',
          900: '#5b4940',
          950: '#302521',
        },
        calm: {
          50: '#f4f7f9',
          100: '#e2eaf0',
          200: '#c9d8e3',
          300: '#a3bdce',
          400: '#769cb5',
          500: '#56809c',
          600: '#446884',
          700: '#3a556c',
          800: '#33495a',
          900: '#2e3f4d',
          950: '#1e2933',
        },
        therapy: {
          background: '#faf9f7',
          card: '#ffffff',
          border: '#e8e5e0',
          text: '#3d3d3d',
          muted: '#8a8a8a',
          accent: '#6b8f71',
          accentHover: '#5a7a5f',
          warning: '#d4a373',
          danger: '#c9615b',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-source-serif)', 'Georgia', 'serif'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config


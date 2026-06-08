import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefcf7',
          100: '#d6f7ea',
          200: '#aceed5',
          300: '#77dfbb',
          400: '#32c89b',
          500: '#14a97f',
          600: '#0e8866',
          700: '#0d6c53',
          800: '#0e5643',
          900: '#0d4537',
        },
        sand: {
          50: '#fffaf3',
          100: '#f8f0e4',
          200: '#ecdec7',
          300: '#dfc6a4',
          400: '#cda074',
        },
        ink: {
          900: '#10281f',
          800: '#1e3a30',
          700: '#2f4d42',
        },
      },
      boxShadow: {
        glow: '0 24px 90px rgba(16, 40, 31, 0.12)',
        card: '0 18px 45px rgba(16, 40, 31, 0.08)',
      },
      fontFamily: {
        sans: ['Aptos', 'Aptos Display', 'Segoe UI Variable', 'Candara', 'sans-serif'],
        display: ['Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;

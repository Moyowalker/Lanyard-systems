import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Confident healthcare teal — the brand spine. Clean, trustworthy, modern.
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // Deep teal-charcoal for dark chrome and high-contrast headings/text.
        ink: {
          700: '#134e4a',
          800: '#0f3b39',
          900: '#0b2b2a',
          950: '#07201f',
        },
        // Cool neutral surfaces — the crisp canvas a fast pharmacy sits on.
        paper: {
          DEFAULT: '#f6f8f8',
          50: '#fbfdfc',
          100: '#eef2f2',
          200: '#dde5e4',
        },
        // Amber accent — reserved for the prescription (℞) lane.
        seal: {
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#f59e0b',
        },
      },
      fontFamily: {
        // One clean sans across the board — no serif drama.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        // Flat, low-spread — crisp cards, not glassy float.
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        lift: '0 4px 14px -4px rgba(15, 23, 42, 0.12), 0 2px 6px -3px rgba(15, 23, 42, 0.08)',
        focus: '0 0 0 3px rgba(13, 148, 136, 0.22)',
      },
      borderRadius: {
        card: '1rem',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;

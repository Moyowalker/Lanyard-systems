import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Confident healthcare teal — unified with the storefront brand.
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
        ink: {
          700: '#134e4a',
          800: '#0f3b39',
          900: '#0b2b2a',
          950: '#07201f',
        },
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
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        display: [
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        lift: '0 4px 14px -4px rgba(15, 23, 42, 0.12), 0 2px 6px -3px rgba(15, 23, 42, 0.08)',
        glow: '0 4px 14px -4px rgba(15, 23, 42, 0.12), 0 2px 6px -3px rgba(15, 23, 42, 0.08)',
        focus: '0 0 0 3px rgba(13, 148, 136, 0.22)',
      },
    },
  },
  plugins: [],
};

export default config;

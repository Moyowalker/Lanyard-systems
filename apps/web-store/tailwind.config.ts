import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Clinical evergreen — the brand spine. Deep and trustworthy, not neon.
        brand: {
          50: '#f0f7f4',
          100: '#dbece4',
          200: '#b9dacd',
          300: '#8cc0ae',
          400: '#5aa088',
          500: '#38826b',
          600: '#276a56',
          700: '#1f5547',
          800: '#1b4439',
          900: '#173830',
          950: '#0b211c',
        },
        // Teal-tinted near-black for dark chrome and high-contrast text.
        ink: {
          700: '#1d3b34',
          800: '#152c27',
          900: '#0e201c',
          950: '#081512',
        },
        // Warm paper neutrals — the calm canvas premium healthcare sits on.
        paper: {
          DEFAULT: '#f6f4ee',
          50: '#fbfaf6',
          100: '#f3f1ea',
          200: '#e8e4d9',
        },
        // A single restrained accent: a verification seal, used sparingly.
        seal: {
          100: '#f3ead2',
          200: '#e7d4a6',
          300: '#d8b86c',
          400: '#c79a3e',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'Cambria', 'serif'],
      },
      boxShadow: {
        // Soft, layered, low-spread — a printed-card feel rather than glassy float.
        card: '0 1px 2px rgba(11, 33, 28, 0.04), 0 12px 28px -18px rgba(11, 33, 28, 0.28)',
        lift: '0 2px 6px rgba(11, 33, 28, 0.05), 0 28px 56px -30px rgba(11, 33, 28, 0.4)',
        seal: '0 14px 30px -16px rgba(31, 85, 71, 0.7)',
        focus: '0 0 0 3px rgba(39, 106, 86, 0.25)',
      },
      borderRadius: {
        card: '1.25rem',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        sheen: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;

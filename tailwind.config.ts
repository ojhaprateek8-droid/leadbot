import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dae6ff',
          200: '#bdd2ff',
          300: '#90b4ff',
          400: '#578bff',
          500: '#2f66f5',
          600: '#1d47e0',
          700: '#1a3ac1',
          800: '#1b319c',
          900: '#1c2e7b'
        }
      }
    }
  },
  plugins: []
};

export default config;

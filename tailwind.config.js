/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6f7f9',
          100: '#edeef2',
          200: '#d7dbe3',
          300: '#b4bccb',
          400: '#8c97ae',
          500: '#6d7b95',
          600: '#56627b',
          700: '#454f64',
          800: '#3c4354',
          900: '#343a47',
          950: '#232730',
        },
        terracotta: {
          50: '#fdf6f2',
          100: '#faeae1',
          200: '#f4d2c0',
          300: '#ecb297',
          400: '#e18868',
          500: '#d86641',
          600: '#c74f2d',
          700: '#a63d24',
          800: '#863423',
          900: '#6f2e21',
          950: '#3b150f',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

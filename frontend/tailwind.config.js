/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef7f4',
          100: '#d5ebe4',
          200: '#aed7ca',
          300: '#7fbfac',
          400: '#53a38c',
          500: '#1f6f5c',
          600: '#1a5d4d',
          700: '#154b3f',
          800: '#103a31',
          900: '#0b2923',
          950: '#071a16',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Noto Sans Devanagari"', '"Nirmala UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

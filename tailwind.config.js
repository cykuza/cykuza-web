/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './context/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom neutral colors - used throughout the application
        neutral: {
          100: '#d2d2d2',
          200: '#67686b',
          300: '#404040',
          400: '#3b3b3b',
          500: '#2d2d2d',
          600: '#282828',
          700: '#171717',
          800: '#141414',
        },
        // Custom yellow for warning boxes
        yellow: {
          200: '#e7b64d',
        },
      },
      fontFamily: {
        // Hack font is applied globally via globals.css
        sans: ['Hack', 'monospace'],
        mono: ['Hack', 'monospace'],
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'anniversary-gold': '#D4AF37',
        'anniversary-dark': '#0F172A',
      }
    },
  },
  plugins: [],
}

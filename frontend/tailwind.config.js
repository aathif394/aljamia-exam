/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff5f7',
          100: '#ffe5eb',
          200: '#ffccd9',
          300: '#ffa3ba',
          400: '#ff6b8e',
          500: '#f0305f',
          600: '#ce1743',
          700: '#72132c', // Official Brand Maroon
          800: '#5d1024',
          900: '#4b0d1c',
          950: '#2e0811',
        },
        gold: {
          50:  '#f9f6f0',
          100: '#f1e9d9',
          200: '#e1d0b0',
          300: '#d0b585',
          400: '#c5a059',
          500: '#b68e4a',
          600: '#9b763c',
          700: '#7e5f31',
          800: '#644b29',
          900: '#4d3b22',
          950: '#2b2112',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Cairo', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
        DEFAULT: '0.375rem',
      },
    },
  },
  plugins: [],
}

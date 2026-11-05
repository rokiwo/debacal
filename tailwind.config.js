/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        rounded: ["'Zen Maru Gothic'", "'M PLUS Rounded 1c'", 'sans-serif'],
      },
      colors: {
        milktea: '#FFFBF7',
        sakura: {
          DEFAULT: '#FF8FAB',
          light: '#FFE5EC',
          dark: '#E06C88',
        },
        mint: {
          DEFAULT: '#56CFE1',
          light: '#E2F9FC',
          dark: '#2EA8BA',
        },
        lavender: {
          DEFAULT: '#B388EB',
          light: '#F3EAFF',
          dark: '#8C5EC7',
        },
        mimosa: {
          DEFAULT: '#FFB703',
          light: '#FFF6D6',
          dark: '#D49600',
        },
        sage: {
          DEFAULT: '#52B788',
          light: '#E6F7EF',
          dark: '#389268',
        },
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.92)' },
          '50%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-3px)' },
        },
      },
      animation: {
        pop: 'pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        float: 'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

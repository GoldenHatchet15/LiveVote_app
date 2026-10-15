/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // LiveVote brand — Holberton-inspired red & white, with its own identity.
        brand: {
          DEFAULT: '#e4002b',
          50: '#fff1f2',
          100: '#ffe0e3',
          600: '#e4002b',
          700: '#b8001f',
          900: '#5c0010',
        },
        ink: '#11131a',
        // Answer-shape palette, matching shared OPTION_SHAPES.
        shape: {
          red: '#e4002b',
          blue: '#2563eb',
          yellow: '#f2b705',
          green: '#15803d',
        },
      },
      fontFamily: {
        display: ['"Baloo 2"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.35s ease-out both',
        'pulse-ring': 'pulse-ring 1.2s ease-out infinite',
      },
    },
  },
  plugins: [],
};

tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#edf7f0', 100: '#d8ecdf', 200: '#b7d9c7', 300: '#8fc0a8', 400: '#5f9b7b',
          500: '#3f825f', 600: '#267454', 700: '#185b40', 800: '#124b37', 900: '#0d392b', 950: '#08251c',
        },
        solar: {
          50: '#fff7e4', 100: '#fdeabf', 200: '#f8d37b', 300: '#efb13d', 400: '#d99020',
          500: '#c8791a', 600: '#a66112', 700: '#7d470f', 800: '#623812', 900: '#4b2d11',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        }
      }
    }
  }
}

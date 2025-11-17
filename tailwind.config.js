// C:\HELLOWORLD\AgroCollaboration\tailwind.config.js
/**
 * SHARED TAILWIND CONFIGURATION
 * This file configures Tailwind CSS for the entire application.
 * It should be loaded in the <head> right after the main Tailwind CDN script.
 */
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Poppins', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f7f5',
          100: '#e1efeb',
          200: '#c3e0d8',
          300: '#a5d0c4',
          400: '#6aae9d',
          500: '#4A8C82',
          600: '#3b7d71',
          700: '#186D50',
          800: '#145942',
          900: '#114a37'
        },
        accent: {
          yellow: '#FDEB71'
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { transform: 'translateY(20px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } }
      }
    }
  }
}
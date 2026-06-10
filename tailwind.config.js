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
          50: '#eef7f1',
          100: '#d9eee0',
          200: '#b6dcc5',
          300: '#8fc0a8',
          400: '#5f9f7a',
          500: '#3f825f',
          600: '#267454',
          700: '#1f5f46',
          800: '#1a4d3a',
          900: '#123226'
        },
        solar: {
          50: '#fbf3e7',
          100: '#f6e2c2',
          200: '#edc283',
          300: '#e3a24a',
          400: '#d99020',
          500: '#c8791a',
          600: '#a86418',
          700: '#804713',
          800: '#5f3514',
          900: '#3f230e'
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

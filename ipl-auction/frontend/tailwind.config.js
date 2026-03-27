/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ipl: {
          gold: '#FFD700',
          orange: '#FF6B00',
          blue: '#004BA0',
          dark: '#0A0E1A',
          darker: '#060910',
          card: '#111827',
          border: '#1F2937',
        }
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 1.5s ease-in-out infinite',
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'bid-flash': 'bidFlash 0.6s ease-out',
        'timer-pulse': 'timerPulse 1s ease-in-out infinite',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(255, 215, 0, 0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 107, 0, 0.4)' },
        },
        slideUp: {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        bidFlash: {
          '0%': { backgroundColor: 'rgba(255, 215, 0, 0.3)', transform: 'scale(1.02)' },
          '100%': { backgroundColor: 'transparent', transform: 'scale(1)' },
        },
        timerPulse: {
          '0%, 100%': { color: '#EF4444' },
          '50%': { color: '#FCA5A5' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        }
      },
      backgroundImage: {
        'ipl-gradient': 'linear-gradient(135deg, #0A0E1A 0%, #0D1526 50%, #0A0E1A 100%)',
        'gold-gradient': 'linear-gradient(135deg, #FFD700, #FF6B00)',
        'card-gradient': 'linear-gradient(145deg, #111827, #1F2937)',
      }
    },
  },
  plugins: [],
};

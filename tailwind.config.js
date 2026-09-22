/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0b0e13', 2: '#11161e', 3: '#171d27', 4: '#1f2733' },
        line: 'rgba(255,255,255,0.08)',
        gold: { DEFAULT: '#e5b64a', light: '#f7d98a', dark: '#b8862b' },
        felt: { DEFAULT: '#1c6b45', light: '#238354', dark: '#124a30', rim: '#3a2a1a' },
        chip: { red: '#c73b3b', blue: '#2f5fc2', green: '#2c9a5b', black: '#2b2b2b' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 3px rgba(229,182,74,0.55), 0 0 24px rgba(229,182,74,0.45)',
        card: '0 2px 6px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.35)',
        panel: '0 10px 30px rgba(0,0,0,0.5)',
      },
      keyframes: {
        pulseGold: { '0%,100%': { boxShadow: '0 0 0 3px rgba(229,182,74,0.45), 0 0 16px rgba(229,182,74,0.3)' }, '50%': { boxShadow: '0 0 0 3px rgba(229,182,74,0.9), 0 0 28px rgba(229,182,74,0.7)' } },
        rise: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: { pulseGold: 'pulseGold 1.6s ease-in-out infinite', rise: 'rise 0.25s ease-out' },
    },
  },
  plugins: [],
};

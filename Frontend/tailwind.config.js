/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        bg:      '#0c0c0d',
        surface: '#101012',
        card:    '#141416',
        card2:   '#1a1a1d',
        card3:   '#1e1e22',
        border:  'rgba(255,255,255,0.055)',
        border2: 'rgba(255,255,255,0.10)',
        t1:      '#efefed',
        t2:      '#8a8a87',
        t3:      '#4a4a47',
        accent:  '#17c97c',
        blue:    '#4d9bff',
        amber:   '#f0a020',
        red:     '#e05555',
        purple:  '#a07ee8',
        cyan:    '#38bdf8',
      },
      backgroundImage: {
        'card-shine': 'linear-gradient(140deg, rgba(255,255,255,0.025) 0%, transparent 55%)',
        'card-shine-sm': 'linear-gradient(135deg, rgba(255,255,255,0.018) 0%, transparent 50%)',
      },
      animation: {
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'fade-up': 'fadeUp 0.4s ease forwards',
        'count-up': 'fadeUp 0.6s ease forwards',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.4, transform: 'scale(0.85)' },
        },
        fadeUp: {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.4)',
        glow: '0 0 12px rgba(23,201,124,0.35)',
        'glow-blue': '0 0 12px rgba(77,155,255,0.35)',
        'glow-red': '0 0 8px rgba(224,85,85,0.4)',
      },
    },
  },
  plugins: [],
};

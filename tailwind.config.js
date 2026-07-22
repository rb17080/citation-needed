/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // DR-tier chip classes are built from a string at runtime, so safelist them.
  safelist: [
    'bg-good-bg', 'text-good',
    'bg-ok-bg', 'text-ok',
    'bg-warn-bg', 'text-warn',
    'bg-bad-bg', 'text-bad',
    'bg-neutral-bg', 'text-neutral',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        ink: 'var(--text)',
        'ink-muted': 'var(--text-muted)',
        'ink-subtle': 'var(--text-subtle)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-fg': 'var(--accent-fg)',
        'accent-subtle': 'var(--accent-subtle)',
        good: 'var(--good)', 'good-bg': 'var(--good-bg)',
        ok: 'var(--ok)', 'ok-bg': 'var(--ok-bg)',
        warn: 'var(--warn)', 'warn-bg': 'var(--warn-bg)',
        bad: 'var(--bad)', 'bad-bg': 'var(--bad-bg)',
        neutral: 'var(--neutral)', 'neutral-bg': 'var(--neutral-bg)',
      },
      borderRadius: { sm: 'var(--radius-sm)', DEFAULT: 'var(--radius)', lg: 'var(--radius-lg)' },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
}

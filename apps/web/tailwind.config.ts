import type { Config } from 'tailwindcss';

/**
 * Orbit design system.
 *
 * Every semantic token resolves to a CSS custom property defined in
 * `src/styles/index.css`, so a single `.light` / `.dark` class on <html>
 * re-themes the whole application without re-rendering React.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'rgb(var(--bg-app) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface) / <alpha-value>)',
        elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
        sunken: 'rgb(var(--bg-sunken) / <alpha-value>)',
        hover: 'rgb(var(--bg-hover) / <alpha-value>)',
        selected: 'rgb(var(--bg-selected) / <alpha-value>)',
        line: 'rgb(var(--border-default) / <alpha-value>)',
        'line-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        fg: 'rgb(var(--fg-default) / <alpha-value>)',
        muted: 'rgb(var(--fg-muted) / <alpha-value>)',
        subtle: 'rgb(var(--fg-subtle) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        danger: 'rgb(var(--danger) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
      },
      borderColor: {
        DEFAULT: 'rgb(var(--border-default) / <alpha-value>)',
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
      },
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.4rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.6rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.75rem' }],
        '3xl': ['1.75rem', { lineHeight: '2rem' }],
      },
      boxShadow: {
        panel: '0 1px 2px rgb(0 0 0 / 0.08), 0 8px 24px -12px rgb(0 0 0 / 0.35)',
        popover: '0 4px 12px -2px rgb(0 0 0 / 0.25), 0 12px 40px -8px rgb(0 0 0 / 0.35)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'scale-in': 'scale-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-dot': 'pulse-dot 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;

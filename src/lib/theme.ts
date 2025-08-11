import { createTheme, rem } from '@mantine/core';

export const theme = createTheme({
  colors: {
    // Primary brand color - Professional blue
    brand: [
      '#f0f4ff',
      '#e1ecff',
      '#c7d8ff',
      '#a8c2ff',
      '#8badff',
      '#6d97ff',
      '#2563ff', // Primary
      '#1d4ed8',
      '#1e40af',
      '#1e3a8a',
    ],
    // Secondary color - Teal for accents
    teal: [
      '#f0fdfa',
      '#ccfbf1',
      '#99f6e4',
      '#5eead4',
      '#2dd4bf',
      '#14b8a6',
      '#0d9488', // Secondary
      '#0f766e',
      '#115e59',
      '#134e4a',
    ],
    // Accent color - Orange for CTAs
    orange: [
      '#fff7ed',
      '#ffedd5',
      '#fed7aa',
      '#fdba74',
      '#fb923c',
      '#f97316', // Accent
      '#ea580c',
      '#dc2626',
      '#b91c1c',
      '#991b1b',
    ],
  },
  primaryColor: 'brand',
  fontFamily: 'var(--font-sans)',
  headings: {
    fontFamily: 'var(--font-heading)',
    fontWeight: '600',
  },
  radius: {
    xs: rem(4),
    sm: rem(8),
    md: rem(12),
    lg: rem(16),
    xl: rem(20),
  },
  shadows: {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        shadow: 'sm',
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'md',
      },
    },

  },
});

export type NavGroup = {
  title: string;
  items: { label: string; href: string }[];
};

export const nav: NavGroup[] = [
  {
    title: 'Get started',
    items: [
      { label: 'Welcome', href: '/docs' },
      { label: 'Quick start', href: '/docs/getting-started' },
    ],
  },
  {
    title: 'Core',
    items: [
      { label: 'Slash commands', href: '/docs/commands' },
      { label: 'Auto coaching', href: '/docs/auto-coaching' },
      { label: 'Reports', href: '/docs/reports' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { label: 'Troubleshooting', href: '/docs/troubleshooting' },
      { label: 'Privacy and Security', href: '/docs/privacy' },
    ],
  },
];



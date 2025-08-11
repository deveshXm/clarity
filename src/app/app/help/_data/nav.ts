export type NavGroup = {
  title: string;
  items: { label: string; href: string }[];
};

export const nav: NavGroup[] = [
  {
    title: 'Get started',
    items: [
      { label: 'Welcome', href: '/app/help' },
      { label: 'Quick start', href: '/app/help/getting-started' },
    ],
  },
  {
    title: 'Core',
    items: [
      { label: 'Slash commands', href: '/app/help/commands' },
      { label: 'Auto coaching', href: '/app/help/auto-coaching' },
      { label: 'Reports', href: '/app/help/reports' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { label: 'Troubleshooting', href: '/app/help/troubleshooting' },
      { label: 'Privacy and Security', href: '/app/help/privacy' },
    ],
  },
];



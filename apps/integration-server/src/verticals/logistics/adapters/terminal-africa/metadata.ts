export const metadata = {
  platform: 'terminal-africa',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'Terminal Africa API has no manifest concept or endpoint; confirmed via official sitemap at docs.terminal.africa/tship/sitemap.md',
    },
    {
      resource: 'order',
      reason:
        'Terminal Africa API has no order management concept or endpoint; confirmed via official sitemap at docs.terminal.africa/tship/sitemap.md',
    },
    {
      resource: 'warehouse',
      reason:
        'Terminal Africa API has no warehouse concept or endpoint; confirmed via official sitemap at docs.terminal.africa/tship/sitemap.md',
    },
  ],
} as const

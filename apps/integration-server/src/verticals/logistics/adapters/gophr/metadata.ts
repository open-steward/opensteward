export const metadata = {
  platform: 'gophr',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'order', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Gophr is a single-carrier platform; no carrier listing endpoint exists in its API',
    },
    {
      resource: 'manifest',
      reason:
        "No manifest concept or endpoint in Gophr's V2 Commercial API (resources are Jobs, Deliveries, Parcels only)",
    },
    {
      resource: 'warehouse',
      reason:
        "No warehouse concept or endpoint in Gophr's V2 Commercial API (resources are Jobs, Deliveries, Parcels only)",
    },
    {
      resource: 'trackingevent',
      reason:
        'The V2 Commercial API documents no tracking-history endpoint; its Jobs and Deliveries expose only the current `status`',
    },
  ],
} as const

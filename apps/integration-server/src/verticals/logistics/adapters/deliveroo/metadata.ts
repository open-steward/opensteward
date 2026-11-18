export const metadata = {
  platform: 'deliveroo',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Deliveroo is itself the sole carrier; no carrier listing API exists',
    },
    {
      resource: 'label',
      reason: 'Deliveroo uses tracking URLs, not downloadable shipping labels; no label endpoint exists',
    },
    {
      resource: 'manifest',
      reason: 'Deliveroo has no end-of-day manifest or batch-close concept; no manifest endpoint exists',
    },
  ],
} as const

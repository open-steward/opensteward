export const metadata = {
  platform: 'bosta',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Bosta is a single-carrier platform; no carrier listing endpoint exists in the API' },
    { resource: 'manifest', reason: 'No manifest or bulk-shipment-close endpoint documented in the Bosta API' },
    { resource: 'warehouse', reason: 'No warehouse concept; pickup-locations endpoint is for scheduling pickups only, not warehouse management' },
    {
      resource: 'rate',
      reason:
        "No rate/quote endpoint: docs.bosta.co's sitemap lists only one API reference page " +
        '(get-delivery), and the official bostaapp/bosta-nodejs SDK wraps cities, deliveries, ' +
        'pickups and zones only. getRates was removed from index.ts to match.',
    },
  ],
} as const

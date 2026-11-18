export const metadata = {
  platform: 'ward-trucking',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Ward Trucking REST API exposes only rate-quote, pickup-request, and trace endpoints — no carrier management resource.',
    },
    {
      resource: 'label',
      reason:
        'Ward Trucking REST API exposes only rate-quote, pickup-request, and trace endpoints — no label generation or retrieval endpoint.',
    },
    {
      resource: 'manifest',
      reason:
        'Ward Trucking REST API exposes only rate-quote, pickup-request, and trace endpoints — no manifest resource.',
    },
    {
      resource: 'order',
      reason:
        'Ward Trucking REST API exposes only rate-quote, pickup-request, and trace endpoints — no order management resource.',
    },
    {
      resource: 'warehouse',
      reason:
        'Ward Trucking REST API exposes only rate-quote, pickup-request, and trace endpoints — no warehouse resource.',
    },
  ],
} as const

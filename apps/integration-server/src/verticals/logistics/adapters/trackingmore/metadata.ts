export const metadata = {
  platform: 'trackingmore',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'TrackingMore is a tracking-only platform; it has no label generation API (confirmed by SDK, docs, and official API overview).',
    },
    {
      resource: 'manifest',
      reason:
        'TrackingMore is a tracking-only platform; it has no manifest endpoint (confirmed by SDK, docs, and official API overview).',
    },
    {
      resource: 'order',
      reason:
        'TrackingMore is a tracking-only platform; it has no order management API (confirmed by SDK, docs, and official API overview).',
    },
    {
      resource: 'rate',
      reason:
        'TrackingMore is a tracking-only platform; it has no shipping rate API (confirmed by SDK, docs, and official API overview).',
    },
    {
      resource: 'warehouse',
      reason:
        'TrackingMore is a tracking-only platform; it has no warehouse management API (confirmed by SDK, docs, and official API overview).',
    },
  ],
} as const

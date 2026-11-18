export const metadata = {
  platform: 'asendia',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Asendia is itself a carrier; no carrier directory or listing endpoint exists in its API.',
    },
    {
      resource: 'label',
      reason:
        'Labels are per-parcel binary document streams (PDF/image) returned inline; no structured label list/get JSON endpoint exists (confirmed via Asendia Sync Swagger).',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Asendia Sync (asendia-sync.com) documents /api/manifests endpoints but the adapter base URL (api.asendia.com/v1/) manifest support is not publicly documented.',
    },
    {
      resource: 'order',
      reason:
        'Asendia is a pure international mail/parcel carrier with no order management concept; no order endpoint exists (confirmed via Asendia Sync Swagger and third-party docs).',
    },
    {
      resource: 'warehouse',
      reason:
        'Asendia has no warehouse management concept; no warehouse endpoint exists (confirmed via Asendia Sync Swagger).',
    },
  ],
} as const

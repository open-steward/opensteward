export const metadata = {
  platform: 'sendcloud',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'Sendcloud v2 API has no manifest/end-of-day document endpoint; no such concept exists in v2 or v3.',
    },
    {
      resource: 'order',
      reason:
        'Sendcloud v2 has no standalone Orders API; orders are only accessible via GET /integrations/{id}/shipments which requires a platform-specific integration ID not available from credentials alone.',
    },
  ],
} as const

export const metadata = {
  platform: 'oracle-otm',
  totalResources: 8,
  availableResources: [
    'carrier',
    'order',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'OTM is a TMS planning/execution platform; parcel label generation is delegated to connected carrier systems — no /labels REST endpoint exists in the OTM business-object REST API.',
    },
    {
      resource: 'manifest',
      reason:
        'OTM has no manifest concept in its REST API; carrier end-of-day manifests are managed externally by individual parcel carriers.',
    },
  ],
} as const

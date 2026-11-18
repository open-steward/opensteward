export const metadata = {
  platform: 'kobo360',
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
        'Kobo360 is a Pan-African truck-freight marketplace (B2B haulage brokerage) with no parcel label concept; no /labels endpoint exists in their API.',
    },
    {
      resource: 'manifest',
      reason:
        'Kobo360 is a Pan-African truck-freight marketplace (B2B haulage brokerage) with no parcel carrier manifest concept; no /manifests endpoint exists in their API.',
    },
  ],
} as const

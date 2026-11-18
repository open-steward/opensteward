export const metadata = {
  platform: 'royalmail',
  totalResources: 8,
  availableResources: ['label', 'manifest', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Shipping API v3 has no carrier list endpoint; Royal Mail is itself the sole carrier and exposes no /carriers resource.',
    },
    {
      resource: 'order',
      reason:
        'Shipping API v3 has no order concept. Orders exist only in the separate Click & Drop API (api.parcel.royalmail.com) which uses a different auth scheme and is out of scope for this adapter.',
    },
    {
      resource: 'warehouse',
      reason:
        'Neither the Shipping API v3 nor the Click & Drop API exposes a warehouse or posting-location listing resource.',
    },
  ],
} as const

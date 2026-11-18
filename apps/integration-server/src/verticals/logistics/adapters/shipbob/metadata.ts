export const metadata = {
  platform: 'shipbob',
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
        'ShipBob manages shipping label generation internally as part of their fulfillment operation; no label create/get endpoint is exposed in the public API.',
    },
    {
      resource: 'manifest',
      reason:
        'ShipBob does not expose end-of-day manifest creation or retrieval in their public API.',
    },
  ],
} as const

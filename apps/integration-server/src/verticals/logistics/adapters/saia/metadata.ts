export const metadata = {
  platform: 'saia',
  totalResources: 8,
  availableResources: ['carrier', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'SAIA is an LTL freight carrier; BOL documents are freight records, not parcel labels. No dedicated label generation or retrieval endpoint exists in the public API.',
    },
    {
      resource: 'manifest',
      reason:
        'SAIA has no manifest/end-of-day close-out endpoint in its public REST API.',
    },
    {
      resource: 'order',
      reason:
        'SAIA has no order management endpoints; it is a freight carrier, not an order fulfillment platform.',
    },
    {
      resource: 'warehouse',
      reason:
        'SAIA has no warehouse management endpoints in its public API.',
    },
  ],
} as const

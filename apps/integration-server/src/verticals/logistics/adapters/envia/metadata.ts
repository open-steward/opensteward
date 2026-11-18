export const metadata = {
  platform: 'envia',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'order',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'warehouse',
      reason:
        'Warehouses are only available in the separate Envia Fulfillment API (apifulfillment.envia.com), which requires distinct credentials; not exposed by the Shipping or Queries API used by this adapter.',
    },
  ],
} as const

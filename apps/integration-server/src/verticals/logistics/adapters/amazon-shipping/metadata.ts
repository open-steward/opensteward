export const metadata = {
  platform: 'amazon-shipping',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'manifest', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'Amazon Shipping API v2 has no order management endpoints; orders are managed by the separate SP-API Orders API',
    },
    {
      resource: 'warehouse',
      reason:
        'Amazon Shipping API v2 has no warehouse or address-book concept; ship-from addresses are per-request parameters, not managed resources',
    },
  ],
} as const

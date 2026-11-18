export const metadata = {
  platform: 'dhl-ecommerce',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label', 'manifest', 'rate'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'DHL eCommerce Americas has no carrier listing endpoint; the platform itself is the single carrier and exposes no /carriers resource.',
    },
    {
      resource: 'order',
      reason:
        'The DHL eCommerce Americas API has no order management endpoints; it is label, manifest, and tracking focused only.',
    },
    {
      resource: 'warehouse',
      reason:
        'The DHL eCommerce Americas API has no warehouse management endpoints.',
    },
  ],
} as const

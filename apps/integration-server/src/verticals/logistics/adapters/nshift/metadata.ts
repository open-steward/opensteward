export const metadata = {
  platform: 'nshift',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'manifest', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'nShift Delivery REST API has no orders resource; shipment creation is the primary booking entry point',
    },
    {
      resource: 'rate',
      reason:
        'Rate-shopping requires the separate nShift Checkout/DeliveryCheckout product, not available in the Delivery REST API',
    },
    {
      resource: 'warehouse',
      reason: 'nShift Delivery REST API has no warehouses endpoint',
    },
  ],
} as const

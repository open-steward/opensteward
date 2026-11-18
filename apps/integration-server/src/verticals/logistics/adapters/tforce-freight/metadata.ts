export const metadata = {
  platform: 'tforce-freight',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'TForce Freight is a single LTL carrier; no carrier-listing endpoint exists in any published API',
    },
    {
      resource: 'manifest',
      reason: 'No manifest/end-of-day close-out endpoint exists in the TForce Freight Shipping or Documents API',
    },
    {
      resource: 'order',
      reason: 'TForce Freight is an LTL freight carrier, not an order management system; no order API exists',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse or service-centre listing endpoint exists in any published TForce Freight API',
    },
  ],
} as const

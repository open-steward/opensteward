export const metadata = {
  platform: 'karrio',
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
      reason: 'Karrio is a carrier-integration API layer; it has no warehouse or physical-location management endpoint (confirmed via official API reference at docs.karrio.io/reference/api/karrio-api).',
    },
  ],
} as const

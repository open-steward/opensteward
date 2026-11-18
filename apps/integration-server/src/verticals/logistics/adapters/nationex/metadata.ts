export const metadata = {
  platform: 'nationex',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Nationex is a single carrier; no /carriers listing endpoint exists in the API',
    },
    {
      resource: 'label',
      reason: '/Shipments/{id}/labels returns a binary PDF/PNG blob, not structured JSON',
    },
    {
      resource: 'manifest',
      reason: '/Customers/{id}/driverManifests returns a binary PDF blob, not structured JSON',
    },
    {
      resource: 'order',
      reason: 'No order concept exists in the Nationex API',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse concept exists in the Nationex API',
    },
  ],
} as const

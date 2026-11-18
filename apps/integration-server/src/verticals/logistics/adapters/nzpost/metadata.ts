export const metadata = {
  platform: 'nzpost',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label', 'manifest'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'NZ Post is a single national postal carrier; no carrier list endpoint exists in the API',
    },
    {
      resource: 'order',
      reason: 'NZ Post provides no order management API — it is a carrier, not an OMS',
    },
    {
      resource: 'warehouse',
      reason: 'NZ Post exposes no depot or facility management endpoint',
    },
  ],
} as const

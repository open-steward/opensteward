export const metadata = {
  platform: 'estes',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'Estes has no manifest API; the BOL endpoint is the closest equivalent but is not a manifest resource',
    },
    {
      resource: 'order',
      reason: 'Estes is an LTL freight carrier, not an order management system; no order endpoint exists in their API',
    },
    {
      resource: 'warehouse',
      reason: 'Estes has no warehouse management API; they operate as a carrier, not a WMS provider',
    },
  ],
} as const

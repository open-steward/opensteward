export const metadata = {
  platform: 'jadlog',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'Jadlog Embarcador API has no manifesto/end-of-day manifest endpoint',
    },
    {
      resource: 'order',
      reason: 'Jadlog pedido (order) is implemented as the shipment resource; no separate order lifecycle endpoint exists in the Embarcador API',
    },
  ],
} as const

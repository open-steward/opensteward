export const metadata = {
  platform: 'nash',
  totalResources: 8,
  availableResources: [
    'carrier',
    'order',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'label',
      reason: 'Nash embeds shipping labels as documents within order/job responses; no standalone label endpoint exists in the API',
    },
    {
      resource: 'manifest',
      reason: 'Nash embeds manifest documents within order responses; no standalone manifest endpoint exists in the API',
    },
  ],
} as const

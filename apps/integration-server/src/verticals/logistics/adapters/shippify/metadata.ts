export const metadata = {
  platform: 'shippify',
  totalResources: 8,
  availableResources: ['label', 'order', 'rate', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Shippify is itself a single last-mile carrier network; it does not expose a carrier-listing API. No /carriers or equivalent endpoint exists in the documented API (docs.shippify.co/developers).',
    },
    {
      resource: 'manifest',
      reason:
        'Shippify does not have a manifest concept or endpoint. Its API covers deliveries, routes, pricing, and places only — no manifest/SCAN-form resource is documented.',
    },
  ],
} as const

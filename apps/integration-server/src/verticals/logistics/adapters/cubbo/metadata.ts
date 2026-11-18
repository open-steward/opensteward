export const metadata = {
  platform: 'cubbo',
  totalResources: 8,
  availableResources: ['order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Cubbo auto-assigns carriers internally; no public carrier-listing endpoint found — developer docs at developers.cubbo.com require authentication and return no public content.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Label URL is embedded in shipment responses (label_url field); no dedicated label resource endpoint found in accessible docs — developer portal requires authentication.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Cubbo manages pickup manifests internally as a managed 3PL; no manifest API endpoint found in accessible docs — developer portal requires authentication.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Cubbo selects carriers and rates automatically; no getRates endpoint found in accessible docs — developer portal requires authentication.',
    },
    { resource: 'shipment', reason: 'The published API has no shipments endpoint' },
    {
      resource: 'trackingevent',
      reason:
        'The published API has no tracking endpoint, and an order’s delivery_tracking holds only a current shipping_status per package',
    },
    { resource: 'warehouse', reason: 'The published API has no warehouses endpoint' },
  ],
} as const

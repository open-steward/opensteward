export const metadata = {
  platform: 'shippo',
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
      reason:
        'Shippo API has no warehouse or fulfillment-center concept; confirmed by exhaustive OpenAPI spec review (addresses, parcels, shipments, rates, transactions, carrier_accounts, manifests, orders, tracks, customs, batches, pickups, refunds — no warehouse endpoint).',
    },
  ],
} as const

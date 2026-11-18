export const metadata = {
  platform: 'shiptime',
  totalResources: 8,
  availableResources: [
    'rate',
    'shipment',
    'trackingevent',
    'label', // derived from shipment response (label_url field)
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: ShipTime API docs are fully behind authentication; no public /carriers endpoint or response shape could be confirmed.',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: ShipTime API docs are fully behind authentication; no public /manifests endpoint or response shape could be confirmed.',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: ShipTime API docs are fully behind authentication; no public /orders endpoint or response shape could be confirmed.',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: ShipTime API docs are fully behind authentication; no public /warehouses endpoint or response shape could be confirmed.',
    },
  ],
} as const

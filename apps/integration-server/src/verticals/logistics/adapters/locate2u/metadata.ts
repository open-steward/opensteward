export const metadata = {
  platform: 'locate2u',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Locate2u is a last-mile dispatch/routing platform. No carrier directory is exposed via the public API (confirmed via OpenAPI spec and Postman collection).',
    },
    {
      resource: 'label',
      reason:
        'Locate2u does not generate shipping labels; no label endpoint exists in the public API.',
    },
    {
      resource: 'manifest',
      reason:
        'Locate2u has no manifest concept or endpoint; manifests are not part of its routing/dispatch model.',
    },
    {
      resource: 'rate',
      reason:
        'Locate2u does not offer carrier rate shopping; no rate endpoint exists in the public API.',
    },
    {
      resource: 'warehouse',
      reason:
        'Locate2u has no warehouse-location resource in its public API. The Warehouse App endpoints (/api/v1/items/scan etc.) are for item-level tracking, not warehouse management.',
    },
  ],
} as const

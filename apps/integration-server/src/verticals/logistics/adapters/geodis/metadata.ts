export const metadata = {
  platform: 'geodis',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Geodis is itself the sole carrier; their API exposes no multi-carrier catalog endpoint',
    },
    {
      resource: 'warehouse',
      reason:
        'Warehouses are configured server-side in the GEODIS WMS; no warehouse CRUD endpoint is exposed via the public API',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Label/AWB generation is referenced in third-party integration docs but the actual endpoint path is behind an authenticated developer portal and could not be publicly verified',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: End-of-day manifest generation is referenced in third-party integration docs but the actual endpoint path is behind an authenticated developer portal and could not be publicly verified',
    },
    {
      resource: 'trackingevent',
      reason:
        'Its WMS API documents no tracking endpoint (only Order, Shipment Confirmation, Item Master Request, InventoryInquiry, Goods Receipts Request and Goods Receipt Confirmation).',
    },
  ],
} as const

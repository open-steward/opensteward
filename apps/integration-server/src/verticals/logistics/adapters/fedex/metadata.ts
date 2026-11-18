export const metadata = {
  platform: 'fedex',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'manifest', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'The FedEx REST API (apis.fedex.com) has no order management endpoint; orders exist only in FedEx Supply Chain (connect.supplychain.fedex.com), a separate product with different authentication not used by this adapter.',
    },
    {
      resource: 'warehouse',
      reason:
        'FedEx has no merchant-warehouse concept; the Locations Search API returns FedEx facility drop-off/pickup points, not customer warehouses.',
    },
  ],
} as const

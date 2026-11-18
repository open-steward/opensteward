export const metadata = {
  platform: 'booqable',
  totalResources: 7,
  availableResources: [
    'location',
    'product',
    'purchase-order',
    'stock-adjustment',
    'stock-level',
  ],
  unavailableResources: [
    {
      resource: 'supplier',
      reason:
        'Booqable has no vendor/supplier management concept; confirmed absent from the complete v4 API resource list at developers.booqable.com',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Booqable has no warehouse-to-warehouse stock transfer concept; confirmed absent from the complete v4 API resource list at developers.booqable.com',
    },
  ],
} as const

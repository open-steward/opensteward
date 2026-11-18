export const metadata = {
  platform: 'mercadolibre',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
    'refund',
    'transaction',
    'collection',
    'customer',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'Mercado Libre has no dedicated seller-location listing endpoint. Warehouse ' +
        'identifiers surface only as seller_warehouse metadata in the user-products ' +
        'stock API (user-products/{id}/stock) without addressable canonical fields ' +
        '(name, address, active, isFulfillmentCenter).',
    },
  ],
} as const

export const metadata = {
  platform: 'ionos',
  totalResources: 10,
  availableResources: ['product', 'order'],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'IONOS native ecommerce API exposes only products and orders; no category/collection endpoint exists',
    },
    {
      resource: 'customer',
      reason: 'IONOS native ecommerce API exposes only products and orders; no customer endpoint exists',
    },
    {
      resource: 'discount',
      reason: 'IONOS native ecommerce API exposes only products and orders; no discount/coupon endpoint exists',
    },
    {
      resource: 'fulfillment',
      reason: 'IONOS native ecommerce API exposes only products and orders; no fulfillment endpoint exists',
    },
    {
      resource: 'inventory',
      reason: 'IONOS native ecommerce API exposes only products and orders; no inventory endpoint exists',
    },
    {
      resource: 'location',
      reason: 'IONOS native ecommerce API exposes only products and orders; no location endpoint exists',
    },
    {
      resource: 'refund',
      reason: 'IONOS native ecommerce API exposes only products and orders; no refund endpoint exists',
    },
    {
      resource: 'transaction',
      reason: 'IONOS native ecommerce API exposes only products and orders; no transaction endpoint exists',
    },
  ],
} as const

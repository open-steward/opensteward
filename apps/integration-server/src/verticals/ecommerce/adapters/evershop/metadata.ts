export const metadata = {
  platform: 'evershop',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'inventory',
      reason:
        'EverShop has no inventory-level REST API; stock is an inline field (qty/manage_stock) on the product resource, not a separate addressable resource.',
    },
    {
      resource: 'location',
      reason:
        'EverShop has no warehouse/location concept or REST API; the platform is single-location by design.',
    },
    {
      resource: 'refund',
      reason:
        'EverShop has no refund REST API; the only post-payment operation is setting payment_status to "refunded" on the order.',
    },
    {
      resource: 'transaction',
      reason:
        'EverShop has no transaction REST API; payment data is limited to payment_method and payment_status fields on the order object.',
    },
  ],
} as const

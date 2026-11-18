export const metadata = {
  platform: 'tiktok-shop',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
    'discount',
    'location',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'No seller-curated storefront collection API; getCategories returns a platform taxonomy (product classification tree), not curated collections.',
    },
    {
      resource: 'customer',
      reason:
        'TikTok does not expose buyer profile or record data to sellers; the CustomerService API only provides conversation/messaging endpoints.',
    },
  ],
} as const

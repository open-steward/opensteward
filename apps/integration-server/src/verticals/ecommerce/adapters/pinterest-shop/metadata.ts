export const metadata = {
  platform: 'pinterest-shop',
  totalResources: 10,
  availableResources: ['collection', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'Pinterest is a visual discovery and catalog platform — there is no customer/user management API.',
    },
    {
      resource: 'discount',
      reason: 'Pinterest has no discount or coupon API.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Pinterest is not a transactional commerce platform — there is no fulfillment tracking API.',
    },
    {
      resource: 'inventory',
      reason:
        'Product availability comes from the merchant feed, not a stock/inventory management API.',
    },
    {
      resource: 'location',
      reason: 'Pinterest has no warehouse or physical location concept.',
    },
    {
      resource: 'refund',
      reason:
        'Pinterest is not a transactional commerce platform — there is no refund API.',
    },
    {
      resource: 'transaction',
      reason:
        'Pinterest is not a transactional commerce platform — there is no financial transaction resource.',
    },
  ],
} as const

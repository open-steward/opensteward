export const metadata = {
  platform: 'facebook-shop',
  totalResources: 10,
  availableResources: [
    'collection',
    'fulfillment',
    'inventory',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'Facebook Commerce Platform does not expose a buyer/customer resource; buyer info is embedded in orders via buyer_details only.',
    },
    {
      resource: 'discount',
      reason: 'Facebook Commerce Platform has no public discount/coupon REST API endpoint.',
    },
    {
      resource: 'location',
      reason: 'Facebook Commerce Platform does not expose inventory location resources; inventory is managed at the product level only.',
    },
    {
      resource: 'transaction',
      reason: 'Facebook does not expose order-level transaction data; payment information is embedded in the order object\'s estimated_payment_details field only.',
    },
  ],
} as const

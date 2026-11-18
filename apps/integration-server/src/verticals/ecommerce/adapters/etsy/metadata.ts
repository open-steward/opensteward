export const metadata = {
  platform: 'etsy',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
    'collection',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'Etsy does not expose a buyer/customer resource in the public API; buyer identity is embedded read-only on receipts.',
    },
    {
      resource: 'discount',
      reason: 'Etsy Open API v3 has no discount or coupon CRUD API; coupons are managed through the Etsy seller dashboard only.',
    },
    {
      resource: 'location',
      reason: 'Etsy shops have no warehouse or location concept; inventory is tracked per-listing, not per-location.',
    },
  ],
} as const

export const metadata = {
  platform: 'trendyol',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'discount',
      reason: 'Trendyol Partner API has no discount/coupon/promotion endpoint for sellers',
    },
  ],
} as const

export const metadata = {
  platform: 'shopgate',
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
  ],
  unavailableResources: [
    {
      resource: 'discount',
      reason:
        'Shopgate Omnichannel API has no discount/coupon/promo-code resource; discounts appear only as a scalar discountAmount field on orders',
    },
    {
      resource: 'transaction',
      reason:
        'Shopgate Omnichannel API has no payment-transaction resource; payment processing is handled outside the API',
    },
  ],
} as const

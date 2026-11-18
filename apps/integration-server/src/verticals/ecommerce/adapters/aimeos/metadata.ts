export const metadata = {
  platform: 'aimeos',
  totalResources: 10,
  availableResources: [
    'customer',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
    'collection',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'refund',
      reason:
        'Aimeos has no dedicated refund endpoint; refunds are processed externally via payment gateway callbacks and reflected only as payment status changes on orders.',
    },
    {
      resource: 'transaction',
      reason:
        'Aimeos has no dedicated payment transaction endpoint; payment processing is delegated to external service providers (Stripe, PayPal, etc.) with no transaction listing API in the Aimeos REST layer.',
    },
  ],
} as const

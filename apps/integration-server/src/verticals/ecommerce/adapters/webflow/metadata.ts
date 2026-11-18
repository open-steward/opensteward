export const metadata = {
  platform: 'webflow',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'Webflow ecommerce has no locations concept; the platform manages a single online storefront with no physical location or multi-warehouse model.',
    },
    {
      resource: 'transaction',
      reason:
        'Webflow has no standalone transactions endpoint; payment data (Stripe chargeId, PayPal captureId, amounts) is embedded inside the order object but is not exposed as a queryable transaction resource.',
    },
  ],
} as const

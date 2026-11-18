export const metadata = {
  platform: 'drupal-commerce',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'refund',
      reason:
        'Drupal Commerce has no dedicated refund entity. Refunds are payment-gateway ' +
        'operations that transition commerce_payment state (partially_refunded → refunded). ' +
        'No JSON:API endpoint exists in core or any widely-deployed contrib module.',
    },
  ],
} as const

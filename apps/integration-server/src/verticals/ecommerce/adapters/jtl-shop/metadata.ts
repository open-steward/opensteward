export const metadata = {
  platform: 'jtl-shop',
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
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'transaction',
      reason:
        'Payment transactions are stored in JTL-Wawi ERP, not exposed by the JTL-Shop REST API.',
    },
  ],
} as const

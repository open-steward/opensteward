export const metadata = {
  platform: 'bagy',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'inventory',
    'location',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'Bagy has no dedicated fulfillment endpoint; fulfillment state is captured only via the order status field (enviado/entregue).',
    },
    {
      resource: 'refund',
      reason: 'Bagy has no refunds endpoint; no refund resource exists in the documented API.',
    },
    {
      resource: 'transaction',
      reason:
        'UNVERIFIED: /payments endpoint confirmed to exist in Bagy API but response field names are not accessible from public documentation (knowledge base requires authentication).',
    },
  ],
} as const

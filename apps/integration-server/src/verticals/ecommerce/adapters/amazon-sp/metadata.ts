export const metadata = {
  platform: 'amazon-sp',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
    'refund',
    'transaction',
    'location',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Amazon browse nodes are system-controlled taxonomy; there is no user-mutable collection resource in SP-API.',
    },
    {
      resource: 'customer',
      reason:
        'SP-API has no customer resource; buyer identity is PII-gated and only accessible per-order via Restricted Data Tokens.',
    },
  ],
} as const

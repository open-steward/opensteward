export const metadata = {
  platform: 'flipkart',
  totalResources: 10,
  availableResources: [
    'fulfillment',
    'inventory',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Flipkart Seller API has no collections or product-grouping concept',
    },
    {
      resource: 'customer',
      reason: 'Flipkart does not expose buyer PII through the Seller API; no customer resource endpoint exists',
    },
    {
      resource: 'discount',
      reason: 'Flipkart Seller API exposes no discount or promotion management endpoints',
    },
    {
      resource: 'location',
      reason: 'Location IDs are referenced in inventory payloads but there is no Seller API endpoint to list or retrieve location details',
    },
  ],
} as const

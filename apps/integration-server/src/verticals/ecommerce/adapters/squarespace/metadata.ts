export const metadata = {
  platform: 'squarespace',
  totalResources: 10,
  availableResources: [
    'customer',
    'inventory',
    'order',
    'product',
    'fulfillment',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Squarespace Commerce API has no collections/categories endpoint',
    },
    {
      resource: 'discount',
      reason: 'Discount data is embedded in orders only; no dedicated discount endpoint',
    },
    {
      resource: 'location',
      reason: 'Squarespace Commerce API has no locations endpoint',
    },
    {
      resource: 'refund',
      reason: 'Refund data is embedded in transaction documents; no dedicated refund endpoint',
    },
  ],
} as const

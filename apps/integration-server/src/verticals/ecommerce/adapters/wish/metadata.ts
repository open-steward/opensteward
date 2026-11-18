export const metadata = {
  platform: 'wish',
  totalResources: 10,
  availableResources: [
    'product',
    'order',
    'fulfillment',
    'refund',
    'inventory',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Wish has no collection/category resource in the merchant API',
    },
    {
      resource: 'customer',
      reason: 'Wish does not expose a customer API; buyer info is embedded in orders only',
    },
    {
      resource: 'discount',
      reason: 'Wish promotions are managed via the Merchant Dashboard; no discount API endpoint',
    },
    {
      resource: 'location',
      reason: 'Wish has no merchant-facing location API; FBW warehouses are not accessible via standard merchant OAuth',
    },
    {
      resource: 'transaction',
      reason: 'Wish does not expose a payment transaction API for merchants',
    },
  ],
} as const

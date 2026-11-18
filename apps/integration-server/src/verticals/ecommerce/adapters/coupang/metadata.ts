export const metadata = {
  platform: 'coupang',
  totalResources: 10,
  availableResources: [
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
      resource: 'collection',
      reason: 'No seller-managed product collection concept exists in the Coupang WING API; the platform uses a system taxonomy for categories only.',
    },
    {
      resource: 'transaction',
      reason: 'The Coupang settlement API (/v2/providers/marketplace_openapi/apis/api/v1/settlement-histories) returns monthly aggregate settlement summaries, not per-order financial transaction records.',
    },
    {
      resource: 'customer',
      reason:
        'The API documents no customer or buyer resource, and an order sheet carries only orderer{name, email, safeNumber, ordererNumber}, with email documented as "non-use/empty value("")", so there is no buyer id to list by.',
    },
  ],
} as const

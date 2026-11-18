export const metadata = {
  platform: 'cartpanda',
  totalResources: 10,
  availableResources: [
    'customer',
    'fulfillment',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'UNVERIFIED: CartPanda API V3 has indexed doc pages for smart collections and a list-collections endpoint, but the Stoplight-rendered docs are not machine-readable (JS SPA); the v3 base URL and auth scheme relative to the v2 adapter cannot be confirmed without accessing the page content.',
    },
    {
      resource: 'discount',
      reason:
        'UNVERIFIED: CartPanda v2 API has indexed doc pages for GET /discounts and POST /discounts, but the Stoplight-rendered docs are not machine-readable (JS SPA); response field names cannot be confirmed without accessing the page content.',
    },
    {
      resource: 'inventory',
      reason:
        'No dedicated inventory-level endpoint exists in the CartPanda public API; stock quantities are only reported as a field on the product variant (quantity).',
    },
    {
      resource: 'location',
      reason:
        'CartPanda has no locations API; the platform does not expose fulfilment locations as a queryable resource.',
    },
    {
      resource: 'refund',
      reason:
        'CartPanda has no dedicated REST refund endpoint; refunds surface only as an order.refunded webhook event and as id-stub arrays nested in the order object.',
    },
    {
      resource: 'transaction',
      reason:
        'CartPanda has no dedicated REST transaction endpoint; transactions surface only as id-stub arrays nested in the order object.',
    },
  ],
} as const

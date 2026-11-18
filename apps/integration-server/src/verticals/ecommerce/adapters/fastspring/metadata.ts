export const metadata = {
  platform: 'fastspring',
  totalResources: 11,
  availableResources: ['customer', 'discount', 'order', 'product', 'refund'],
  unavailableResources: [
    {
      resource: 'variant',
      reason:
        'FastSpring products are single-SKU (a "product" IS the purchasable item — see ' +
        'https://developer.fastspring.com/reference/products); there is no separate variant resource.',
    },
    {
      resource: 'collection',
      reason:
        'FastSpring has no product-grouping/collection resource in its public API ' +
        '(https://developer.fastspring.com/reference/api-overview) — merchandising groupings live only ' +
        'in the Store Builder Library, which is not part of the REST API surface.',
    },
    {
      resource: 'location',
      reason:
        'FastSpring is a merchant-of-record for digital goods / SaaS — there is no physical ' +
        'warehouse or location concept to expose.',
    },
    {
      resource: 'inventory',
      reason: 'Digital-goods checkout has no stock/inventory concept; not part of the FastSpring API.',
    },
    {
      resource: 'fulfillment',
      reason:
        'No physical fulfilment — FastSpring delivers digital goods/subscriptions directly at checkout. ' +
        '(There is a `fulfillment.failed` webhook event for delivery failures, but no fulfillment CRUD resource.)',
    },
    {
      resource: 'transaction',
      reason:
        'FastSpring exposes orders and returns, not a separate payment-transaction ledger resource — ' +
        'see https://developer.fastspring.com/reference/orders.',
    },
  ],
} as const

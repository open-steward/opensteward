export const metadata = {
  platform: 'noon',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Noon manages its own category taxonomy; sellers cannot create or query user-mutable collections via the Seller API.',
    },
    {
      resource: 'customer',
      reason: 'Noon withholds buyer PII from sellers by platform policy; no customer data API is exposed to seller integrations.',
    },
    {
      resource: 'discount',
      reason: 'Promotions are expressed as a price/MSRP differential on product listings; there is no dedicated seller-facing discounts API.',
    },
    {
      resource: 'location',
      reason: 'Noon assigns warehouses internally and manages fulfillment centres through Seller Lab; no seller-facing location listing API exists.',
    },
    {
      resource: 'refund',
      reason: 'Returns are processed by Noon\'s own dispute/return resolution system; sellers cannot programmatically access or create refund records.',
    },
    {
      resource: 'transaction',
      reason: 'No financial transaction API is exposed to sellers; settlement and payout data is available only via the Seller Lab UI.',
    },
  ],
} as const

export const metadata = {
  platform: 'kofi',
  totalResources: 10,
  availableResources: ['customer', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Ko-fi has no collection concept; shop items are flat with no grouping API.',
    },
    {
      resource: 'discount',
      reason: 'Ko-fi has no discount/promo-code API; discounts are managed exclusively via the dashboard UI.',
    },
    {
      resource: 'fulfillment',
      reason: 'Ko-fi delivers digital goods instantly at purchase time; no fulfillment tracking API exists.',
    },
    {
      resource: 'inventory',
      reason: 'Ko-fi sells digital goods only; no stock-level or inventory API exists.',
    },
    {
      resource: 'location',
      reason: 'Ko-fi is a digital-delivery platform; no warehouse or location concept exists.',
    },
    {
      resource: 'refund',
      reason: 'Ko-fi has no refund API; refunds are processed manually via the Ko-fi dashboard.',
    },
    {
      resource: 'transaction',
      reason: 'Ko-fi has no separate transaction resource; payment data is embedded in webhook order payloads only.',
    },
  ],
} as const

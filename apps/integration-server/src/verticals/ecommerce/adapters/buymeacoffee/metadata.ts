export const metadata = {
  platform: 'buymeacoffee',
  totalResources: 10,
  availableResources: ['customer', 'order', 'product'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Buy Me a Coffee has no concept of product collections; the platform is a creator-tip / digital-extras service with no grouping API.',
    },
    {
      resource: 'discount',
      reason:
        'Buy Me a Coffee has no discount or promo-code API — the platform does not support coupon codes or price reductions.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Buy Me a Coffee delivers digital goods instantly at purchase time; there is no fulfillment-tracking concept or endpoint.',
    },
    {
      resource: 'inventory',
      reason:
        'Buy Me a Coffee sells digital items; there is no stock level or inventory endpoint.',
    },
    {
      resource: 'location',
      reason:
        'Buy Me a Coffee is a digital platform with no physical warehouse or location concept.',
    },
    {
      resource: 'refund',
      reason:
        'Buy Me a Coffee has no public refund API; the `is_refunded` flag on a supporter record is the only refund signal exposed.',
    },
    {
      resource: 'transaction',
      reason:
        'Buy Me a Coffee has no separate transaction resource; payment data is embedded in supporter and subscription records.',
    },
  ],
} as const

export const metadata = {
  platform: 'patreon',
  totalResources: 10,
  availableResources: ['customer', 'order', 'product', 'transaction'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Patreon has no collection concept — it is a membership platform with campaigns and tiers, not a product catalogue.',
    },
    {
      resource: 'discount',
      reason:
        'Patreon has no discount or coupon system. Tier pricing is fixed; the API exposes no discount resource.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Patreon is a digital-content membership platform and does not ship physical goods; no fulfillment resource exists in the API.',
    },
    {
      resource: 'inventory',
      reason:
        'Patreon sells digital memberships, not physical SKUs; the API has no inventory or stock concept.',
    },
    {
      resource: 'location',
      reason:
        'Patreon is a fully digital platform and has no warehouse or retail location concept in its API.',
    },
    {
      resource: 'refund',
      reason:
        'Patreon processes refunds internally; the API exposes no refund resource or endpoint.',
    },
  ],
} as const

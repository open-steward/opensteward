/**
 * Lemon Squeezy adapter metadata.
 *
 * Lemon Squeezy is a digital-goods / SaaS merchant-of-record platform.
 * It has no physical products, warehouses, or shipping, so collection
 * groupings, fulfillment records, inventory levels, and physical locations
 * are all absent from its API.
 *
 * Official API resource list (SDK v1 — 59 functions):
 *   stores, customers, products, variants, prices, files, orders,
 *   subscriptions, subscription invoices, subscription items, usage records,
 *   discounts, discount redemptions, license keys, license key instances,
 *   checkouts, webhooks.
 *
 * Docs: https://docs.lemonsqueezy.com/api
 */

export const metadata = {
  platform: 'lemon-squeezy',
  totalResources: 10,
  availableResources: [
    'customer',
    'discount',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Lemon Squeezy is a digital-goods platform with no product-collection concept in its API.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Lemon Squeezy sells digital products only; no physical fulfillment or shipping exists.',
    },
    {
      resource: 'inventory',
      reason:
        'Lemon Squeezy has no inventory or stock-level tracking; digital files have unlimited supply.',
    },
    {
      resource: 'location',
      reason:
        'Lemon Squeezy has no physical warehouse or store-location concept in its API.',
    },
  ],
} as const

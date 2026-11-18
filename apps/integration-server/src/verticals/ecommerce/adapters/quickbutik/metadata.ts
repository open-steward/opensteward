/**
 * Quickbutik adapter resource coverage metadata.
 *
 * Source: Quickbutik REST API v1 OpenAPI spec (https://quickbutik.dev/openapi.yaml).
 * The API exposes only: /orders, /products, /categories, /paymentmethods,
 * /shippingmethods, /metadata, /scripts, /settings/preorders.
 * There are no endpoints for discounts, fulfillments, refunds, or transactions.
 */

export const metadata = {
  platform: 'quickbutik',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'inventory',
    'location',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'discount',
      reason: 'Quickbutik API v1 has no discount or coupon endpoint; confirmed via official OpenAPI spec at quickbutik.dev/openapi.yaml',
    },
    {
      resource: 'fulfillment',
      reason: 'Quickbutik API v1 has no fulfillment endpoint; shipping tracking is a field on orders only, not a separate resource',
    },
    {
      resource: 'refund',
      reason: 'Quickbutik API v1 has no refund endpoint; confirmed via official OpenAPI spec at quickbutik.dev/openapi.yaml',
    },
    {
      resource: 'transaction',
      reason: 'Quickbutik API v1 has no transaction endpoint; payment method list is available but no transaction history resource exists',
    },
  ],
} as const

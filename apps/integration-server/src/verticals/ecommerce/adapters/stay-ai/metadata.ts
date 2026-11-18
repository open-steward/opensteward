export const metadata = {
  platform: 'stay-ai',
  totalResources: 10,
  availableResources: ['customer', 'order'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Stay AI is a Shopify-native subscription platform; collections are managed in Shopify directly and are not exposed via the Stay AI API.',
    },
    {
      resource: 'discount',
      reason:
        'Stay AI does not expose a discount or coupon endpoint; discount logic is handled within Shopify and/or selling-plan group pricing, not via the Stay AI REST API.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Stay AI subscriptions do not carry per-shipment fulfillment records; physical fulfillment is delegated to Shopify.',
    },
    {
      resource: 'inventory',
      reason:
        'Stay AI does not manage inventory levels; stock is tracked inside Shopify.',
    },
    {
      resource: 'location',
      reason:
        'Stay AI does not expose warehouse/location data; location management belongs to Shopify.',
    },
    {
      resource: 'product',
      reason:
        'UNVERIFIED: The Stay AI llms.txt references get-catalog and get-catalog-product-by-id endpoints, but docs.stay.ai returned HTTP 429 on every attempt to fetch the endpoint spec, so the exact URL path and response shape could not be confirmed.',
    },
    {
      resource: 'refund',
      reason:
        'Stay AI has no refund endpoint; refunds are processed within Shopify Payments, not via the Stay AI API.',
    },
    {
      resource: 'transaction',
      reason:
        'Stay AI does not expose payment transaction records; billing transactions are surfaced via Shopify, not the Stay AI REST API.',
    },
  ],
} as const

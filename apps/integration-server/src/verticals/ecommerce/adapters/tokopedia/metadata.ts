export const metadata = {
  platform: 'tokopedia',
  totalResources: 10,
  availableResources: [
    'collection',
    'fulfillment',
    'inventory',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'No standalone buyer-list endpoint; buyer data is embedded in order objects only',
    },
    {
      resource: 'discount',
      reason: 'No list-discounts API endpoint; promo codes exist in the seller UI but are not exposed via the Open API',
    },
    {
      resource: 'location',
      reason: 'Warehouse management is handled internally by Tokopedia; no location-list endpoint in the Open API',
    },
    {
      resource: 'refund',
      reason: 'Only action endpoints exist (approve buyer cancellation); no GET refund resource endpoint',
    },
    {
      resource: 'transaction',
      reason: 'UNVERIFIED: Finance/Statistic API is mentioned in docs but exact endpoint path and response shape cannot be confirmed — developer.tokopedia.com now redirects to TikTok Shop',
    },
  ],
} as const

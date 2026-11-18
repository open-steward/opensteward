/**
 * Payhip adapter resource coverage metadata.
 *
 * The Payhip REST API v2 exposes only two resource types: Coupons and
 * License Keys. All other ecommerce canonical resources are unavailable.
 *
 * Source: https://payhip.com/api-reference
 *         https://help.payhip.com/article/347-public-api
 */
export const metadata = {
  platform: 'payhip',
  totalResources: 10,
  availableResources: ['discount'],
  unavailableResources: [
    {
      resource: 'product',
      reason:
        'Payhip REST API v2 exposes only coupons and license keys; no product endpoint exists (confirmed https://payhip.com/api-reference)',
    },
    {
      resource: 'collection',
      reason: 'No collection endpoint in Payhip REST API v2',
    },
    {
      resource: 'customer',
      reason: 'No customer endpoint in Payhip REST API v2',
    },
    {
      resource: 'order',
      reason:
        'No order endpoint in Payhip REST API v2; order data is only available via webhooks (paid / subscription.created events)',
    },
    {
      resource: 'fulfillment',
      reason: 'No fulfillment endpoint in Payhip REST API v2',
    },
    {
      resource: 'refund',
      reason:
        'No refund endpoint in Payhip REST API v2; refund data is only available via webhooks (refunded event)',
    },
    {
      resource: 'transaction',
      reason: 'No transaction endpoint in Payhip REST API v2',
    },
    {
      resource: 'inventory',
      reason: 'No inventory endpoint in Payhip REST API v2',
    },
    {
      resource: 'location',
      reason: 'No location endpoint in Payhip REST API v2',
    },
  ],
} as const

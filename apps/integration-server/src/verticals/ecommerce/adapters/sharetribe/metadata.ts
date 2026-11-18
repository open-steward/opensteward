export const metadata = {
  platform: 'sharetribe',
  totalResources: 10,
  availableResources: [
    'customer',
    'inventory',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Sharetribe has no collection/category concept in its Integration API',
    },
    {
      resource: 'discount',
      reason: 'No discount or coupon endpoints exist in the Sharetribe Integration API',
    },
    {
      resource: 'fulfillment',
      reason: 'Sharetribe is a peer-to-peer marketplace platform with no shipping fulfillment API',
    },
    {
      resource: 'location',
      reason: 'No warehouse or location concept; Sharetribe tracks stock at listing level only',
    },
    {
      resource: 'refund',
      reason: 'Refunds are operator actions inside the transaction process (Stripe full-refund only); no dedicated refund endpoint in Integration API',
    },
    {
      resource: 'transaction',
      reason: 'Canonical payment-ledger transactions are not exposed as a distinct resource; payin/payout data is embedded in Orders (Sharetribe transactions)',
    },
  ],
} as const

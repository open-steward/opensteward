export const metadata = {
  platform: 'jumia',
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
      reason:
        'Jumia has no user-mutable seller collections; the legacy GetCategoryTree endpoint belongs to the retired Seller Center API (HMAC, shut down July 2022) and is not available on the current Vendor Center OAuth2 API.',
    },
    {
      resource: 'customer',
      reason:
        'Jumia Vendor Center API exposes no buyer/customer data to sellers; customer information is marketplace-controlled.',
    },
    {
      resource: 'discount',
      reason:
        'Jumia has no promotions or discount code API for sellers; voucher promotions are managed exclusively through the Vendor Center UI.',
    },
    {
      resource: 'location',
      reason:
        'Jumia manages fulfilment warehouses internally; there is no seller-facing locations API on Vendor Center.',
    },
    {
      resource: 'refund',
      reason:
        'Refunds are handled via Jumia dispute resolution (UI only); the Vendor Center API exposes no refund endpoints.',
    },
    {
      resource: 'transaction',
      reason:
        'The Vendor Center API has no per-order financial transaction endpoints; GetPayoutStatus and GetMetrics (seller-level aggregates) exist only in the legacy Seller Center API.',
    },
  ],
} as const

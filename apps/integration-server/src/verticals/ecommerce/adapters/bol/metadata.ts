export const metadata = {
  platform: 'bol',
  totalResources: 10,
  availableResources: [
    'product',
    'inventory',
    'order',
    'fulfillment',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Bol.com marketplace has no user-mutable product collections; the Retailer API exposes no collections endpoint.',
    },
    {
      resource: 'customer',
      reason: 'Bol.com does not expose buyer/customer profile data via the Retailer API; buyer identity is kept private by the platform.',
    },
    {
      resource: 'discount',
      reason: 'Bol.com has no discount code or coupon API; the Promotions endpoint covers platform-managed campaigns only, not retailer-created discount codes.',
    },
    {
      resource: 'location',
      reason: 'Bol.com does not expose warehouse or fulfillment-center location data via the Retailer API.',
    },
    {
      resource: 'transaction',
      reason: 'Bol.com financial transaction data is available only through the Invoices endpoint (monthly billing summaries), not as individual order-level payment transactions.',
    },
  ],
} as const

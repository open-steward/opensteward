export const metadata = {
  platform: 'lazada',
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
      reason: 'Lazada exposes read-only taxonomy categories (/category/tree/get) but has no user-mutable seller collections.',
    },
    {
      resource: 'customer',
      reason: 'Lazada Open Platform has no buyer/customer data API; shopper PII is not exposed to sellers via the API.',
    },
    {
      resource: 'location',
      reason: 'Lazada manages warehouse locations internally; there is no seller-facing warehouse or location API.',
    },
    {
      resource: 'refund',
      reason: 'UNVERIFIED: /order/reverse/return/detail/list and related reverse-order endpoints are confirmed to exist in the Lazada Open Platform, but the JS-rendered documentation was inaccessible so response field names could not be verified.',
    },
    {
      resource: 'transaction',
      reason: 'UNVERIFIED: /finance/transaction/details/get and /finance/transaction/accountTransactions/query are confirmed to exist in the Lazada Open Platform, but the JS-rendered documentation was inaccessible so response field names could not be verified.',
    },
    {
      resource: 'discount',
      reason: 'UNVERIFIED: /promotion/voucher/create and /promotion/voucher/update are confirmed to exist in the Lazada Open Platform, but the JS-rendered documentation was inaccessible so request/response field names could not be verified.',
    },
  ],
} as const

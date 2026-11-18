export const metadata = {
  platform: 'hepsiburada',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'UNVERIFIED: Hepsiburada OMS has a real packages endpoint (GET /packages/merchantid/{merchantId} on oms-external.hepsiburada.com, confirmed by multiple independent PHP SDKs and official developer portal URL references), but all documentation pages return HTTP 403, preventing verification of the exact response JSON field schema needed to write a safe transform without fabricating field names.',
    },
    {
      resource: 'transaction',
      reason:
        'UNVERIFIED: The finance API\'s confirmed endpoint is GET /invoices/merchantid/{merchantId} (invoice reconciliation, not payment transactions). A /finance/merchant/transactions path appears in community PHP libraries but is not confirmed by official documentation (all developer portal pages return HTTP 403). Cannot verify response fields without risking fabrication.',
    },
  ],
} as const

export const metadata = {
  platform: 'payu',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'payout'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'No structured balance-transaction API; the /api/v2_1/statements endpoint returns CSV/PDF file downloads, not JSON records.',
    },
    {
      resource: 'customer',
      reason:
        'No general buyer/customer resource; buyer data is embedded inside each order. The /api/v2_1/customers/ext/... endpoints are marketplace seller-account only.',
    },
    {
      resource: 'dispute',
      reason: 'No disputes endpoint exists in the PayU REST API v2_1.',
    },
    {
      resource: 'invoice',
      reason:
        'No invoices endpoint; recurring payments reuse the orders endpoint with a recurring=FIRST/STANDARD flag.',
    },
    {
      resource: 'payment-method',
      reason:
        'GET /api/v2_1/paymethods returns merchant-wide available payment types for checkout display, not per-customer stored payment instruments.',
    },
    {
      resource: 'plan',
      reason: 'No subscription billing plans concept in the PayU REST API.',
    },
    {
      resource: 'subscription',
      reason:
        'No subscriptions endpoint; recurring billing is implemented via orders with recurring=FIRST/STANDARD, not a subscription lifecycle resource.',
    },
  ],
} as const

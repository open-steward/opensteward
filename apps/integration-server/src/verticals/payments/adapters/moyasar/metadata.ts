export const metadata = {
  platform: 'moyasar',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'invoice',
    'payout',
    'payment-method',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Moyasar exposes batch-level settlement records (GET /settlements) with no per-transaction balance-entry concept',
    },
    {
      resource: 'dispute',
      reason: 'No dispute or chargeback API documented in Moyasar REST API',
    },
    {
      resource: 'plan',
      reason: 'No subscription billing plans API; recurring payments are handled via stored tokens, not a plans API',
    },
    {
      resource: 'subscription',
      reason: 'No native subscription management API; WooCommerce plugin uses token-based recurrence only, no /subscriptions REST endpoint',
    },
  ],
} as const

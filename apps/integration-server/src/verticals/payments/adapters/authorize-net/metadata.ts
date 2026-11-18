export const metadata = {
  platform: 'authorize-net',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'payment-method',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Authorize.Net exposes only batch-level settlement summaries (getSettledBatchListRequest), not per-transaction fee/net records; no balance-transaction concept exists in the JSON API.',
    },
    {
      resource: 'dispute',
      reason:
        'Authorize.Net has no public API for dispute/chargeback retrieval; chargebacks are managed only via the merchant portal.',
    },
    {
      resource: 'invoice',
      reason:
        'Authorize.Net has no invoice resource or endpoint; merchants generate invoices outside the gateway.',
    },
    {
      resource: 'payout',
      reason:
        'Authorize.Net has no payout API; settlement funds are deposited automatically with no API-accessible payout objects.',
    },
    {
      resource: 'plan',
      reason:
        'Authorize.Net has no plan/product catalog API; ARB subscriptions are configured per-subscription with inline pricing, not via reusable plan objects.',
    },
  ],
} as const

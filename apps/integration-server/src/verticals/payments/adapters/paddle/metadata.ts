export const metadata = {
  platform: 'paddle',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'dispute',
    'invoice',
    'payment-method',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'No /balance-transactions endpoint; payout ledger data is only accessible via the payout_reconciliation report type (GET /reports), not a queryable REST resource.',
    },
    {
      resource: 'payout',
      reason:
        'No /payouts endpoint; payouts are only accessible via the payout_reconciliation report type (GET /reports), not a queryable REST resource.',
    },
  ],
} as const

export const metadata = {
  platform: 'iugu',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'dispute',
    'invoice',
    'payment-method',
    'payout',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Iugu has no per-transaction ledger endpoint; only account-level financial statements (GET /v1/accounts/financial) which do not map to the canonical BalanceTransaction schema.',
    },
  ],
} as const

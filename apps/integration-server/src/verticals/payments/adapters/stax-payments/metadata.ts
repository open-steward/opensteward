export const metadata = {
  platform: 'stax-payments',
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
        'Stax has no balance-transaction ledger endpoint; reporting is limited to daily-sales, card-processing, and statement summary endpoints that do not expose per-entry ledger records.',
    },
  ],
} as const

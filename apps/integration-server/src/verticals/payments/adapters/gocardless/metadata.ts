export const metadata = {
  platform: 'gocardless',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'payout',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'dispute',
      reason:
        'GoCardless has no disputes/chargebacks REST API endpoint; chargebacks surface only in the Protect+ dashboard UI and as payout_item debit line entries, not as a dedicated queryable resource.',
    },
  ],
} as const

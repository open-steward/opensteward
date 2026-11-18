export const metadata = {
  platform: 'pin-payments',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'dispute',
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
        'GET /balance returns only an aggregate balance figure; Pin Payments exposes no per-transaction ledger endpoint.',
    },
    {
      resource: 'invoice',
      reason:
        'Pin Payments has no invoice object; billing flows through Plans + Subscriptions with no invoice concept.',
    },
  ],
} as const

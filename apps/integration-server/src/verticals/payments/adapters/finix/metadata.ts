export const metadata = {
  platform: 'finix',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
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
      resource: 'invoice',
      reason:
        'Finix has no invoice API endpoint in its published REST spec (2022-02-01); the early-access invoice feature is not yet available via the API.',
    },
  ],
} as const

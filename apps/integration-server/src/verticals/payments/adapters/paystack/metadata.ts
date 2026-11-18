export const metadata = {
  platform: 'paystack',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'dispute',
    'invoice',
    'plan',
    'payout',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'payment-method',
      reason:
        'No standalone list/get endpoint for authorizations; card tokens are embedded in individual GET /customer/:id responses only and cannot be enumerated platform-wide.',
    },
  ],
} as const

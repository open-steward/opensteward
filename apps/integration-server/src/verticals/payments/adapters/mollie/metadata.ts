export const metadata = {
  platform: 'mollie',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'dispute',
    'invoice',
    'payment-method',
    'payout',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'plan',
      reason:
        'Mollie has no plan/pricing-template concept. Subscription billing parameters (amount, interval) are defined inline on the subscription object itself; there is no separate plans resource or endpoint.',
    },
  ],
} as const

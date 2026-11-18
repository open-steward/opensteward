export const metadata = {
  platform: 'xendit',
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
        'Xendit has no REST API for disputes/chargebacks; chargeback handling is an operational dashboard workflow only.',
    },
  ],
} as const

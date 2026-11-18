export const metadata = {
  platform: 'worldline',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'dispute',
    'payout',
    'payment-method',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason: 'No dedicated customer endpoint; customer data is embedded within tokens and payment objects',
    },
    {
      resource: 'balance-transaction',
      reason: 'No balance/ledger transaction concept in Worldline Direct',
    },
    {
      resource: 'invoice',
      reason: 'No invoice concept in Worldline Direct; it is a payment gateway, not a billing platform',
    },
    {
      resource: 'plan',
      reason: 'No subscription plan or product catalog in Worldline Direct',
    },
    {
      resource: 'subscription',
      reason: 'No subscription billing concept in Worldline Direct; recurring payments use Card On File tokens',
    },
  ],
} as const

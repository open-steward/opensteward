export const metadata = {
  platform: 'opn-payments',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'dispute',
    'payment-method',
    'payout',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason: 'Opn Payments has no invoice API; billing is handled via scheduled charges on the Schedule API',
    },
    {
      resource: 'plan',
      reason: 'No standalone plan/price/product objects; schedule charge sub-objects are not addressable as plans',
    },
  ],
} as const

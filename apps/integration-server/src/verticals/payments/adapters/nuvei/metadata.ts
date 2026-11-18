export const metadata = {
  platform: 'nuvei',
  totalResources: 10,
  availableResources: [
    'charge',
    'refund',
    'customer',
    'payment-method',
    'subscription',
    'plan',
    'payout',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'Nuvei REST 1.0 has no ledger/balance-transaction endpoint; settlement reporting is only accessible via the Control Panel.',
    },
    {
      resource: 'invoice',
      reason: 'Nuvei has no invoice concept in its S2S REST API; billing is subscription-based with no invoice objects.',
    },
    {
      resource: 'dispute',
      reason: 'Nuvei does not expose a chargeback/dispute REST API; disputes are managed exclusively through the Nuvei Control Panel.',
    },
  ],
} as const

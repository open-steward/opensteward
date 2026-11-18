export const metadata = {
  platform: 'nmi',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'subscription',
    'plan',
    'invoice',
    'payment-method',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'NMI has no balance/ledger query endpoint; settlement is batch-level via settlement-events webhooks only and not queryable via the Query API.',
    },
    {
      resource: 'payout',
      reason:
        'NMI settlement is batch-level (settlement-events webhook, get-settlement-time endpoint); there is no queryable payout listing in the Query API.',
    },
    {
      resource: 'dispute',
      reason:
        'NMI chargebacks are webhook-only notifications (chargeback-events); there is no queryable dispute/chargeback endpoint in the Query API.',
    },
  ],
} as const

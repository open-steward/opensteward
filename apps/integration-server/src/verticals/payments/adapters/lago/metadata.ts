export const metadata = {
  platform: 'lago',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payment-method',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Lago has no acquiring/ledger layer; balance transactions are a concept belonging to the external payment provider (e.g. Stripe), not Lago itself.',
    },
    {
      resource: 'dispute',
      reason:
        'Lago has no dispute management; chargebacks and disputes are handled entirely by the external payment provider.',
    },
    {
      resource: 'payout',
      reason:
        'Lago has no merchant payout/disbursement concept; payouts belong to the external payment provider, not Lago.',
    },
  ],
} as const

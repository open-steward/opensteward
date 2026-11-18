export const metadata = {
  platform: 'belvo',
  totalResources: 10,
  availableResources: [
    'balance-transaction',
    'charge',
    'customer',
    'invoice',
  ],
  unavailableResources: [
    {
      resource: 'dispute',
      reason: 'Belvo is a read-only banking aggregator; no chargeback or dispute concept exists.',
    },
    {
      resource: 'payment-method',
      reason: 'Belvo does not vault cards or bank accounts in a retrievable payment-method store.',
    },
    {
      resource: 'payout',
      reason: 'No payout or settlement disbursement concept; Belvo is not a payment processor.',
    },
    {
      resource: 'plan',
      reason: 'No subscription billing plans; Belvo has no billing engine.',
    },
    {
      resource: 'refund',
      reason: 'No refund concept; all data is read-only from bank statements.',
    },
    {
      resource: 'subscription',
      reason: 'No subscription billing; Recurring Expenses are bank-statement insights, not managed subscriptions.',
    },
  ],
} as const

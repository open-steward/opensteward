export const metadata = {
  platform: 'nowpayments',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'invoice',
    'payout',
    'plan',
    'refund',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'No balance transaction ledger API; NOWPayments has no general ledger endpoint for listing account-level transactions',
    },
    {
      resource: 'dispute',
      reason: 'Crypto transactions are irreversible by design; NOWPayments explicitly has no chargeback or dispute API',
    },
    {
      resource: 'payment-method',
      reason: 'NOWPayments accepts cryptocurrency addresses, not traditional card/bank payment methods; no payment method API exists',
    },
  ],
} as const

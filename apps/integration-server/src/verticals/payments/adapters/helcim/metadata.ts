export const metadata = {
  platform: 'helcim',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'invoice',
    'payment-method',
    'plan',
    'subscription',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason:
        'Helcim has no ledger or balance-transaction API; there is no endpoint for merchant-level balance or transaction ledger entries.',
    },
    {
      resource: 'dispute',
      reason:
        'Helcim has no chargeback or dispute API endpoint; chargebacks are handled outside the REST API.',
    },
    {
      resource: 'payout',
      reason:
        'Helcim has no merchant-accessible payout or disbursement API; funds are settled automatically through their acquiring bank with no API exposure.',
    },
  ],
} as const

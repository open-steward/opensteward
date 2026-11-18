export const metadata = {
  platform: 'mx',
  totalResources: 10,
  availableResources: [
    'charge',
    'customer',
    'refund',
    'payment-method',
  ],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'MX is a financial data aggregation platform with no gateway-ledger balance-transaction concept',
    },
    {
      resource: 'dispute',
      reason: 'MX has no chargeback or dispute system',
    },
    {
      resource: 'invoice',
      reason: 'MX has no invoice concept',
    },
    {
      resource: 'payout',
      reason: 'MX has no payout concept',
    },
    {
      resource: 'plan',
      reason: 'MX has no subscription billing plans',
    },
    {
      resource: 'subscription',
      reason: 'MX has no subscription concept',
    },
  ],
} as const
